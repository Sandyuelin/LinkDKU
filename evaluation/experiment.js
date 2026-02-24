/**
 * 可配置权重的匹配运行器（仅用于评估实验，不修改 src/matching.js）
 * 与 src/matching.js 逻辑一致，仅支持传入自定义 weights。
 */

const {
  DEFAULT_WEIGHTS,
  encodeUser,
  similarity,
  hasSharedLanguage
} = require('./metrics');

function buildPreferences(users, weights, topK = 10) {
  const prefs = new Map();
  const scores = new Map();
  users.forEach((u) => {
    const sharedLanguageCandidates = [];
    const fallbackCandidates = [];
    users.forEach((v) => {
      if (u.netid === v.netid) return;
      const s = similarity(u, v, weights);
      scores.set(`${u.netid}:${v.netid}`, s);
      if (hasSharedLanguage(u, v)) {
        sharedLanguageCandidates.push({ netid: v.netid, score: s });
      } else {
        fallbackCandidates.push({ netid: v.netid, score: s });
      }
    });
    const pool = sharedLanguageCandidates.length ? sharedLanguageCandidates : fallbackCandidates;
    pool.sort((a, b) => b.score - a.score);
    prefs.set(u.netid, pool.slice(0, topK).map((c) => c.netid));
  });
  return { prefs, scores };
}

function galeShapleyPairing(users, prefs, scores) {
  const free = [...users.map((u) => u.netid)];
  const proposals = new Map();
  const heldBy = new Map();
  free.forEach((id) => proposals.set(id, 0));

  while (free.length) {
    const proposer = free.shift();
    const list = prefs.get(proposer) || [];
    const pointer = proposals.get(proposer) || 0;
    if (pointer >= list.length) continue;

    const target = list[pointer];
    proposals.set(proposer, pointer + 1);

    if (!heldBy.has(target)) {
      heldBy.set(target, proposer);
      continue;
    }

    const current = heldBy.get(target);
    const currentScore = scores.get(`${target}:${current}`) || 0;
    const challengerScore = scores.get(`${target}:${proposer}`) || 0;
    if (challengerScore > currentScore) {
      heldBy.set(target, proposer);
      free.push(current);
    } else {
      free.push(proposer);
    }
  }

  const seen = new Set();
  const pairs = [];
  for (const [target, proposer] of heldBy.entries()) {
    const a = [target, proposer].sort().join('::');
    if (seen.has(a)) continue;
    seen.add(a);
    const score = ((scores.get(`${target}:${proposer}`) || 0) + (scores.get(`${proposer}:${target}`) || 0)) / 2;
    pairs.push({ a: target, b: proposer, score });
  }
  pairs.sort((x, y) => y.score - x.score);
  return pairs;
}

/**
 * 使用自定义权重运行匹配，返回与 runMatching 相同格式的数组
 */
function runMatchingWithWeights(rawUsers, weights = DEFAULT_WEIGHTS) {
  const users = rawUsers.map((u) => encodeUser(u, weights));
  const { prefs, scores } = buildPreferences(users, weights);
  const pairs = galeShapleyPairing(users, prefs, scores);
  return pairs.map((p) => ({
    netidA: p.a,
    netidB: p.b,
    score: Number(p.score.toFixed(4))
  }));
}

module.exports = {
  runMatchingWithWeights,
  buildPreferences,
  galeShapleyPairing
};
