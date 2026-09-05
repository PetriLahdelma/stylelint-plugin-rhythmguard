# Rhythmguard for shared-config authors

You maintain a Stylelint config that other teams install: a design-system org config, a platform team's `@company/stylelint-config`, a framework starter. This page is the contract for embedding Rhythmguard in it.

## The one-liner

```json
{
  "extends": ["stylelint-plugin-rhythmguard/configs/embed"]
}
```

Or, if your config lists rules directly:

```json
{
  "plugins": ["stylelint-plugin-rhythmguard"],
  "rules": {
    "rhythmguard/use-scale": [true, { "scale": "auto", "severity": "warning" }]
  }
}
```

That is the whole `embed` config. One rule, warning level, scale inferred from the consumer's own tokens. It has no `extends`, so it pulls nothing but this plugin into your dependency tree, and its shape is frozen for the 2.x line: a minor bump will not change what your consumers see.

## What your consumers get

`rhythmguard/use-scale` reports spacing values (`margin`, `padding`, `gap`, `inset`, translations) that are not on the spacing scale, with the two nearest on-scale values in the message. It never guesses tokens and never rewrites anything unless the consumer runs `--fix`.

What it does not do, so nobody expects it: it does not check colors or hex values, it does not lint Tailwind class strings (that is the separate ESLint companion, see below), and it does not enforce token usage over raw values (that is `prefer-token`, which you should leave to consumers who have a token system).

## Why warning level

A shared config reaches codebases you have never seen. Some will have hundreds of off-scale values on day one. At warning level the rule shows up in editors and in CI output without failing anyone's build, so consumers can fix at their own pace or ratchet with [`rhythmguard audit --since-baseline --fail-on-new-drift`](./AUDIT.md). Teams that want it to fail set the severity in their own config:

```json
{
  "extends": ["@company/stylelint-config"],
  "rules": {
    "rhythmguard/use-scale": [true, { "scale": "auto", "severity": "error" }]
  }
}
```

## Why `scale: "auto"`

You do not know each consumer's scale, and you should not have to. With `"auto"` the rule resolves the scale per project, first match wins:

1. `scaleSources` files, if the consumer or your config lists any
2. `audit.tokenSources` from the consumer's `.rhythmguardrc.json`
3. spacing custom properties in the linted stylesheet (`--space-*`, `--spacing-*`, prefixed variants like `--acme-spacing-md`, Tailwind v4's `--spacing` base, values written as `calc(4px * var(--scaling))`)
4. spacing tokens shipped by installed design-token packages (`tailwindcss`, `@radix-ui/themes`, `@mantine/core`, `@primer/primitives`, `@shopify/polaris-tokens`, `@spectrum-css/tokens`)
5. `theme.spacing` from `tailwindConfigPath`
6. the `rhythmic-4` preset, announced once in the first report of the file

Inference needs at least three distinct token values before it trusts a source; a one-token scale is worse than the default. The [quiet benchmark](./QUIET_BENCHMARK.md) shows how this behaves on Radix Themes, Mantine, shadcn/ui, Primer React and Liveblocks.

### When tokens live in a package, not in CSS

Design systems often ship tokens from a Style Dictionary build or an npm package. For the packages on the allowlist (Tailwind v4, Radix Themes, Mantine, Primer primitives, Polaris, Spectrum) inference reads the installed files on its own. For any other package, or your own token build, point `scaleSources` at the built token file so every consumer of your config gets the same scale:

```json
{
  "plugins": ["stylelint-plugin-rhythmguard"],
  "rules": {
    "rhythmguard/use-scale": [
      true,
      {
        "scale": "auto",
        "scaleSources": ["node_modules/@company/tokens/dist/tokens.json"],
        "severity": "warning"
      }
    ]
  }
}
```

Flat JSON, Style Dictionary JSON, DTCG JSON and CSS custom properties are all accepted. This is the pattern the first external adopter arrived at independently: derive the effective pixel scale from the token *values* rather than the token names, because under Tailwind v4 the per-step `--spacing-N` names are inert and only the values matter.

## How consumers opt out

Per file or block, the standard Stylelint way:

```css
/* stylelint-disable rhythmguard/use-scale */
.legacy-grid { margin: 13px; }
/* stylelint-enable rhythmguard/use-scale */
```

Per project, in their own config: `"rhythmguard/use-scale": null`. Per path, with Stylelint `overrides`. Generated CSS and third-party CSS should be ignored at the config level (`ignoreFiles`) or never linted in the first place; the rule cannot tell authored from generated.

## What is exempt by default

Zero, percentages, and hairlines (non-zero lengths of one CSS pixel or less such as `margin: -1px` or a `1px` focus-ring inset). The reasoning is in the [`use-scale` docs](./rules/use-scale.md#hairlines). Consumers who want hairlines reported set `allowHairlines: false`.

## Footprint and support

- Stylelint 16 and 17. Node 20.19 or newer.
- Runtime dependency: `known-css-properties`, nothing else. Optional peers: `postcss-scss` to audit SCSS, `stylelint-config-tailwindcss` for the `tailwind` config, `stylelint-plugin-logical-css` if you compose with it. `embed` needs none of them.
- CommonJS and ESM entry points, TypeScript declarations for every export.
- The `embed` config's shape and defaults will not change within 2.x. Changes to inference sources are additive.
- Bugs and false positives: [open an issue](https://github.com/petrilahdelma/stylelint-plugin-rhythmguard/issues). A finding your consumers consider wrong is exactly what the quiet benchmark exists to catch; a reproduction in an issue is enough.

## Going further

- `rhythmguard/prefer-token` for consumers with a token system: raw literals become token suggestions with an autofix from a token map. Leave it out of a shared config unless every consumer has tokens.
- The ESLint companion `stylelint-plugin-rhythmguard/eslint` for Tailwind class strings (`p-[13px]`), which the Stylelint side cannot see.
- [`rhythmguard audit`](./AUDIT.md) for a repo-level report, baselines and CI gates.
