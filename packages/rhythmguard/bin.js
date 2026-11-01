#!/usr/bin/env node
'use strict';

// `npx rhythmguard` resolves the package named rhythmguard. This is that package:
// one line, and the two dependencies the CLI needs, so the command in the README
// works in a project that has installed nothing. The CLI itself lives in
// stylelint-plugin-rhythmguard; Stylelint, an optional peer there, audits the
// stylesheets.
require('stylelint-plugin-rhythmguard/cli').main();
