# Set up Rhythmguard

Give your coding agent this prompt:

> Read https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/SETUP.md and set up Rhythmguard in this project.

The rest of this page is for the agent. Run the steps in order from the project root, the directory with `package.json`. Each step says how to tell it worked. Do not change any spacing value while setting up: the point of setup is to measure the drift and stop new drift, not to rewrite the project. When a step fails, stop and report the command and its output.

## 1. Look at the project

```bash setup=all
npx rhythmguard
```

This audits the project without changing anything and prints what it detected (Tailwind, a Stylelint config, token files), the spacing scale it inferred and where from, the findings, and the install line and config for this project. It exits 0.

## 2. Pick the path

| The project has | Path | Steps |
| --- | --- | --- |
| Stylesheets (`.css`, `.scss`) and no Tailwind | Stylelint | 3a, 4a |
| Tailwind (`tailwindcss` or `@tailwindcss/*` in `package.json`) | Stylelint for the CSS, ESLint for class strings | 3a, 3b, 4a, 4b |
| Tailwind class strings, and the user wants no Stylelint, or the project lints with ESLint only | ESLint only | 3b, 4b |

When unsure, take the Stylelint path; the ESLint plugin can be added later. In an ESLint-only project, do not install Stylelint unless the user asks.

## 3. Install

### 3a. Stylelint

```bash setup=stylelint
npm install --save-dev "stylelint@^16.7.0 || ^17.0.0 || ^18.0.0" stylelint-plugin-rhythmguard
```

In a Tailwind project, also:

```bash setup=stylelint-tailwind
npm install --save-dev stylelint-config-tailwindcss
```

With `.scss` files, also `npm install --save-dev postcss-scss`. The install line step 1 printed already has these.

### 3b. ESLint

```bash setup=eslint
npm install --save-dev eslint eslint-plugin-rhythmguard
```

With `.ts` or `.tsx` files, also:

```bash setup=eslint-typescript
npm install --save-dev typescript-eslint
```

## 4. Configure

### 4a. Stylelint

```bash setup=stylelint
npx rhythmguard init --yes
```

This writes `.stylelintrc.json` with the config step 1 printed (it reproduces the audit's scale) and `.rhythmguardrc.json`, so a plain `npx rhythmguard audit .` reads the same token files. When a Stylelint config already exists, it writes nothing, prints the lines to merge and exits 1: merge them into that config by hand, then go on.

```bash setup=stylelint expect=13px
npx stylelint "**/*.{css,scss}"
```

It reports the off-scale values (`Unexpected off-scale value "13px"`). Findings are expected; a config error (exit 78) is not.

### 4b. ESLint

When step 1 printed an `eslint.config.js` block, use that one: it carries the project's scale. Otherwise write this file, or add the object to the array an existing `eslint.config.js` exports:

```js setup=eslint file=eslint.config.js
// eslint.config.js
import rhythmguard from 'eslint-plugin-rhythmguard';
import tseslint from 'typescript-eslint';

export default [
  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { 'rhythmguard-tailwind': rhythmguard },
    rules: { 'rhythmguard-tailwind/tailwind-class-use-scale': ['error'] },
  },
];
```

Without TypeScript, drop the `typescript-eslint` import and the `parser` key. Vue and Svelte files need their own parser; see the [eslint-plugin-rhythmguard README](../packages/eslint-plugin-rhythmguard/README.md#other-file-types).

```bash setup=eslint expect=p-[13px]
npx eslint .
```

It reports arbitrary spacing such as `p-[13px]` and names the two classes to choose from.

## 5. Check the setup

```bash setup=all
npx rhythmguard doctor
```

Every check passes (exit 0). It loads the configs through the project's own Stylelint and ESLint, lints one file with each and prints the scale the rules check.

## 6. Tell the project's agents

```bash setup=all
npx rhythmguard init --agents agents
```

This adds a marked block to `AGENTS.md` (Codex, Cursor, Copilot, Gemini CLI, Zed and other tools read it) with the rules and this project's scale, its source, the token per step and the exact audit command. Only the text between the `rhythmguard` markers is written; the rest of the file is kept. Add `claude-md` for `CLAUDE.md`, or `claude`, `cursor` and `copilot` for each tool's own file, comma-separated: `--agents agents,claude`. `npx rhythmguard doctor` warns when the block's scale goes out of date.

## 7. Baseline and CI gate

Existing drift is recorded, not fixed, so the gate fails only on new drift.

Stylelint path:

```bash setup=stylelint
npx rhythmguard audit . --scale auto --write-baseline
```

```bash setup=stylelint gate
npx rhythmguard audit . --scale auto --since-baseline --fail-on-new-drift
```

ESLint path, and Tailwind projects on both: ESLint's bulk suppressions record the current findings. They apply to rules set to `error`, as in step 4b.

```bash setup=eslint
npx eslint . --suppress-all
```

```bash setup=eslint gate
npx eslint . --pass-on-unpruned-suppressions
```

Both gates exit 0 now and exit 1 when a change adds an off-scale value. Commit `.rhythmguard-baseline.json` and `eslint-suppressions.json`. In GitHub Actions, run the gates after `npm ci`; add `--format github` to the audit for annotations on the pull request:

```yaml
- run: npx rhythmguard audit . --scale auto --since-baseline --fail-on-new-drift --format github
- run: npx eslint . --pass-on-unpruned-suppressions
```

[CI_ADOPTION.md](./CI_ADOPTION.md) has the full workflow.

## 8. Optional: findings in the editor's agent through `@eslint/mcp`

ESLint's MCP server runs the project's ESLint config, so the agent in Cursor or VS Code sees the class-string findings while it edits. It serves no CSS findings; those come from Stylelint and the audit.

Cursor, `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "eslint": { "command": "npx", "args": ["@eslint/mcp@latest"], "env": {} }
  }
}
```

VS Code, `.vscode/mcp.json`:

```json
{
  "servers": {
    "ESLint": { "type": "stdio", "command": "npx", "args": ["@eslint/mcp@latest"] }
  }
}
```

Then ask the agent to "lint src/components/Button.tsx with ESLint and explain the findings". On Tailwind's default spacing, a `p-[13px]` comes back as `Unexpected Tailwind arbitrary spacing value "p-[13px]". Use "p-3" (12px) or "p-3.5" (14px)`.

## 9. Hand off

Report to the user: the path taken, the scale and its source (from step 5), the number of findings recorded in the baseline, and the files written (`.stylelintrc.json`, `.rhythmguardrc.json`, `eslint.config.js`, `AGENTS.md`, the baseline files). Fixing the recorded drift is a separate task; `npx rhythmguard audit . --scale auto --plan` proposes one decision per off-scale value.
