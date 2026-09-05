import type {
  RhythmguardEslintPlugin,
  RhythmguardPresets,
  RhythmguardStylelintConfig,
} from "./shared";
import type * as auditApi from "./audit";
import type { StylelintRuleModule } from "./rule";

export type {
  EslintRuleModule,
  RhythmguardEslintPlugin,
  RhythmguardPresets,
  RhythmguardRuleConfig,
  RhythmguardRuleOptions,
  RhythmguardStylelintConfig,
  ScalePresetMetadata,
  ScaleSource,
  ScaleValue,
} from "./shared";
export type {
  AuditBaselineComparison,
  AuditContractReport,
  AuditFinding,
  AuditOptions,
  AuditReport,
  AuditScale,
  AuditScaleSource,
  AuditScanned,
  AuditSummary,
  AuditTokenKind,
  AuditTokenSource,
  AuditTokenSourceFormat,
  ParsedTokenSources,
  TokenSourceReport,
} from "./audit";
export type { StylelintRuleModule } from "./rule";

export interface RhythmguardPlugin extends Array<StylelintRuleModule> {
  audit: typeof auditApi;
  configs: {
    embed: RhythmguardStylelintConfig;
    expanded: RhythmguardStylelintConfig;
    logical: RhythmguardStylelintConfig;
    migration: RhythmguardStylelintConfig;
    motion: RhythmguardStylelintConfig;
    "react-tailwind": RhythmguardStylelintConfig;
    recommended: RhythmguardStylelintConfig;
    strict: RhythmguardStylelintConfig;
    tailwind: RhythmguardStylelintConfig;
    [configName: string]: RhythmguardStylelintConfig;
  };
  eslint: RhythmguardEslintPlugin;
  presets: RhythmguardPresets;
  rules: {
    "rhythmguard/no-offscale-transform": StylelintRuleModule;
    "rhythmguard/prefer-token": StylelintRuleModule;
    "rhythmguard/use-motion-scale": StylelintRuleModule;
    "rhythmguard/use-scale": StylelintRuleModule;
    [ruleName: string]: StylelintRuleModule;
  };
}

declare const plugin: RhythmguardPlugin;

export const audit: typeof auditApi;
export const configs: RhythmguardPlugin["configs"];
export const eslint: RhythmguardEslintPlugin;
export const presets: RhythmguardPresets;
export const rules: RhythmguardPlugin["rules"];
export default plugin;
