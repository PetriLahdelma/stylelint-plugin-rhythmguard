import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const config = require('./migration.js');
export default config;
