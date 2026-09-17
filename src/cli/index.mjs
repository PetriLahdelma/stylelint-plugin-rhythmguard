import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cli = require('./index.js');

export default cli;
export const HELP = cli.HELP;
export const main = cli.main;
