import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const rule = require('./index.js');
export default rule;
export const ruleName = rule.ruleName;
export const messages = rule.messages;
export const meta = rule.meta;
