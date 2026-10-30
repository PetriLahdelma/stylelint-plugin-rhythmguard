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

/**
 * Secondary options Stylelint itself reads on every rule, so every Rhythmguard
 * rule accepts them next to its own options.
 */
export interface StylelintSecondaryOptions {
  /** Turn off this rule's autofix while keeping its reports. */
  disableFix?: boolean;
  /** Replace the rule's message: a string, or a function of the message arguments. */
  message?: string | ((...args: any[]) => string);
  /** Report `stylelint-disable` comments for this rule as problems. */
  reportDisables?: boolean;
  /** `"warning"` or `"error"` (the default), or a function of the message arguments returning one of them or null. */
  severity?: "warning" | "error" | ((...args: any[]) => "warning" | "error" | null);
  /** A documentation link Stylelint shows with the rule's findings. */
  url?: string;
}

export type PropertyGroupName = "spacing" | "radius" | "size" | "typography" | "motion";

export type MathFunctionName = "calc" | "clamp" | "min" | "max";

/** 1-based argument indexes per math function. */
export type MathFunctionArgumentMap = Partial<Record<MathFunctionName, number[]>>;

/** A scale for one property or group: values, a preset name, or a preset and/or explicit values. */
export type ScaleOverride = ScaleValue[] | string | { customScale?: ScaleValue[]; preset?: string; scale?: ScaleValue[] };

/** Options the length rules (`use-scale`, `prefer-token`, `no-offscale-transform`) share. */
export interface RhythmguardLengthRuleOptions extends StylelintSecondaryOptions {
  /** Exempt non-zero lengths of one CSS pixel or less (1px, -1px, 0.5px, 0.0625rem). Default true. */
  allowHairlines?: boolean;
  /** Base for converting `rem` and `em`. Default 16. */
  baseFontSize?: number;
  /** Check the static bounds of fluid values: the clamp() minimum and maximum and each length argument of min() and max(). Default false; the preferred value of clamp() is never checked. */
  checkMathBounds?: boolean;
  customScale?: ScaleValue[];
  /** Lint inside `calc()`, `clamp()`, `min()` and `max()`. Default false. */
  enforceInsideMathFunctions?: boolean;
  /** Argument indexes skipped per math function. */
  ignoreMathFunctionArguments?: MathFunctionArgumentMap;
  /** Argument indexes checked per math function; the others are skipped. */
  mathFunctionArguments?: MathFunctionArgumentMap;
  /** A sentence of up to 200 characters appended to every finding, after the built-in text. */
  note?: string;
  preset?: string;
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
  /** Functions whose values count as tokenized. Default `["var", "theme", "token"]`. */
  tokenFunctions?: string[];
  /** Custom property names that count as spacing tokens. Default `"^--space-"`. */
  tokenPattern?: string;
  /** `"convert"` (default) compares through px; `"exact"` compares against scale values in the same unit. */
  unitStrategy?: "convert" | "exact";
  /** Units checked. Default `["px", "rem", "em"]`. */
  units?: string[];
}

/** Options for `rhythmguard/no-offscale-transform`. */
export interface RhythmguardTransformRuleOptions extends RhythmguardLengthRuleOptions {
  /** Allow negative values. Default true. */
  allowNegative?: boolean;
  /** Skip `%` values. Default true. */
  allowPercentages?: boolean;
  /** Read the `decisions` section of `.rhythmguardrc.json` (default true). The audit sets false and applies decisions itself. */
  decisions?: boolean;
  /** Autofix to the nearest scale value. Default true. */
  fixToScale?: boolean;
  /** What autofix writes: the nearest literal (default) or, with "token", `var(--name)` when exactly one custom property holds that value in the same unit. */
  fixWith?: "value" | "token";
}

/** Property selection, shared by `use-scale` and `prefer-token`. */
export interface RhythmguardPropertyOptions {
  /** Keyword literals to skip. Default the CSS global keywords and `auto`. */
  ignoreValues?: string[];
  /** Properties checked: names, `/regex/flags` strings or RegExps. Overrides `propertyGroups`. */
  properties?: Array<string | RegExp>;
  /** Built-in property groups, used when `properties` is not set. Default `["spacing"]`. */
  propertyGroups?: PropertyGroupName[];
  /** A scale per property name or `/regex/flags` key, used before `scales` and `scale`. */
  propertyScales?: Record<string, ScaleOverride>;
  /**
   * A scale per property group, used before `scale` and after `propertyScales`: values, a
   * preset name, or `"auto"` to infer the group's scale from its tokens (`--font-size-*` and
   * `--text-*` for typography, `--radius-*` for radius). Findings then name the group's scale.
   */
  scales?: Partial<Record<"spacing" | "radius" | "size" | "typography", ScaleOverride | "auto">>;
}

/** Options for `rhythmguard/use-scale`. */
export interface RhythmguardUseScaleOptions extends RhythmguardTransformRuleOptions, RhythmguardPropertyOptions {}

/** Options for `rhythmguard/prefer-token`. */
export interface RhythmguardPreferTokenOptions extends RhythmguardLengthRuleOptions, RhythmguardPropertyOptions {
  /** Migration mode: on-scale literals pass. Default false. */
  allowNumericScale?: boolean;
  /** Raw value to token replacements, such as `{ "16px": "var(--space-4)" }`. */
  tokenMap?: Record<string, string>;
  tokenMapFile?: string;
  tokenMapFromCssCustomProperties?: boolean;
  tokenMapFromTailwindSpacing?: boolean;
}

