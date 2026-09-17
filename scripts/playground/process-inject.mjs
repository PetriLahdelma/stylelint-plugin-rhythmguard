// Injected by esbuild: the `process` global the core reads (cwd, env) in the browser.
import shims from './node-shims.js';

export const process = shims.process;
