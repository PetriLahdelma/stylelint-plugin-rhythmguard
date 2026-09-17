import type { RhythmguardEslintPlugin } from "stylelint-plugin-rhythmguard/eslint";

export type { EslintRuleModule, RhythmguardEslintPlugin } from "stylelint-plugin-rhythmguard/eslint";

export const configs: RhythmguardEslintPlugin["configs"];
export const rules: RhythmguardEslintPlugin["rules"];

declare const plugin: RhythmguardEslintPlugin;

export default plugin;
