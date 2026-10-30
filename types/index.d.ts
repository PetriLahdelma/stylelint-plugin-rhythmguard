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
  MathFunctionArgumentMap,
  PropertyGroupName,
  RhythmguardLengthRuleOptions,
  RhythmguardMotionRuleConfig,
  RhythmguardMotionRuleOptions,
  RhythmguardPreferTokenOptions,
  RhythmguardPresets,
  RhythmguardPropertyOptions,
  RhythmguardRuleConfig,
  RhythmguardRuleOptions,
  RhythmguardStylelintConfig,
  RhythmguardStylelintRules,
  RhythmguardTailwindClassOptions,
  RhythmguardTransformRuleOptions,
  RhythmguardUseScaleOptions,
  ScaleOverride,
  ScalePresetMetadata,
  ScaleSource,
  ScaleValue,
  StylelintRuleConfig,
  StylelintSecondaryOptions,
} from "./shared";
export type {
  AuditBaselineComparison,
  AuditConfigReference,
  AuditContractReport,
  AuditFinding,
  AuditNonAuthoredFile,
  AuditOptions,
  AuditReport,
  AuditScale,
  AuditScaleSource,
  AuditScanScope,
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
    motion: RhythmguardStylelintConfig;
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
