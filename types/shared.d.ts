export type ScaleValue = number | string;

export type RuleSeverity = boolean | "always" | "never";

export interface RhythmguardRuleOptions {
  baseFontSize?: number;
  customScale?: ScaleValue[];
  includeMathFunctions?: boolean;
  preset?: string;
  properties?: Array<string | RegExp>;
  scale?: ScaleValue[];
  tokenMap?: Record<string, string>;
  tokenMapFile?: string;
  tokenMapFromCssCustomProperties?: boolean;
  tokenMapFromTailwindSpacing?: boolean;
  tokenPattern?: string;
}

export type RhythmguardRuleConfig =
  | null
  | RuleSeverity
  | [RuleSeverity, RhythmguardRuleOptions];

export interface RhythmguardStylelintConfig {
  customSyntax?: string;
  extends?: string | string[];
  ignoreFiles?: string | string[];
  plugins?: string[];
  rules?: Record<string, RhythmguardRuleConfig>;
}

export interface ScalePresetMetadata {
  aliases?: string[];
  base?: number;
  description?: string;
  name?: string;
  values?: number[];
  [key: string]: unknown;
}

export interface RhythmguardPresets {
  communityScaleMetadata: Record<string, ScalePresetMetadata>;
  getCommunityScaleMetadata(name: string): ScalePresetMetadata | undefined;
  getScalePreset(name: string): readonly number[] | undefined;
  listCommunityScalePresetNames(): string[];
  listScalePresetNames(): string[];
  scales: Record<string, readonly number[]>;
}

export interface EslintRuleModule {
  meta: Record<string, unknown>;
  create(context: unknown): Record<string, unknown>;
}

export interface RhythmguardEslintPlugin {
  configs: {
    recommended: {
      rules: Record<string, "off" | "warn" | "error" | number>;
    };
  };
  rules: {
    "tailwind-class-use-motion-scale": EslintRuleModule;
    "tailwind-class-use-scale": EslintRuleModule;
    [ruleName: string]: EslintRuleModule;
  };
}
