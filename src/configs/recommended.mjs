import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const config = require('./recommended.js');
export default config;
