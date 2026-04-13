'use strict';

const fs = require('node:fs');
const path = require('node:path');

const cwd = process.cwd();
let issues = 0;

function pass(msg) {
  process.stdout.write(`✓ ${msg}\n`);
}

function fail(msg, fix) {
  issues++;
  process.stdout.write(`✗ ${msg}\n`);
  if (fix) {
    process.stdout.write(`  → ${fix}\n`);
  }
}

function skip(msg) {
  process.stdout.write(`- ${msg}\n`);
}

// Check 1: Stylelint installed
function checkStylelint() {
  try {
    const stylelintPkg = require.resolve('stylelint/package.json', {
      paths: [cwd],
    });
    const version = require(stylelintPkg).version;
    pass(`stylelint installed (v${version})`);
    return true;
  } catch {
    fail(
      'stylelint not installed',
      'Run: npm install --save-dev stylelint',
    );
    return false;
  }
}

// Check 2: Config found
function findConfig() {
  const configFiles = [
    '.stylelintrc',
    '.stylelintrc.json',
    '.stylelintrc.js',
    '.stylelintrc.cjs',
    '.stylelintrc.mjs',
    '.stylelintrc.yml',
    '.stylelintrc.yaml',
    'stylelint.config.js',
    'stylelint.config.cjs',
    'stylelint.config.mjs',
  ];

  for (const file of configFiles) {
    const fullPath = path.join(cwd, file);
    if (fs.existsSync(fullPath)) {
      pass(`config found (${file})`);
      return fullPath;
    }
  }

  // Check package.json
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.stylelint) {
        pass('config found (package.json stylelint key)');
        return pkgPath;
      }
    } catch {
      // ignore
    }
  }

  fail(
    'no Stylelint config found',
    'Run: npx rhythmguard init',
  );
  return null;
}

// Check 3: Config references Rhythmguard
function checkConfigReferences(configPath) {
  if (!configPath) {
    skip('config reference check skipped (no config)');
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8');

    if (content.includes('rhythmguard')) {
      pass('config references rhythmguard');
      return content;
    }

    // Check package.json stylelint key
    if (configPath.endsWith('package.json')) {
      const pkg = JSON.parse(content);
      const stylelintConfig = JSON.stringify(pkg.stylelint || {});
      if (stylelintConfig.includes('rhythmguard')) {
        pass('config references rhythmguard');
        return stylelintConfig;
      }
    }

    fail(
      'config does not reference rhythmguard',
      'Add: "extends": ["stylelint-plugin-rhythmguard/configs/recommended"]',
    );
    return content;
  } catch {
    fail(
      'could not read config file',
      `Check permissions on ${configPath}`,
    );
    return null;
  }
}

// Check 4: Token pattern valid
function checkTokenPattern(configContent) {
  if (!configContent) {
    skip('token pattern check skipped (no config content)');
    return;
  }

  const patternMatch = configContent.match(
    /tokenPattern['":\s]+['"]([^'"]+)['"]/,
  );

  if (!patternMatch) {
    skip('token pattern check skipped (not configured)');
    return;
  }

  try {
    new RegExp(patternMatch[1]);
    pass(`token pattern valid (${patternMatch[1]})`);
  } catch {
    fail(
      `token pattern invalid: ${patternMatch[1]}`,
      'Fix the regex in tokenPattern option',
    );
  }
}

// Check 5: Tailwind config exists
function checkTailwindConfig(configContent) {
  if (!configContent) {
    skip('tailwind config check skipped (no config content)');
    return;
  }

  const tailwindPathMatch = configContent.match(
    /tailwindConfigPath['":\s]+['"]([^'"]+)['"]/,
  );

  if (!tailwindPathMatch) {
    skip('tailwind config check skipped (not configured)');
    return;
  }

  const tailwindPath = path.resolve(cwd, tailwindPathMatch[1]);
  if (fs.existsSync(tailwindPath)) {
    pass(`tailwind config found (${tailwindPathMatch[1]})`);
  } else {
    fail(
      `tailwind config not found at ${tailwindPathMatch[1]}`,
      'Update tailwindConfigPath or remove tokenMapFromTailwindSpacing',
    );
  }
}

// Check 6: Custom syntax installed
function checkCustomSyntax(configContent) {
  if (!configContent) {
    skip('custom syntax check skipped (no config content)');
    return;
  }

  const syntaxMatch = configContent.match(
    /customSyntax['":\s]+['"]([^'"]+)['"]/,
  );

  if (!syntaxMatch) {
    skip('custom syntax check skipped (not configured)');
    return;
  }

  const pkg = syntaxMatch[1];
  try {
    require.resolve(pkg, { paths: [cwd] });
    pass(`custom syntax installed (${pkg})`);
  } catch {
    fail(
      `custom syntax package not installed: ${pkg}`,
      `Run: npm install --save-dev ${pkg}`,
    );
  }
}

function run() {
  process.stdout.write('\nRhythmguard Doctor\n\n');

  const stylelintOk = checkStylelint();
  const configPath = findConfig();
  const configContent = checkConfigReferences(configPath);
  checkTokenPattern(configContent);
  checkTailwindConfig(configContent);
  checkCustomSyntax(configContent);

  process.stdout.write('\n');

  if (issues === 0) {
    process.stdout.write('All checks passed.\n\n');
  } else {
    process.stdout.write(
      `${issues} issue${issues === 1 ? '' : 's'} found.\n\n`,
    );
  }

  process.exit(stylelintOk && issues === 0 ? 0 : 1);
}

run();
