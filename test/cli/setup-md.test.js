'use strict';

/**
 * docs/SETUP.md is a page an agent executes (pos-06, dc-02, docs-02), so this
 * test executes it: every fenced block marked `setup=<branch>` runs, in page
 * order, in three scratch projects (plain CSS with tokens, Tailwind v4, and an
 * ESLint-only TSX app), each taking the branches SETUP.md's table assigns it.
 *
 * No network. `npm install` lines are not run; instead each scratch project
 * gets exactly the packages its branches' install lines name, resolved from
 * this checkout, so a package SETUP.md forgets to install is missing here too.
 * `npx <bin>` runs the bin from the scratch project's node_modules, except
 * `npx rhythmguard`, which runs this checkout's CLI as npx would fetch it.
 * typescript-eslint is not a dependency of this repository; its stand-in is
 * espree with JSX, which parses the type-free TSX these projects hold.
 *
 * Block attributes: `file=<path>` writes the block to that file; `expect=<text>`
 * means the command reports findings (exit 0, 1 or 2) and its output contains
 * the text; `gate` marks a CI gate, run again after a change adds an off-scale
 * value, when it must fail.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..', '..');
const { peerDependencies } = require('../../package.json');

const SETUP = fs.readFileSync(path.join(root, 'docs', 'SETUP.md'), 'utf8');

function parseBlocks(markdown) {
  const blocks = [];
  for (const match of markdown.matchAll(/^```(\w+) ([^\n]*)\n([\s\S]*?)^```$/gm)) {
    const attrs = {};
    for (const token of match[2].trim().split(/\s+/)) {
      const [key, ...rest] = token.split('=');
      attrs[key] = rest.length > 0 ? rest.join('=') : true;
    }
    if (attrs.setup) blocks.push({ attrs, body: match[3], lang: match[1] });
  }
  return blocks;
}

const BLOCKS = parseBlocks(SETUP);
const QUOTED_ESLINT_FINDING = SETUP.match(/comes back as `([^`]+)`/)[1];

const STACKS = {
  'plain CSS with tokens': {
    branches: ['all', 'stylelint'],
    files: {
      'package.json': '{"name":"css-app","private":true}\n',
      'src/tokens.css': ':root { --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-6: 24px; }\n',
      'src/app.css': '.card { padding: var(--space-3); margin: 13px; }\n',
    },
    drift: { 'src/new.css': '.new { padding: 17px; }\n' },
  },
  'Tailwind v4': {
    branches: ['all', 'stylelint', 'stylelint-tailwind', 'eslint', 'eslint-typescript'],
    files: {
      'package.json': '{"name":"tw-app","private":true,"type":"module","dependencies":{"tailwindcss":"^4.3.0"}}\n',
      'src/app.css': '@import "tailwindcss";\n\n.hero { margin: 13px; }\n',
      'src/components/Button.tsx': 'export const Button = () => <button className="p-[13px] gap-4" />;\n',
    },
    drift: {
      'src/new.css': '.new { padding: 17px; }\n',
      'src/components/New.tsx': 'export const New = () => <div className="m-[17px]" />;\n',
    },
  },
  'ESLint-only TSX': {
    branches: ['all', 'eslint', 'eslint-typescript'],
    files: {
      'package.json': '{"name":"eslint-app","private":true,"type":"module","dependencies":{"tailwindcss":"^4.3.0"}}\n',
      'src/app.css': '@import "tailwindcss";\n',
      'src/components/Card.tsx': 'export const Card = () => <div className="p-[13px] m-2" />;\n',
    },
    drift: { 'src/components/New.tsx': 'export const New = () => <div className="m-[17px]" />;\n' },
  },
};

function blocksFor(branches) {
  return BLOCKS.filter((block) => branches.includes(block.attrs.setup));
}

function commandLines(block) {
  return block.body.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
}

/** The package names the branches' `npm install` lines install. */
function installedPackages(blocks) {
  return blocks
    .filter((block) => block.lang === 'bash')
    .flatMap(commandLines)
    .filter((line) => line.startsWith('npm install'))
    .flatMap((line) => line.replace(/^npm install --save-dev /, '').match(/"[^"]+"|\S+/g))
    .map((spec) => spec.replace(/^"|"$/g, '').replace(/^(@?[^@]+)@.*$/, '$1'));
}

function link(target, from) {
  fs.mkdirSync(path.dirname(from), { recursive: true });
  fs.symlinkSync(target, from, 'dir');
}

/** node_modules with the packages SETUP.md installs, and their dependencies, from this checkout. */
function provide(dir, packages) {
  const modules = path.join(dir, 'node_modules');
  const fromCheckout = (name) => link(path.join(root, 'node_modules', name), path.join(modules, name));
  for (const name of packages) {
    if (['stylelint', 'stylelint-config-tailwindcss', 'postcss-scss', 'eslint'].includes(name)) {
      fromCheckout(name);
    } else if (name === 'stylelint-plugin-rhythmguard') {
      if (!fs.existsSync(path.join(modules, name))) link(root, path.join(modules, name));
    } else if (name === 'eslint-plugin-rhythmguard') {
      // A real directory, as npm installs it, so its require of the plugin
      // resolves from this project's node_modules, where npm puts its dependency.
      const target = path.join(modules, name);
      fs.mkdirSync(target, { recursive: true });
      for (const file of ['package.json', 'index.js', 'index.mjs']) {
        fs.copyFileSync(path.join(root, 'packages', name, file), path.join(target, file));
      }
      if (!fs.existsSync(path.join(modules, 'stylelint-plugin-rhythmguard'))) link(root, path.join(modules, 'stylelint-plugin-rhythmguard'));
    } else if (name === 'typescript-eslint') {
      const target = path.join(modules, name);
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(path.join(target, 'package.json'), '{"name":"typescript-eslint","version":"0.0.0-test","main":"index.js"}\n');
      fs.writeFileSync(path.join(target, 'index.js'), [
        `const espree = require(${JSON.stringify(path.join(root, 'node_modules', 'espree'))});`,
        'const options = { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, range: true, loc: true, tokens: true, comment: true };',
        'module.exports = { parser: { meta: { name: "typescript-eslint-stand-in" }, parse: (code) => espree.parse(code, options) } };',
        '',
      ].join('\n'));
    } else {
      assert.fail(`SETUP.md installs ${name}, which this test does not know how to provide`);
    }
  }
}

/** An `npx` on PATH that runs local bins, and this checkout's CLI for rhythmguard. */
function npxShim(dir) {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-setup-bin-'));
  const node = JSON.stringify(process.execPath);
  fs.writeFileSync(path.join(bin, 'npx'), [
    '#!/bin/sh',
    'name="$1"; shift',
    'case "$name" in',
    `  rhythmguard) exec ${node} ${JSON.stringify(path.join(root, 'src', 'cli', 'index.js'))} "$@" ;;`,
    `  stylelint) exec ${node} ${JSON.stringify(path.join(dir, 'node_modules', 'stylelint', 'bin', 'stylelint.mjs'))} "$@" ;;`,
    `  eslint) exec ${node} ${JSON.stringify(path.join(dir, 'node_modules', 'eslint', 'bin', 'eslint.js'))} "$@" ;;`,
    '  *) echo "npx $name is not available in this test" >&2; exit 127 ;;',
    'esac',
    '',
  ].join('\n'), { mode: 0o755 });
  return bin;
}

function run(dir, bin, line) {
  const result = spawnSync('/bin/sh', ['-c', line], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', PATH: `${bin}${path.delimiter}${process.env.PATH}` },
    input: '',
  });
  return { ...result, output: `${result.stdout}${result.stderr}` };
}

