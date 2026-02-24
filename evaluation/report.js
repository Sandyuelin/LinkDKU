/**
 * Evaluation report text generation
 */

function generateReport(result) {
  const lines = [];
  const sim = result.similarityDistribution;
  const quality = result.matchQuality;
  const div = result.diversity;
  const cov = result.coverage;

  lines.push('========================================');
  lines.push('  LINKDKU Matching Algorithm Evaluation Report');
  lines.push('========================================');
  lines.push('');

  lines.push('1. Data scale');
  lines.push(`  Survey responses: ${result.surveyRowCount}`);
  lines.push(`  Algorithm match pairs: ${result.algorithmMatches.length}`);
  lines.push('');

  lines.push('2. Similarity distribution (all user pairs)');
  lines.push(`  Pair count: ${sim.pairCount}`);
  lines.push(`  Mean: ${sim.stats.mean}`);
  lines.push(`  Median: ${sim.stats.median}`);
  lines.push(`  Std dev: ${sim.stats.std}`);
  lines.push(`  Min: ${sim.stats.min}`);
  lines.push(`  Max: ${sim.stats.max}`);
  lines.push('  Note: Higher spread (std) indicates better algorithm discriminative power.');
  lines.push('');

  lines.push('3. Match quality');
  lines.push(`  Average similarity of matched pairs: ${quality.averageScore.toFixed(4)}`);
  lines.push(`  Score mean: ${quality.stats.mean}`);
  lines.push(`  Score median: ${quality.stats.median}`);
  lines.push(`  Score std dev: ${quality.stats.std}`);
  lines.push('');

  lines.push('4. Diversity metrics (DKU)');
  lines.push(`  Cross-major match ratio: ${(div.crossMajorRatio * 100).toFixed(2)}% (${div.crossMajorCount}/${div.totalPairs})`);
  lines.push(`  Cross-year match ratio: ${(div.crossYearRatio * 100).toFixed(2)}% (${div.crossYearCount}/${div.totalPairs})`);
  lines.push(`  Common-language match ratio: ${(div.commonLanguageRatio * 100).toFixed(2)}% (${div.commonLanguageCount}/${div.totalPairs})`);
  lines.push(`  Cross-culture match ratio: ${(div.crossCultureRatio * 100).toFixed(2)}% (${div.crossCultureCount}/${div.totalPairs})`);
  lines.push('');

  lines.push('5. Coverage');
  lines.push(`  Total users: ${cov.totalUsers}`);
  lines.push(`  Matched users: ${cov.matchedUsers}`);
  lines.push(`  Unmatched users: ${cov.unmatchedUsers}`);
  lines.push(`  Coverage: ${cov.coveragePercent}%`);
  lines.push('');

  const dimBreakdown = result.dimensionBreakdown;
  if (dimBreakdown) {
    lines.push('6. Similarity breakdown by dimension (matched pairs)');
    lines.push('   Average similarity in each dimension across current matches:');
    dimBreakdown.dimensionOrder.forEach((dim) => {
      const d = dimBreakdown.breakdown[dim];
      lines.push(`   ${d.label}: ${d.average.toFixed(4)} (min: ${d.stats.min}, max: ${d.stats.max})`);
    });
    lines.push('   Note: Shows which dimensions contribute most to your current pair scores.');
    lines.push('');
  }

  lines.push(dimBreakdown ? '7. Interpretation and recommendations' : '6. Interpretation and recommendations');
  if (sim.stats.std < 0.1) {
    lines.push('  - Similarity distribution is narrow; consider adding more discriminative features or weights.');
  }
  if (div.commonLanguageRatio < 0.5) {
    lines.push('  - Common-language match ratio is low; consider relaxing language constraints to encourage cross-language pairing.');
  }
  if (cov.coveragePercent < 90 && cov.totalUsers > 2) {
    lines.push('  - Some users remain unmatched; check preference list length or Gale–Shapley implementation.');
  }
  lines.push('');

  lines.push('========================================');
  lines.push(`  Report generated: ${new Date().toISOString()}`);
  lines.push('========================================');

  return lines.join('\n');
}

module.exports = { generateReport };
