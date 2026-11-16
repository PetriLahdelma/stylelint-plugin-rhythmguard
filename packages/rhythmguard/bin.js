#!/usr/bin/env node
'use strict';

// `npx rhythmguard` resolves the package named rhythmguard. This is that package:
// one line, and the three dependencies the CLI needs, so the command in the README
// works in a project that has installed nothing. The CLI itself lives in
// stylelint-plugin-rhythmguard; Stylelint and postcss-scss, optional peers there,
// audit the stylesheets, SCSS included. Stylelint stays a dependency here, not an
// optional peer: npm installs no optional peer, and without Stylelint the audit
// reads no stylesheet, so `npx rhythmguard` on a CSS project would report nothing
// (3.16.1; the pack smoke test fails that way when it is made optional).
require('stylelint-plugin-rhythmguard/cli').main();
