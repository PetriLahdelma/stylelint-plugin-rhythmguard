'use strict';

const { toAuditContractReport } = require('./contract');
const { escapeHtml } = require('./render-utils');

function renderHtml(report) {
  const contractReport = toAuditContractReport(report);
  const lines = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Rhythmguard Design-System Audit</title>',
    '<style>',
    'body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;color:#171717;background:#fafafa;}',
    'main{max-width:1040px;margin:0 auto;padding:32px 20px;}',
    'h1,h2{line-height:1.2;}',
    '.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;}',
    '.metric{border:1px solid #ddd;background:#fff;padding:14px;border-radius:6px;}',
    '.metric strong{display:block;font-size:28px;}',
    'table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #ddd;}',
    'th,td{padding:10px;border-bottom:1px solid #eee;text-align:left;}',
    'code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}',
    '</style>',
    '</head>',
    '<body>',
    '<main>',
    '<h1>Rhythmguard Design-System Audit</h1>',
    `<p>Directory: <code>${escapeHtml(contractReport.command.directory)}</code></p>`,
    '<section class="grid">',
    metricHtml('Total findings', report.totalWarnings),
    metricHtml('Scale cleanliness', `${report.scaleCleanliness}%`),
    metricHtml('CSS files', report.cssFilesScanned),
    metricHtml('Template files', report.templateFilesScanned),
    '</section>',
    renderHtmlTable('CSS Off-Scale Properties', ['Property', 'Count'], Object.entries(report.offScaleProperties || {})),
    renderHtmlTable('Top Affected Files', ['File', 'Findings'], report.topAffectedFiles.map(({ file, count }) => [file, count])),
    renderHtmlTable('Token Contract Sources', ['File', 'Format', 'Tokens'], report.tokenContract.sources.map((source) => [
      source.file,
      source.format,
      source.tokenCount,
    ])),
    renderHtmlTable('Motion Rhythm Drift', ['Value', 'Count'], Object.entries(report.motion.values)),
    '<h2>Machine JSON</h2>',
    `<pre><code>${escapeHtml(JSON.stringify(contractReport, null, 2))}</code></pre>`,
    '</main>',
    '</body>',
    '</html>',
  ];

  return `${lines.join('\n')}\n`;
}

function metricHtml(label, value) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderHtmlTable(title, headers, rows) {
  if (rows.length === 0) {
    return '';
  }

  return [
    `<h2>${escapeHtml(title)}</h2>`,
    '<table>',
    `<thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>`,
    '<tbody>',
    ...rows.map((row) => `<tr>${row.map((cell) => `<td><code>${escapeHtml(cell)}</code></td>`).join('')}</tr>`),
    '</tbody>',
    '</table>',
  ].join('\n');
}

module.exports = {
  metricHtml,
  renderHtml,
  renderHtmlTable,
};
