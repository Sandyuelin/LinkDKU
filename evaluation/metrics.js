/**
 * 评估指标计算（不依赖修改 src/matching.js，本地复制必要常量与相似度逻辑用于统计）
 * 与 src/matching.js 保持一致的编码与权重，仅用于评估与对比。
 */

const DEFAULT_WEIGHTS = {
  interests: 0.35,
  socialStyle: 0.35,
  openness: 0.15,
  background: 0.15
};

const MAJORS = ['Natural Sciences', 'Social Sciences', 'Arts and Humanities'];
const YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate'];
const LANGUAGES = ['English', 'Chinese', 'Spanish', 'German', 'Japanese', 'Korean'];
const STYLE_KEYS = ['planningStyle', 'socialEnergy', 'communicationStyle', 'conversationPreference', 'decisionMaking', 'conflictHandling', 'emotionalSharing'];
const INTERESTS = ['Performing arts', 'Research / academic discussion', 'Sports / fitness', 'Volunteering', 'Entrepreneurship', 'Social events', 'Gaming / online communities'];
const LOOKING_FOR = ['Activity partner', 'Close friendship', 'Academic partner', 'Networking / career', 'Casual socializing'];
const QUALITIES = ['Reliability', 'Humor', 'Emotional support', 'Intellectual discussion', 'Shared hobbies', 'Adventurousness'];

function oneHot(value, choices) {
  return choices.map((x) => (x === value ? 1 : 0));
}

function multiHot(values, choices) {
  const set = new Set(Array.isArray(values) ? values : []);
  return choices.map((x) => (set.has(x) ? 1 : 0));
}

function normalizeLikert(v) {
  const n = Number(v || 1);
  return Math.max(1, Math.min(5, n));
}

function normalize01(v) {
  return (normalizeLikert(v) - 1) / 4;
}

function cosine(a, b) {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  if (!aa || !bb) return 0;
  return dot / (Math.sqrt(aa) * Math.sqrt(bb));
}

function encodeUser(u, weights = DEFAULT_WEIGHTS) {
  const socialStyle = STYLE_KEYS.map((k) => normalize01(u[k]));
  const openness = [normalize01(u.dkuOpenness), normalize01(u.interactionStyle), normalize01(u.opennessToNewActivities)];
  return {
    netid: u.netid,
    major: u.major,
    year: u.year,
    languageSet: new Set(u.languages || []),
    dkuOpenness: Number(u.dkuOpenness) || 3,
    groups: {
      interests: [
        ...multiHot(u.activityInterests, INTERESTS),
        ...multiHot(u.lookingFor, LOOKING_FOR),
        ...multiHot(u.qualities, QUALITIES)
      ],
      socialStyle,
      openness,
      background: [
        ...oneHot(u.major, MAJORS),
        ...oneHot(u.year, YEARS),
        ...multiHot(u.languages, LANGUAGES)
      ]
    },
    original: u
  };
}

function similarity(a, b, weights = DEFAULT_WEIGHTS) {
  const gA = a.groups;
  const gB = b.groups;
  let score = 0;
  let weightSum = 0;
  Object.entries(weights).forEach(([k, w]) => {
    score += w * cosine(gA[k], gB[k]);
    weightSum += w;
  });
  return weightSum ? score / weightSum : 0;
}

function hasSharedLanguage(a, b) {
  for (const lang of a.languageSet) {
    if (b.languageSet.has(lang)) return true;
  }
  return false;
}

/** 所有用户对的相似度（无序，每对只算一次） */
function allPairSimilarities(rawUsers, weights = DEFAULT_WEIGHTS) {
  const users = rawUsers.map((u) => encodeUser(u, weights));
  const pairs = [];
  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < users.length; j++) {
      const s = similarity(users[i], users[j], weights);
      pairs.push({ netidA: users[i].netid, netidB: users[j].netid, similarity: s });
    }
  }
  return { encodedUsers: users, pairs };
}

