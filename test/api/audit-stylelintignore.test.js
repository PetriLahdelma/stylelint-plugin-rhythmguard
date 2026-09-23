'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createAuditReport, toAuditContractReport } = require('../../src/audit/index.js');

test('a project .stylelintignore that excludes every stylesheet is reported, not thrown', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-ignore-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src', 'app.css'), '.a { padding: 13px; }\n');
  fs.writeFileSync(path.join(dir, '.stylelintignore'), '**/*.css\n');
  const previousCwd = process.cwd();
  process.chdir(dir);
  try {
    const report = await createAuditReport({ dir: '.', noConfig: true, scale: [0, 4, 8, 12, 16] });
    const contract = toAuditContractReport(report);
    assert.equal(contract.scanned.cssFiles, 1, 'the file was found by the walk');
    assert.equal(contract.scanned.stylelintIgnored, 1, 'and Stylelint skipped it because of the project ignore file');
    assert.equal(contract.findings.css.length, 0);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
