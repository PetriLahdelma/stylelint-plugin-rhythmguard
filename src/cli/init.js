'use strict';

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function detect() {
  const cwd = process.cwd();
  const pkgPath = path.join(cwd, 'package.json');

  let pkg = {};
  if (fs.existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    } catch {
      // ignore
    }
  }

  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };

  const hasTailwindConfig =
    fs.existsSync(path.join(cwd, 'tailwind.config.js')) ||
    fs.existsSync(path.join(cwd, 'tailwind.config.cjs')) ||
    fs.existsSync(path.join(cwd, 'tailwind.config.mjs')) ||
    fs.existsSync(path.join(cwd, 'tailwind.config.ts'));

  const hasTailwindDep = Boolean(
    allDeps.tailwindcss || allDeps['@tailwindcss/postcss'],
  );

  const hasNextConfig =
    fs.existsSync(path.join(cwd, 'next.config.js')) ||
    fs.existsSync(path.join(cwd, 'next.config.mjs')) ||
    fs.existsSync(path.join(cwd, 'next.config.ts'));

  const hasExistingConfig =
    fs.existsSync(path.join(cwd, '.stylelintrc')) ||
    fs.existsSync(path.join(cwd, '.stylelintrc.json')) ||
    fs.existsSync(path.join(cwd, '.stylelintrc.js')) ||
    fs.existsSync(path.join(cwd, '.stylelintrc.cjs')) ||
    fs.existsSync(path.join(cwd, '.stylelintrc.mjs')) ||
    fs.existsSync(path.join(cwd, '.stylelintrc.yml')) ||
    fs.existsSync(path.join(cwd, '.stylelintrc.yaml')) ||
    fs.existsSync(path.join(cwd, 'stylelint.config.js')) ||
    fs.existsSync(path.join(cwd, 'stylelint.config.cjs')) ||
    fs.existsSync(path.join(cwd, 'stylelint.config.mjs')) ||
    Boolean(pkg.stylelint);

  const tailwind = hasTailwindConfig || hasTailwindDep;
  const nextjs = hasNextConfig;

  return { tailwind, nextjs, hasExistingConfig };
}

function selectProfile(stack) {
  if (stack.nextjs && stack.tailwind) {
    return 'react-tailwind';
  }
  if (stack.tailwind) {
    return 'tailwind';
  }
  return 'recommended';
}

async function run() {
  process.stdout.write('\nRhythmguard Init\n\n');

  const stack = detect();

  // Report detection
  const detected = [];
  if (stack.tailwind) detected.push('Tailwind CSS');
  if (stack.nextjs) detected.push('Next.js');
  if (detected.length > 0) {
    process.stdout.write(`Detected: ${detected.join(', ')}\n`);
  } else {
    process.stdout.write('Detected: plain CSS project\n');
  }

  // Warn about existing config
  if (stack.hasExistingConfig) {
    process.stdout.write('\n⚠ Existing Stylelint config found.\n');
    const answer = await ask('Overwrite? (y/n) ');
    if (answer !== 'y' && answer !== 'yes') {
      process.stdout.write('Aborted.\n');
      process.exit(0);
    }
  }

  const profile = selectProfile(stack);
  process.stdout.write(`\nProfile: ${profile}\n`);

  const answer = await ask('Write .stylelintrc.json? (y/n) ');
  if (answer !== 'y' && answer !== 'yes') {
    process.stdout.write('Aborted.\n');
    process.exit(0);
  }

  const config = {
    extends: [`stylelint-plugin-rhythmguard/configs/${profile}`],
  };

  const configPath = path.join(process.cwd(), '.stylelintrc.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

  process.stdout.write(`\n✓ Wrote ${configPath}\n`);
  process.stdout.write(`\nNext steps:\n`);
  process.stdout.write(`  npx stylelint "src/**/*.css"\n\n`);
}

run();
