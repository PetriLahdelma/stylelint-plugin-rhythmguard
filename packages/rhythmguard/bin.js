#!/usr/bin/env node
'use strict';

// `npx rhythmguard` resolves the package named rhythmguard. This is that package:
// one dependency and one line, so the command in the README works in a project
// that has installed nothing. The CLI itself lives in stylelint-plugin-rhythmguard.
require('stylelint-plugin-rhythmguard/cli').main();
