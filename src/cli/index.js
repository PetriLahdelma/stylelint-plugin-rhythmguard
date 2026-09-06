#!/usr/bin/env node
'use strict';

const command = process.argv[2];

const HELP = `Usage: rhythmguard [command]

With no command: zero-config quickstart. Detects your stack and tokens, infers
the spacing scale, audits the current directory and prints a config to paste.

Commands:
  quickstart    Same as running with no command
  audit <dir>   Report design-system drift across CSS and Tailwind class strings
  init          Scaffold a Rhythmguard config for your project
                --agents <claude|cursor|copilot|all> installs the agent instruction packs instead
  doctor        Validate your Rhythmguard setup

Options:
  --help        Show this help message

Examples:
  npx rhythmguard
  npx rhythmguard audit ./src
  npx rhythmguard audit ./src --format markdown
  npx rhythmguard init
  npx rhythmguard init --agents all
  npx rhythmguard doctor
`;

if (command === '--help' || command === '-h') {
  process.stdout.write(HELP);
  process.exit(0);
}

if (!command || command === 'quickstart') {
  require('./quickstart').run();
} else if (command === 'audit') {
  require('./audit').run();
} else if (command === 'init') {
  require('./init').run();
} else if (command === 'doctor') {
  require('./doctor');
} else {
  process.stderr.write(`Unknown command: ${command}\n\n`);
  process.stdout.write(HELP);
  process.exit(1);
}
