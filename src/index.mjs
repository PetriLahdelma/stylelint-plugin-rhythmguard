import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const plugin = require('./index.js');

export default plugin;
export const rules = plugin.rules;
export const configs = plugin.configs;
export const presets = plugin.presets;
export const eslint = plugin.eslint;
