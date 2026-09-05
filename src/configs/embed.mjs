import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const config = require('./embed.js');
export default config;
