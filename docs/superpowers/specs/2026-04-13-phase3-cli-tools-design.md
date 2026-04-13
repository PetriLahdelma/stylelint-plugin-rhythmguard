# Design Spec: Phase 3 CLI Tools — audit, init, doctor

Date: 2026-04-13
Phase: 3 — Adoption UX
Status: Approved

## Goal

Add three CLI commands that reduce setup friction and make Rhythmguard easier to adopt and recommend: audit (report scale drift), init (scaffold config), doctor (validate setup).

## Shared Architecture

All three commands live in `src/cli/`. A thin router at `src/cli/index.js` dispatches based on `process.argv[2]`. No external CLI framework — just `process.argv` parsing and `node:readline` for prompts.

Package.json gets a `"bin"` field pointing to the router. All commands are `#!/usr/bin/env node`.

### Files

| File | Action | Purpose |
|------|--------|---------|
| `src/cli/index.js` | Create | CLI entry point / router |
| `src/cli/audit.js` | Create | audit command |
| `src/cli/init.js` | Create | init command |
| `src/cli/doctor.js` | Create | doctor command |
| `package.json` | Modify | Add `bin` field, add `src/cli` to `files` |
| `README.md` | Modify | Document CLI commands |

## 3.1: `npx rhythmguard audit <dir>`

### What it does

Scans a directory, runs Stylelint with Rhythmguard rules in read-only mode, and outputs a summary of scale drift — off-scale value counts, token replacement opportunities, affected files. Teams paste this into PRs to justify adoption.

### Interface

```
npx rhythmguard audit ./src
npx rhythmguard audit ./src --json
```

### Behavior

1. Glob `<dir>/**/*.css` (and `*.module.css`, `*.vue`, `*.astro`, `*.svelte` if present)
2. Run Stylelint programmatically with `use-scale` (warning severity) and `prefer-token` (warning severity) using the recommended config
3. Aggregate warnings into:
   - Total files scanned
   - Files with issues (count and percentage)
   - Off-scale value histogram (value × count, sorted by frequency)
   - Token replacement opportunities (raw value → suggested token × count)
4. Output human-readable table (default) or JSON (`--json`)
5. Exit code 0 always (read-only, not a gate)

### Example output

```
Rhythmguard Audit: ./src

Files scanned:     47
Files with issues: 12 (25%)

Off-scale values: 34
  13px  ×8
  7px   ×6
  15px  ×5
  11px  ×4
  ...

Token opportunities: 18
  16px → var(--spacing-4)  ×9
  8px  → var(--spacing-2)  ×5
  12px → var(--spacing-3)  ×4

Run "npx stylelint --fix" to auto-correct.
```

## 3.2: `npx rhythmguard init`

### What it does

Detects the project stack and writes a `.stylelintrc.json` with the appropriate Rhythmguard config.

### Interface

```
npx rhythmguard init
```

### Behavior

1. Detect stack by checking the filesystem:
   - Tailwind: `tailwind.config.*` exists OR `@tailwindcss` in `package.json` dependencies
   - Next.js: `next.config.*` exists
   - CSS Modules: any `*.module.css` file in `src/`
   - Existing Stylelint config: `.stylelintrc*` or `stylelint` key in `package.json`
2. If existing Stylelint config found, warn and ask to overwrite (y/n)
3. Auto-select profile based on detection:
   - Next.js + Tailwind → `react-tailwind`
   - Tailwind (no Next.js) → `tailwind`
   - Neither → `recommended`
4. Print detected stack and selected profile, ask to confirm (y/n)
5. Write `.stylelintrc.json`:
   ```json
   {
     "extends": ["stylelint-plugin-rhythmguard/configs/<profile>"]
   }
   ```
6. Print next steps: "Run `npx stylelint \"src/**/*.css\"` to lint."

### Dependencies

Uses `node:readline` for y/n prompts. No external packages.

## 3.3: `npx rhythmguard doctor`

### What it does

Validates the Rhythmguard setup and reports problems with actionable fix suggestions.

### Interface

```
npx rhythmguard doctor
```

### Behavior

Runs these checks in order:

1. **Stylelint installed?** — Check `require.resolve('stylelint')`. Pass/fail.
2. **Rhythmguard config found?** — Look for `.stylelintrc*`, `stylelint.config.*`, or `stylelint` key in `package.json`. Pass/fail.
3. **Config references Rhythmguard?** — Read the config and check it extends a Rhythmguard config or uses the plugin. Pass/fail.
4. **Token pattern valid?** — If `tokenPattern` is set, try `new RegExp(pattern)`. Pass/fail.
5. **Tailwind config exists?** — If `tailwindConfigPath` is set, check the file exists. Pass/fail/skip.
6. **Custom syntax installed?** — If `customSyntax` is referenced in overrides, check `require.resolve(pkg)`. Pass/fail/skip.

### Example output

```
Rhythmguard Doctor

✓ stylelint installed (v16.15.0)
✓ config found (.stylelintrc.json)
✓ config references rhythmguard
✓ token pattern valid (^--spacing-)
✗ tailwind config not found at ./tailwind.config.js
  → Update tailwindConfigPath or remove tokenMapFromTailwindSpacing
- custom syntax check skipped (not configured)

1 issue found.
```

### Exit codes

- 0: all checks pass
- 1: one or more checks fail (CI-friendly)

## Out of Scope

- No interactive TUI (no ink, no blessed)
- No watch mode
- No autofix in audit (users run `stylelint --fix` themselves)
- No remote/cloud features
- No custom config generation beyond preset selection in init

## Success Criteria

- `npx rhythmguard audit ./src` produces useful output on a real project within 5 seconds
- `npx rhythmguard init` writes a working config in under 30 seconds
- `npx rhythmguard doctor` catches a missing Tailwind config and suggests the fix
- All three commands work without any extra dependencies beyond what Rhythmguard already ships
