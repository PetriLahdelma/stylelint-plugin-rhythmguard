# rhythmguard

```bash
npx rhythmguard
```

No install, no config. It detects your stack and token files, infers your spacing scale from your own tokens, audits the current directory, and prints the exact `.stylelintrc.json` to paste. Then:

```bash
npx rhythmguard audit ./src --format markdown
npx rhythmguard audit ./src --write-baseline
npx rhythmguard audit ./src --since-baseline --fail-on-new-drift
npx rhythmguard init
npx rhythmguard doctor
```

This package is the command name only. It depends on [stylelint-plugin-rhythmguard](https://www.npmjs.com/package/stylelint-plugin-rhythmguard) and runs its CLI; the Stylelint rules, the ESLint companion and the audit all live there. Once the plugin is a dev dependency, `npx rhythmguard` resolves to the same command without this package.

Full reference: [docs/AUDIT.md](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/AUDIT.md).

## License

MIT.