function basicStats(values) {
  if (!values.length) return { mean: 0, median: 0, std: 0, min: 0, max: 0, count: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;
  const median = sorted.length % 2 === 1
    ? sorted[(sorted.length - 1) / 2]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  return {
    mean: Number(mean.toFixed(4)),
    median: Number(median.toFixed(4)),
    std: Number(std.toFixed(4)),
    min: Number(sorted[0].toFixed(4)),
    max: Number(sorted[sorted.length - 1].toFixed(4)),
    count: values.length
  };
}

/** 相似度分布统计 */
function similarityDistribution(rawUsers, weights = DEFAULT_WEIGHTS) {
  const { pairs } = allPairSimilarities(rawUsers, weights);
  const values = pairs.map((p) => p.similarity);
  const stats = basicStats(values);
  const histogram = {};
  values.forEach((v) => {
    const bin = Math.min(9, Math.floor(v * 10)) / 10;
    const key = Number(bin.toFixed(1));
    histogram[key] = (histogram[key] || 0) + 1;
  });
  return { stats, histogram: histogram, pairCount: pairs.length };
}

/** 匹配质量：匹配对的分数分布与平均分 */
function matchQuality(matches) {
  const scores = matches.map((m) => m.score);
  return {
    averageScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
    stats: basicStats(scores),
    matchCount: matches.length
  };
}

/** 多样性：跨专业、跨年级、共同语言、跨文化（两人 dkuOpenness 均高且专业/年级不同） */
function diversityMetrics(rawUsers, matches) {
  const byNetid = new Map(rawUsers.map((u) => [u.netid, u]));
  let crossMajor = 0, crossYear = 0, commonLanguage = 0, crossCulture = 0;
  const encoded = rawUsers.map((u) => encodeUser(u));

  matches.forEach((m) => {
    const ua = byNetid.get(m.netidA);
    const ub = byNetid.get(m.netidB);
    const ea = encoded.find((e) => e.netid === m.netidA);
    const eb = encoded.find((e) => e.netid === m.netidB);
    if (!ua || !ub || !ea || !eb) return;

    if (ua.major !== ub.major) crossMajor += 1;
    if (ua.year !== ub.year) crossYear += 1;
    if (hasSharedLanguage(ea, eb)) commonLanguage += 1;
    const openA = normalizeLikert(ua.dkuOpenness) >= 4;
    const openB = normalizeLikert(ub.dkuOpenness) >= 4;
    if ((openA || openB) && (ua.major !== ub.major || ua.year !== ub.year)) crossCulture += 1;
  });

  const n = matches.length;
  return {
    crossMajorRatio: n ? Number((crossMajor / n).toFixed(4)) : 0,
    crossYearRatio: n ? Number((crossYear / n).toFixed(4)) : 0,
    commonLanguageRatio: n ? Number((commonLanguage / n).toFixed(4)) : 0,
    crossCultureRatio: n ? Number((crossCulture / n).toFixed(4)) : 0,
    crossMajorCount: crossMajor,
    crossYearCount: crossYear,
    commonLanguageCount: commonLanguage,
    crossCultureCount: crossCulture,
    totalPairs: n
  };
}

/** 覆盖率：被匹配用户数 / 总用户数 */
function coverageMetrics(rawUsers, matches) {
  const matched = new Set();
  matches.forEach((m) => {
    matched.add(m.netidA);
    matched.add(m.netidB);
  });
  const total = rawUsers.length;
  const matchedCount = matched.size;
  const unmatchedCount = total - matchedCount;
  return {
    totalUsers: total,
    matchedUsers: matchedCount,
    unmatchedUsers: unmatchedCount,
    coveragePercent: total ? Number(((matchedCount / total) * 100).toFixed(2)) : 0
  };
}

/** 当前匹配对在各维度上的相似度分解（interests, socialStyle, openness, background） */
function matchDimensionBreakdown(rawUsers, matches) {
  const users = rawUsers.map((u) => encodeUser(u));
  const byNetid = new Map(users.map((u) => [u.netid, u]));
  const dims = ['interests', 'socialStyle', 'openness', 'background'];
  const dimLabels = { interests: 'Interests', socialStyle: 'Social style', openness: 'Openness', background: 'Background' };
  const values = { interests: [], socialStyle: [], openness: [], background: [] };

  matches.forEach((m) => {
    const a = byNetid.get(m.netidA);
    const b = byNetid.get(m.netidB);
    if (!a || !b) return;
    dims.forEach((dim) => {
      values[dim].push(cosine(a.groups[dim], b.groups[dim]));
    });
  });

  const breakdown = {};
  dims.forEach((dim) => {
    const v = values[dim];
    breakdown[dim] = {
      label: dimLabels[dim],
      average: v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0,
      stats: basicStats(v)
    };
  });
  return { breakdown, dimensionOrder: dims };
}

/** 随机匹配：多次随机配对取平均相似度 */
function randomMatchScores(rawUsers, weights = DEFAULT_WEIGHTS, iterations = 50) {
  const { encodedUsers, pairs } = allPairSimilarities(rawUsers, weights);
  const scoreMap = new Map();
  pairs.forEach((p) => {
    const key = [p.netidA, p.netidB].sort().join('::');
    scoreMap.set(key, p.similarity);
  });

  const netids = rawUsers.map((u) => u.netid);
  const getScore = (a, b) => scoreMap.get([a, b].sort().join('::')) ?? 0;

  let sumAvg = 0;
  for (let iter = 0; iter < iterations; iter++) {
    const shuffled = [...netids].sort(() => Math.random() - 0.5);
    let pairSum = 0;
    let pairCount = 0;
    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      pairSum += getScore(shuffled[i], shuffled[i + 1]);
      pairCount += 1;
    }
    if (pairCount) sumAvg += pairSum / pairCount;
  }
  const randomAvg = iterations ? sumAvg / iterations : 0;
  return { randomAverageSimilarity: Number(randomAvg.toFixed(4)), iterations };
}

/** 算法 vs 随机对比 */
function algorithmVsRandom(algorithmMatches, rawUsers, weights = DEFAULT_WEIGHTS, randomIterations = 50) {
  const algoScores = algorithmMatches.map((m) => m.score);
  const algoAvg = algoScores.length ? algoScores.reduce((a, b) => a + b, 0) / algoScores.length : 0;
  const { randomAverageSimilarity, iterations } = randomMatchScores(rawUsers, weights, randomIterations);
  const improvement = randomAverageSimilarity ? ((algoAvg - randomAverageSimilarity) / randomAverageSimilarity) * 100 : 0;
  return {
    algorithmAverageSimilarity: Number(algoAvg.toFixed(4)),
    randomAverageSimilarity,
    improvementPercent: Number(improvement.toFixed(2)),
    randomIterations: iterations
  };
}

module.exports = {
  DEFAULT_WEIGHTS,
  encodeUser,
  similarity,
  hasSharedLanguage,
  allPairSimilarities,
  basicStats,
  similarityDistribution,
  matchQuality,
  diversityMetrics,
  coverageMetrics,
  matchDimensionBreakdown,
  randomMatchScores,
  algorithmVsRandom
};
