/**
 * HTML evaluation report with charts (Chart.js)
 */

function escapeJson(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

function generateReportHtml(result) {
  const sim = result.similarityDistribution;
  const div = result.diversity;
  const dimBreakdown = result.dimensionBreakdown;

  const histogramLabels = Object.keys(sim.histogram).sort((a, b) => Number(a) - Number(b));
  const histogramData = histogramLabels.map((k) => sim.histogram[k]);
  const histogramLabelsDisplay = histogramLabels.map((k) => `${Number(k).toFixed(1)}–${(Number(k) + 0.1).toFixed(1)}`);

  const dimensionLabels = [];
  const dimensionAverages = [];
  if (dimBreakdown) {
    dimBreakdown.dimensionOrder.forEach((dim) => {
      dimensionLabels.push(dimBreakdown.breakdown[dim].label);
      dimensionAverages.push(Number(dimBreakdown.breakdown[dim].average.toFixed(4)));
    });
  }

  const data = {
    similarity: {
      labels: histogramLabelsDisplay,
      values: histogramData,
      stats: sim.stats
    },
    diversity: {
      labels: ['Cross-major', 'Cross-year', 'Common language', 'Cross-culture'],
      ratios: [
        Math.round(div.crossMajorRatio * 100),
        Math.round(div.crossYearRatio * 100),
        Math.round(div.commonLanguageRatio * 100),
        Math.round(div.crossCultureRatio * 100)
      ]
    },
    dimensionBreakdown: {
      labels: dimensionLabels,
      averages: dimensionAverages
    }
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LINKDKU Evaluation Report</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 24px; background: #f5f5f5; color: #1a1a1a; }
    .container { max-width: 900px; margin: 0 auto; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    .subtitle { color: #666; font-size: 14px; margin-bottom: 24px; }
    .card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); padding: 20px; margin-bottom: 20px; }
    .card h2 { margin: 0 0 16px; font-size: 16px; font-weight: 600; }
    .chart-wrap { position: relative; height: 260px; }
    .stats { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px; font-size: 13px; color: #555; }
    .stats span { background: #f0f0f0; padding: 4px 10px; border-radius: 6px; }
    .card-desc { margin: 0 0 12px; font-size: 13px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h1>LINKDKU Matching Algorithm Evaluation</h1>
    <p class="subtitle">Generated: ${new Date().toISOString()}</p>

    <div class="card">
      <h2>1. Similarity distribution (all user pairs)</h2>
      <div class="chart-wrap"><canvas id="chartSimilarity"></canvas></div>
      <div class="stats">
        <span>Mean: ${data.similarity.stats.mean}</span>
        <span>Median: ${data.similarity.stats.median}</span>
        <span>Std: ${data.similarity.stats.std}</span>
        <span>Min: ${data.similarity.stats.min}</span>
        <span>Max: ${data.similarity.stats.max}</span>
        <span>Pairs: ${sim.pairCount}</span>
      </div>
    </div>

    <div class="card">
      <h2>2. Similarity by dimension (matched pairs)</h2>
      <p class="card-desc">Average similarity in each dimension across current matches. Shows which aspects drive your pair scores.</p>
      <div class="chart-wrap"><canvas id="chartDimensions"></canvas></div>
    </div>

    <div class="card">
      <h2>3. Diversity metrics (DKU)</h2>
      <div class="chart-wrap"><canvas id="chartDiversity"></canvas></div>
    </div>
  </div>

  <script>
    const data = ${escapeJson(data)};

    Chart.defaults.color = '#555';
    Chart.defaults.borderColor = '#eee';

    new Chart(document.getElementById('chartSimilarity'), {
      type: 'bar',
      data: {
        labels: data.similarity.labels,
        datasets: [{
          label: 'Pair count',
          data: data.similarity.values,
          backgroundColor: 'rgba(40, 94, 168, 0.7)',
          borderColor: 'rgb(40, 94, 168)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'Count' } },
          x: { title: { display: true, text: 'Similarity range' } }
        }
      }
    });

    if (data.dimensionBreakdown && data.dimensionBreakdown.labels.length) {
      new Chart(document.getElementById('chartDimensions'), {
        type: 'bar',
        data: {
          labels: data.dimensionBreakdown.labels,
          datasets: [{
            label: 'Avg similarity',
            data: data.dimensionBreakdown.averages,
            backgroundColor: 'rgba(31, 140, 122, 0.7)',
            borderColor: 'rgb(31, 140, 122)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, max: 1, title: { display: true, text: 'Similarity' } },
            x: { title: { display: true, text: 'Dimension' } }
          }
        }
      });
    }

    new Chart(document.getElementById('chartDiversity'), {
      type: 'bar',
      data: {
        labels: data.diversity.labels,
        datasets: [{
          label: 'Ratio (%)',
          data: data.diversity.ratios,
          backgroundColor: 'rgba(49, 111, 210, 0.7)',
          borderColor: 'rgb(49, 111, 210)',
          borderWidth: 1
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, max: 100, title: { display: true, text: '%' } }
        }
      }
    });
  </script>
</body>
</html>`;

  return html;
}

module.exports = { generateReportHtml };
