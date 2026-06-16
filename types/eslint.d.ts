import type { RhythmguardEslintPlugin } from "./shared";

export type { EslintRuleModule, RhythmguardEslintPlugin } from "./shared";

export const configs: RhythmguardEslintPlugin["configs"];
export const rules: RhythmguardEslintPlugin["rules"];

declare const plugin: RhythmguardEslintPlugin;

export default plugin;
