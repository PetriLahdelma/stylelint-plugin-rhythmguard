import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const config = require('./expanded.js');
export default config;
