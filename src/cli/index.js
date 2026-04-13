#!/usr/bin/env node
'use strict';

const command = process.argv[2];

const HELP = `Usage: rhythmguard <command>

Commands:
  audit <dir>   Report scale drift and token opportunities
  init          Scaffold a Rhythmguard config for your project
  doctor        Validate your Rhythmguard setup

Options:
  --help        Show this help message

Examples:
  npx rhythmguard audit ./src
  npx rhythmguard audit ./src --json
  npx rhythmguard init
  npx rhythmguard doctor
`;

if (!command || command === '--help' || command === '-h') {
  process.stdout.write(HELP);
  process.exit(0);
}

if (command === 'audit') {
  require('./audit');
} else if (command === 'init') {
  require('./init');
} else if (command === 'doctor') {
  require('./doctor');
} else {
  process.stderr.write(`Unknown command: ${command}\n\n`);
  process.stdout.write(HELP);
  process.exit(1);
}