/** Every option a length rule accepts; each rule rejects the ones that are not its own. */
export interface RhythmguardRuleOptions extends RhythmguardUseScaleOptions, RhythmguardPreferTokenOptions {}

/** Options for `rhythmguard/use-motion-scale`. */
export interface RhythmguardMotionRuleOptions extends StylelintSecondaryOptions {
  /** Allowed duration and delay values in milliseconds. Default `[0, 75, 100, 150, 200, 300, 500, 700, 1000]`. */
  durationScale?: number[];
  /** Time units checked. Default `["ms", "s"]`. */
  durationUnits?: Array<"ms" | "s">;
  /** Exact replacements for raw easing functions. */
  easingTokenMap?: Record<string, string>;
  /** Autofix simple durations and delays to the nearest scale value. Default true. */
  fixToScale?: boolean;
  /** A sentence of up to 200 characters appended to every finding, after the built-in text. */
  note?: string;
}

export type StylelintRuleConfig<Options> =
  | null
  | RuleSeverity
  | [RuleSeverity]
  | [RuleSeverity, Options];

export type RhythmguardRuleConfig = StylelintRuleConfig<RhythmguardRuleOptions>;

export type RhythmguardMotionRuleConfig = StylelintRuleConfig<RhythmguardMotionRuleOptions>;

export interface RhythmguardStylelintRules {
  "rhythmguard/no-offscale-transform"?: StylelintRuleConfig<RhythmguardTransformRuleOptions>;
  "rhythmguard/prefer-token"?: StylelintRuleConfig<RhythmguardPreferTokenOptions>;
  "rhythmguard/use-motion-scale"?: RhythmguardMotionRuleConfig;
  "rhythmguard/use-scale"?: StylelintRuleConfig<RhythmguardUseScaleOptions>;
  [ruleName: string]: RhythmguardRuleConfig | RhythmguardMotionRuleConfig | undefined;
}

export interface RhythmguardStylelintConfig {
  customSyntax?: string;
  extends?: string | string[];
  ignoreFiles?: string | string[];
  plugins?: string[];
  rules?: RhythmguardStylelintRules;
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
  /** The metadata of a community scale, or null for an unknown name. */
  getCommunityScaleMetadata(name: string): ScalePresetMetadata | null;
  /** A preset's values, or null for an unknown name. */
  getScalePreset(name: string): readonly number[] | null;
  listCommunityScalePresetNames(): string[];
  listScalePresetNames(): string[];
  scales: Record<string, readonly number[]>;
}

/**
 * The ESLint plugin types are structural, so they need no `eslint` import, and
 * they are written to be assignable to ESLint's `ESLint.Plugin` and
 * `Linter.Config` types (ESLint 9 and 10), so a typed `eslint.config.ts`
 * compiles with `defineConfig`.
 */
export type EslintRuleSeverity = 0 | 1 | 2 | "off" | "warn" | "error";

/** Listener functions keyed by node type or selector, as ESLint's `RuleVisitor`. */
export type EslintRuleVisitor = Record<string, ((...args: any[]) => void) | undefined>;

export interface EslintRuleMeta {
  docs?: { description?: string; url?: string };
  fixable?: "code" | "whitespace";
  schema?: Array<Record<string, unknown>>;
  type?: "problem" | "suggestion" | "layout";
}

export interface EslintRuleModule {
  meta: EslintRuleMeta;
  create(context: any): EslintRuleVisitor;
}

/** Options for `rhythmguard-tailwind/tailwind-class-use-scale`. */
export interface RhythmguardTailwindClassOptions {
  /** Exempt non-zero lengths of one CSS pixel or less (`translate-y-[0.5px]`, `-mt-[1px]`, `p-[0.0625rem]`), as `use-scale` does. Default true. */
  allowHairlines?: boolean;
  /** Allow negative values (`-m-[16px]`, `m-[-16px]`). Default true. */
  allowNegative?: boolean;
  /** Base for converting `rem` and `em`. Default 16. */
  baseFontSize?: number;
  /** A sentence of up to 200 characters appended to every finding, after the built-in text. */
  note?: string;
  /** Allowed values. Default `[0, 4, 8, 12, 16, 24, 32]`. */
  scale?: ScaleValue[];
  /** px per Tailwind spacing step, used to write utility classes in messages and fixes. Default a quarter of `baseFontSize`; `false` keeps arbitrary values. */
  spacingUnit?: number | false;
  /** Units checked. Default `["px", "rem", "em"]`. */
  units?: string[];
}

export interface RhythmguardEslintPlugin {
  configs: {
    /** A flat config that registers the plugin itself, so it can stand alone in a config array. */
    recommended: {
      plugins: { "rhythmguard-tailwind": RhythmguardEslintPlugin };
      rules: Record<string, EslintRuleSeverity>;
    };
  };
  rules: {
    "tailwind-class-use-motion-scale": EslintRuleModule;
    "tailwind-class-use-scale": EslintRuleModule;
    [ruleName: string]: EslintRuleModule;
  };
}
