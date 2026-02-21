import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const config = require('./tailwind.js');
export default config;
