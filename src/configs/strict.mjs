import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const config = require('./strict.js');
export default config;
