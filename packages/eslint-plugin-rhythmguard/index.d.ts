// Types come from the package root, which every moduleResolution setting
// resolves through `types`; a subpath needs `exports` or typesVersions (#281).
import type { RhythmguardEslintPlugin } from "stylelint-plugin-rhythmguard";

export type { EslintRuleModule, RhythmguardEslintPlugin } from "stylelint-plugin-rhythmguard";

export const configs: RhythmguardEslintPlugin["configs"];
export const rules: RhythmguardEslintPlugin["rules"];

declare const plugin: RhythmguardEslintPlugin;

export default plugin;
