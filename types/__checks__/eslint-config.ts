/**
 * Compile-time check that the ESLint plugin types fit ESLint's own config
 * types (#242): a typed `eslint.config.ts` that registers the plugin with
 * `defineConfig` must compile. Nothing here runs; it only has to type-check.
 */
import type { ESLint, Linter } from 'eslint';
import { defineConfig } from 'eslint/config';
import rhythmguard from 'eslint-plugin-rhythmguard';
import companion from 'stylelint-plugin-rhythmguard/eslint';

const config = defineConfig([
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { 'rhythmguard-tailwind': rhythmguard },
    rules: {
      'rhythmguard-tailwind/tailwind-class-use-scale': ['error', { scale: [0, 4, 8, 12, 16, 24, 32] }],
    },
  },
  {
    files: ['**/*.jsx'],
    plugins: { 'rhythmguard-tailwind': companion },
    rules: companion.configs.recommended.rules,
  },
]);

const asPlugin: ESLint.Plugin = rhythmguard;
const companionAsPlugin: ESLint.Plugin = companion;
const flatConfig: Linter.Config = {
  plugins: { 'rhythmguard-tailwind': rhythmguard },
  rules: rhythmguard.configs.recommended.rules,
};

// configs.recommended registers the plugin, so it stands alone in a config array (#279).
const standalone = defineConfig([rhythmguard.configs.recommended]);
const recommendedAsConfig: Linter.Config = companion.configs.recommended;
const spreadRecommended: Linter.Config = { ...rhythmguard.configs.recommended, files: ['**/*.jsx'] };

void config;
void standalone;
void recommendedAsConfig;
void spreadRecommended;
void asPlugin;
void companionAsPlugin;
void flatConfig;
