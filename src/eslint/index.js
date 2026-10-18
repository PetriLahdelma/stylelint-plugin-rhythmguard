'use strict';

const tailwindClassUseScale = require('./rules/tailwind-class-use-scale');
const tailwindClassUseMotionScale = require('./rules/tailwind-class-use-motion-scale');

const plugin = {
  rules: {
    'tailwind-class-use-scale': tailwindClassUseScale,
    'tailwind-class-use-motion-scale': tailwindClassUseMotionScale,
  },
  configs: {},
};

// A flat config that works on its own (`export default [rhythmguard.configs.recommended]`),
// so it registers the plugin under the prefix its rules use (#279). Spreading
// `configs.recommended.rules` into a block that registers the plugin itself still works.
plugin.configs.recommended = {
  plugins: { 'rhythmguard-tailwind': plugin },
  rules: {
    'rhythmguard-tailwind/tailwind-class-use-scale': 'warn',
    'rhythmguard-tailwind/tailwind-class-use-motion-scale': 'off',
  },
};

module.exports = plugin;