function write(dir, files) {
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  }
}

const skip = process.platform === 'win32' ? 'runs SETUP.md commands through /bin/sh' : false;

test('SETUP.md marks blocks for every branch its table names', () => {
  const branches = new Set(BLOCKS.map((block) => block.attrs.setup));
  assert.deepEqual([...branches].sort(), ['all', 'eslint', 'eslint-typescript', 'stylelint', 'stylelint-tailwind']);
  const stylelintInstall = blocksFor(['stylelint']).flatMap(commandLines).find((line) => line.startsWith('npm install'));
  assert.equal(stylelintInstall, `npm install --save-dev "stylelint@${peerDependencies.stylelint}" stylelint-plugin-rhythmguard`, 'the install line names the peer range package.json declares');
  assert.ok(BLOCKS.some((block) => block.attrs.gate && block.attrs.setup === 'stylelint'));
  assert.ok(BLOCKS.some((block) => block.attrs.gate && block.attrs.setup === 'eslint'));
});

for (const [name, stack] of Object.entries(STACKS)) {
  test(`SETUP.md runs end to end on ${name}`, { skip }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-setup-'));
    write(dir, stack.files);
    const blocks = blocksFor(stack.branches);
    provide(dir, installedPackages(blocks));
    const bin = npxShim(dir);

    const gates = [];
    for (const block of blocks) {
      if (block.attrs.file) {
        write(dir, { [block.attrs.file]: block.body });
        continue;
      }
      for (const line of commandLines(block)) {
        if (line.startsWith('npm install')) continue;
        const result = run(dir, bin, line);
        if (block.attrs.expect) {
          assert.ok([0, 1, 2].includes(result.status), `${line} exited ${result.status}:\n${result.output}`);
          assert.ok(result.output.includes(block.attrs.expect), `${line} reports ${block.attrs.expect}:\n${result.output}`);
        } else {
          assert.equal(result.status, 0, `${line} exited ${result.status}:\n${result.output}`);
        }
        if (block.attrs.gate) gates.push(line);
        // The finding SETUP.md quotes for the @eslint/mcp recipe is the one ESLint prints.
        if (line === 'npx eslint .' && stack.files['src/components/Button.tsx']) {
          assert.ok(result.output.includes(QUOTED_ESLINT_FINDING), `SETUP.md quotes ${QUOTED_ESLINT_FINDING}, ESLint printed:\n${result.output}`);
        }
      }
    }

    // The block init --agents agents wrote carries the scale and its hash, and doctor agrees.
    const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
    assert.match(agents, /<!-- rhythmguard:scale-hash [0-9a-f]{12} -->/);
    assert.match(agents, /- Scale: /);
    assert.match(agents, /- Audit command: `npx rhythmguard audit \. /);
    assert.match(run(dir, bin, 'npx rhythmguard doctor').output, /AGENTS\.md Rhythmguard block matches the project scale/);

    // The gates pass on the recorded drift and fail on new drift.
    assert.ok(gates.length > 0, 'the stack ran at least one CI gate');
    write(dir, stack.drift);
    for (const line of gates) {
      const result = run(dir, bin, line);
      assert.notEqual(result.status, 0, `${line} fails once a change adds 17px:\n${result.output}`);
    }
  });
}
