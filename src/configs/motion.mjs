import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const config = require('./motion.js');
export default config;
