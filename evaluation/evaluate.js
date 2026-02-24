/**
 * LinkDKU 匹配算法评估入口
 * 不修改原有代码，仅读取 data/ 数据（不足时自动生成 fake 数据），运行匹配并输出指标与 JSON。
 */

const path = require('path');
const fs = require('fs');
const storage = require('../src/storage');
const { runMatching } = require('../src/matching');
const {
  similarityDistribution,
  matchQuality,
  diversityMetrics,
  coverageMetrics,
  matchDimensionBreakdown
} = require('./metrics');
const { generateReportHtml } = require('./report-html');

const OUT_DIR = path.join(__dirname, 'output');

function ensureOutputDir() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
}

function ensureData() {
  let surveyRows = storage.getAllSurvey();
  if (surveyRows.length < 2) {
    console.log('Survey data insufficient (< 2), seeding fake accounts...');
    require('../scripts/seed-fake-accounts.js');
    surveyRows = storage.getAllSurvey();
  }
  if (surveyRows.length < 2) {
    throw new Error('Still insufficient survey data after seed. Need at least 2 responses.');
  }
  return surveyRows;
}

function runEvaluation(surveyRows) {
  const algorithmMatches = runMatching(surveyRows);

  const simDist = similarityDistribution(surveyRows);
  const quality = matchQuality(algorithmMatches);
  const diversity = diversityMetrics(surveyRows, algorithmMatches);
  const coverage = coverageMetrics(surveyRows, algorithmMatches);
  const dimensionBreakdown = matchDimensionBreakdown(surveyRows, algorithmMatches);

  return {
    similarityDistribution: simDist,
    matchQuality: quality,
    diversity: diversity,
    coverage: coverage,
    dimensionBreakdown,
    algorithmMatches,
    surveyRowCount: surveyRows.length
  };
}

function exportSimilarityDistribution(result) {
  const sim = result.similarityDistribution;
  const data = {
    stats: sim.stats,
    histogram: sim.histogram,
    pairCount: sim.pairCount
  };
  fs.writeFileSync(
    path.join(OUT_DIR, 'similarity_distribution.json'),
    JSON.stringify(data, null, 2),
    'utf8'
  );
}

function exportNetworkGraph(surveyRows, algorithmMatches) {
  const nodes = surveyRows.map((u) => ({
    id: u.netid,
    major: u.major,
    year: u.year,
    languages: u.languages || []
  }));
  const edges = algorithmMatches.map((m) => ({
    source: m.netidA,
    target: m.netidB,
    weight: m.score
  }));
  fs.writeFileSync(
    path.join(OUT_DIR, 'network_graph.json'),
    JSON.stringify({ nodes, edges }, null, 2),
    'utf8'
  );
}

function main() {
  ensureOutputDir();
  const surveyRows = ensureData();
  console.log(`Evaluating with ${surveyRows.length} survey responses.`);

  const result = runEvaluation(surveyRows);

  exportSimilarityDistribution(result);
  exportNetworkGraph(surveyRows, result.algorithmMatches);

  const reportHtmlPath = path.join(OUT_DIR, 'report.html');
  fs.writeFileSync(reportHtmlPath, generateReportHtml(result), 'utf8');
  console.log(`Chart report written to ${reportHtmlPath}`);

  console.log('Output files:', fs.readdirSync(OUT_DIR).join(', '));
}

main();
