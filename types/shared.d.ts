export type ScaleValue = number | string;

export type RuleSeverity = boolean | "always" | "never";

export interface ScaleSource {
  /** Directory that a relative `path` resolves from. Defaults to the working directory. */
  baseDir?: string;
  /** Alias for `path`. */
  file?: string;
  /** `auto` (default), `css`, `flat-json`, `style-dictionary`, or `dtcg`. */
  format?: string;
  path?: string;
  /** Regex for token names in this file, overriding the spacing kind matcher (for packages that name spacing differently). */
  tokenPattern?: string;
}

export interface RhythmguardRuleOptions {
  /** Exempt non-zero lengths of one CSS pixel or less (1px, -1px, 0.5px, 0.0625rem). Default true. */
  allowHairlines?: boolean;
  baseFontSize?: number;
  customScale?: ScaleValue[];
  includeMathFunctions?: boolean;
  preset?: string;
  properties?: Array<string | RegExp>;
  /**
   * Allowed values, or `"auto"` to infer the scale from spacing tokens: `scaleSources`,
   * then `.rhythmguardrc.json` audit token sources, then the linted stylesheet's custom
   * properties, then `tailwindConfigPath`, falling back to the `rhythmic-4` preset.
   */
  scale?: ScaleValue[] | "auto";
  /** Token files consulted first when `scale` is `"auto"`. */
  scaleSources?: Array<string | ScaleSource>;
  /** Tailwind v3 config whose `theme.spacing` feeds `scale: "auto"` and `tokenMapFromTailwindSpacing`. */
  tailwindConfigPath?: string;
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
