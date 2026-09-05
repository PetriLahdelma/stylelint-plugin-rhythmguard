# Migrating to 3.0

3.0 makes the package smaller and its footprint honest. Nothing about how the rules report changes. If you extend `recommended`, `strict`, `tailwind`, `embed` or `motion`, you have nothing to do beyond the Node version.

## Node 20.19 or newer

Node 18 support is gone; it left long-term support in April 2025 and Stylelint 17 already requires 20.19. If you are on Node 18, stay on 2.x.

## Two dependencies became optional peers

`stylelint-config-tailwindcss` and `stylelint-plugin-logical-css` were installed for every user because two configs referenced them. They are now optional peer dependencies. Installing `stylelint-plugin-rhythmguard` pulls in nothing but `known-css-properties`.

- If you use `configs/tailwind`, install `stylelint-config-tailwindcss` yourself:

  ```bash
  npm install --save-dev stylelint-config-tailwindcss
  ```

- If you used `configs/logical`, see the replacement block below.

## Four configs removed

Eight configs was a decision burden and four of them were rule blocks in disguise. The blocks are below; paste the one you used.

### `configs/react-tailwind`

Was `tailwind` plus Next.js build ignores and a radius group for CSS Modules. `npx rhythmguard init` now writes the ignores for you when it detects Next.js.

```json
{
  "extends": ["stylelint-plugin-rhythmguard/configs/tailwind"],
  "ignoreFiles": [".next/**", "out/**", "node_modules/**"],
  "overrides": [
    {
      "files": ["**/*.module.css"],
      "rules": {
        "rhythmguard/use-scale": [true, { "propertyGroups": ["spacing", "radius"] }]
      }
    }
  ]
}
```

### `configs/expanded`

Scale enforcement across spacing, radius, typography and size.

```json
{
  "plugins": ["stylelint-plugin-rhythmguard"],
  "rules": {
    "rhythmguard/use-scale": [
      true,
      {
        "propertyGroups": ["spacing", "radius", "typography", "size"],
        "scale": [0, 2, 4, 8, 12, 16, 24, 32, 40, 48, 64]
      }
    ],
    "rhythmguard/no-offscale-transform": [true, { "scale": [0, 4, 8, 12, 16, 24, 32] }],
    "rhythmguard/prefer-token": [
      true,
      { "propertyGroups": ["spacing", "radius"], "tokenPattern": "^--space-|^--radius-" }
    ]
  }
}
```

Consider `"scale": "auto"` instead of the literal list; it reads your tokens.

### `configs/logical`

`strict` composed with `stylelint-plugin-logical-css`. Install that plugin and compose the two yourself:

```json
{
  "extends": [
    "stylelint-plugin-logical-css/configs/recommended",
    "stylelint-plugin-rhythmguard/configs/strict"
  ],
  "rules": {
    "rhythmguard/use-scale": [true, { "propertyGroups": ["spacing", "size"] }]
  }
}
```

### `configs/migration`

The transition profile: on-scale literals allowed while token maps are built from CSS custom properties and a Tailwind v3 config.

```json
{
  "plugins": ["stylelint-plugin-rhythmguard"],
  "rules": {
    "rhythmguard/use-scale": [
      true,
      { "propertyGroups": ["spacing", "radius"], "scale": [0, 2, 4, 8, 12, 16, 24, 32, 40, 48, 64] }
    ],
    "rhythmguard/prefer-token": [
      true,
      {
        "allowNumericScale": true,
        "propertyGroups": ["spacing", "radius"],
        "tokenMapFromCssCustomProperties": true,
        "tokenMapFromTailwindSpacing": true,
        "tailwindConfigPath": "./tailwind.config.js",
        "tokenPattern": "^--space-|^--radius-"
      }
    ],
    "rhythmguard/no-offscale-transform": [true, { "scale": [0, 4, 8, 12, 16, 24, 32] }]
  }
}
```

In 3.0 the better transition path is `rhythmguard audit` with a baseline and `--fail-on-new-drift`, which does not need a separate lint profile. See [`CI_ADOPTION.md`](./CI_ADOPTION.md).

## Programmatic access

`plugin.configs` has five keys: `embed`, `motion`, `recommended`, `strict`, `tailwind`. The TypeScript declaration matches. Nothing else in the API changed.

## Still in 2.x form

`recommended` keeps the `rhythmic-4` default scale in 3.0. Switching its default to `scale: "auto"` remains a possibility for a later major once the benchmark has run long enough on inferred scales; use `embed` or set the option yourself if you want inference today.
