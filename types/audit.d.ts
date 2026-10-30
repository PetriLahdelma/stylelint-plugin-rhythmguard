export type AuditTokenKind =
  | "all"
  | "motion"
  | "radius"
  | "size"
  | "spacing"
  | "typography";

export type AuditTokenSourceFormat =
  | "auto"
  | "css"
  | "dtcg"
  | "flat-json"
  | "style-dictionary";

export interface AuditTokenSource {
  baseDir?: string;
  file?: string;
  format?: AuditTokenSourceFormat;
  path?: string;
  /** Regex for token names in this file, overriding the kind matcher. */
  tokenPattern?: string;
}

/**
 * Options for `createAuditReport`. A key set to `undefined` counts as omitted.
 * `.rhythmguardrc.json` fills in what the options leave out, unless `noConfig`.
 * The gates and output options of `rhythmguard audit` (`format`, `outputPath`,
 * `maxFindings`, `minCleanliness`, `failOnNewDrift`, `badgeMetric`) belong to
 * the CLI: `createAuditReport` reads none of them. Check the returned report
 * instead, for example `report.summary.totalFindings` or `report.baseline`.
 */
export interface AuditOptions {
  baseFontSize?: number;
  /** Baseline file read with `sinceBaseline` and written with `writeBaseline`. Default `.rhythmguard-baseline.json`. */
  baselinePath?: string;
  /** Path to a `.rhythmguardrc.json`-style config. Defaults to `.rhythmguardrc.json` in `cwd`. */
  configPath?: string;
  dir?: string;
  /** @deprecated CLI only (`--fail-on-new-drift`): `createAuditReport` ignores it. Read `report.baseline.newFindingsCount`. */
  failOnNewDrift?: boolean;
  /** @deprecated CLI only (`--badge-metric`): `createAuditReport` ignores it. */
  badgeMetric?: "drift" | "findings";
  /** @deprecated CLI only (`--format`): `createAuditReport` returns the report object, not rendered output. */
  format?: "json" | "json-v1" | "markdown" | "text" | "html" | "github" | "badge";
  ignorePath?: string;
  ignorePatterns?: string[];
  /** Check clamp() bounds and min()/max() arguments against the scale (equivalent to `--check-math-bounds`). */
  checkMathBounds?: boolean;
  includeMotion?: boolean;
  /**
   * Audit vendored, test, generated, minified and built stylesheets too (equivalent to `--include-non-authored`).
   * Off by default: they are listed in `scanned.nonAuthoredFiles` and not audited.
   */
  includeNonAuthored?: boolean;
  /** Smallest gap in px between neighbouring steps of a token ladder (`audit.ladders.minStepPx`). Default 2. */
  ladderMinStepPx?: number;
  /** A scale per property group (`spacing`, `radius`, `size`, `typography`): values, a preset name or "auto". Each group named is also checked. */
  scales?: Partial<Record<"spacing" | "radius" | "size" | "typography", Array<number | string> | string | { preset?: string; scale?: Array<number | string>; customScale?: Array<number | string> }>>;
  /** @deprecated CLI only (`--max-findings`): `createAuditReport` ignores it. Compare `report.summary.totalFindings`. */
  maxFindings?: number;
  /** @deprecated CLI only (`--min-cleanliness`): `createAuditReport` ignores it. Compare `report.summary.scaleCleanliness`. */
  minCleanliness?: number;
  /** Skip config discovery entirely (equivalent to `--no-config`). */
  noConfig?: boolean;
  /** @deprecated CLI only (`--output`): `createAuditReport` writes nothing. */
  outputPath?: string;
  /** Explicit scale values, or `"auto"` to infer from token sources, then scanned CSS, then the default. */
  scale?: Array<number | string> | "auto";
  since?: string;
  sinceBaseline?: boolean;
  staged?: boolean;
  tokenCandidateMinCount?: number;
  tokenKind?: AuditTokenKind;
  /** Format applied to `tokenSources` entries that do not declare their own. */
  tokenSourceFormat?: AuditTokenSourceFormat | "auto";
  /** Token files: paths, or entries with their own format and base directory. */
  tokenSources?: Array<string | AuditTokenSource>;
  writeBaseline?: boolean;
}

export interface AuditSummary {
  /** Off-scale and token findings in stylesheets. */
  cssWarnings: number;
  /** Audited files with at least one finding. */
  filesWithIssues: number;
  missingTokens: number;
  motionFindings: number;
  /** With `sinceBaseline`: findings not in the baseline. */
  newFindings?: number;
  /** Stylesheets that could not be parsed. They are not findings and are left out of cleanliness. */
  parseErrors: number;
  rawValueCandidates: number;
  rawValueMatches: number;
  /** With `sinceBaseline`: baseline findings no longer present. */
  resolvedFindings?: number;
  /** Share of audited files with no finding, rounded down, so it is never 100 while a file has a finding. */
  scaleCleanliness: number;
  tailwindArbitrarySpacing: number;
  tokenOpportunities: number;
  tokenSources: number;
  /** Every finding: stylesheets, class strings and motion. */
  totalFindings: number;
  unusedTokens: number;
  [key: string]: unknown;
}

export interface AuditScanned {
  /** Authored stylesheets audited: .css plus .scss when postcss-scss is available. Skipped and .stylelintignore'd files are not counted. */
  cssFiles: number;
  /** .scss files found. Audited through postcss-scss when it resolves. */
  scssFiles?: number;
  /** .scss files found but not audited because postcss-scss is not installed. */
  scssSkipped?: number;
  /** Stylesheets Stylelint skipped because the project's own .stylelintignore excludes them. */
  stylelintIgnored?: number;
  /** Stylesheets not audited because they look vendored, generated, test-only, minified or built. 0 with `includeNonAuthored`. */
  nonAuthoredSkipped?: number;
  /** The stylesheets counted in `nonAuthoredSkipped`, with why each was skipped. */
  nonAuthoredFiles?: AuditNonAuthoredFile[];
  templateFiles: number;
  /** Audited stylesheets plus template files. Stylesheets that failed to parse are taken out of this for cleanliness. */
  totalFiles?: number;
  [key: string]: unknown;
}

export interface AuditNonAuthoredFile {
  /** Path as findings name files. */
  file: string;
  /** `path`: a vendor, lib, test, fixture or generated directory; `minified`: `*.min.css`; `bundle`: one line of CSS over 5 KB. */
  reason: "bundle" | "minified" | "path";
}

export interface AuditFinding {
  column?: number;
  file: string;
  /** Class strings: the fixed class, or null when there is no safe fix. */
  fixedToken?: string | null;
  key?: string;
  line?: number;
  /** Class strings: the two nearest scale steps, or null. */
  nearest?: { lower: string; upper: string } | null;
  /** CSS property of the declaration, recovered from the source. Null when the position is not inside a declaration. CSS findings only. */
  property?: string | null;
  /** Class strings: the arbitrary value inside the brackets. */
  rawValue?: string;
  rule?: string;
  /** The finding's message, as the rule reports it. */
  text: string;
  /** Class strings: the whole class, with variants. */
  token?: string;
  /**
   * "off-scale", "token-opportunity", "motion-duration", "motion-easing", "tailwind-arbitrary-spacing",
   * "tailwind-motion-duration", "tailwind-motion-easing", or "parse-error" for a stylesheet that could not be parsed.
   */
  type: string;
  /** Class strings: the utility, such as `p` or `-mt`. */
  utility?: string;
  value?: string | null;
  [key: string]: unknown;
}

export interface AuditBaselineComparison {
  baselineFindings: number;
  /** The baseline file, relative to the working directory. */
  file: string;
  newFindings: AuditFinding[];
  newFindingsCount: number;
  resolvedFindingsCount: number;
  [key: string]: unknown;
}

/** What the audit scanned: the whole directory, or files changed since a ref or staged. */
export interface AuditScanScope {
  changedFiles?: number;
  mode: "full" | "since" | "staged";
  since?: string | null;
  [key: string]: unknown;
}

/** The config file the audit read, or null when there was none or `noConfig` was set. */
export type AuditConfigReference = { file: string } | null;

export type AuditScaleSource = "default" | "explicit" | "fallback" | "scanned-css" | "token-package" | "token-sources";

export type AuditDecisionKind = "adopt" | "allow" | "snap" | "undecided";

/** One entry of the `decisions` section of `.rhythmguardrc.json`. */
export interface AuditDecision {
  value: string;
  decision: AuditDecisionKind;
  /** For `adopt`: the token the value should become. */
  as?: string;
  /** For `allow`: property names or `prefix-*` patterns the allowance is limited to. */
  properties?: string[];
  reason?: string;
}

export interface AuditDecisionSummary {
  adopt: number;
  allow: number;
  snap: number;
  undecided: number;
  suppressed: number;
}

/** One line of `rhythmguard audit --plan`: a decision entry with what the audit saw. */
export interface AuditDecisionPlanEntry extends AuditDecision {
  count: number;
  nearest: string[];
}

export interface AuditScaleRejected {
  files?: string[];
  /** Why the inferred set was not accepted as a scale, for example "no common step". */
  reasons: string[];
  source: AuditScaleSource;
  values: Array<number | string>;
}

export interface AuditScale {
  /** Files the scale was derived from (token sources or scanned stylesheets). Empty for explicit, default and fallback. */
  files: string[];
  /** Present when `source` is "fallback" because an inferred scale failed the plausibility check. */
  rejected?: AuditScaleRejected | null;
  source: AuditScaleSource;
  tokenCount: number;
  values: Array<number | string>;
}

export interface AuditReport {
  decisions?: AuditDecisionSummary | null;
  decisionPlan?: AuditDecisionPlanEntry[];
  baseline?: AuditBaselineComparison | null;
  scale?: AuditScale | null;
  config: AuditConfigReference;
  cssFilesScanned: number;
  directory: string;
  /** Audited files with at least one finding. */
  filesWithIssues: number;
  findings: {
    css: AuditFinding[];
    motion: AuditFinding[];
    /** Stylesheets that could not be parsed, one "parse-error" entry each. They were not audited. */
    parseErrors?: AuditFinding[];
    tailwind: AuditFinding[];
  };
  /** Off-scale CSS findings counted by property, top ten. */
  offScaleProperties?: Record<string, number>;
  /** Off-scale CSS findings counted by value, top ten. */
  offScaleValues?: Record<string, number>;
  /** The report format version; it changes when the report shape does. */
  formatVersion: number;
  motion: { enabled: boolean; findings: number; values: Record<string, number> };
  /** Share of audited files with no finding, rounded down. Same as `summary.scaleCleanliness`. */
  scaleCleanliness: number;
  scanScope: AuditScanScope;
  scanned: AuditScanned;
  summary: AuditSummary;
  /** Off-scale arbitrary values in class strings counted by value, top ten. */
  tailwindArbitraryValues: Record<string, number>;
  templateFilesScanned: number;
  /** Defined, used, unused, missing and conflicting tokens, token chains and ladders. */
  tokenContract: Record<string, unknown>;
  /** Token-opportunity findings counted by value, top ten. */
  tokenOpportunities: Record<string, number>;
  tokenSourceWarnings: string[];
  /** Files with the most findings, most first. */
  topAffectedFiles: Array<{ count: number; file: string }>;
  totalFiles: number;
  /** Every finding. Same as `summary.totalFindings`. */
  totalWarnings: number;
  [key: string]: unknown;
}

export interface AuditContractReport {
  baseline: AuditBaselineComparison | null;
  command: {
    config: AuditConfigReference;
    directory: string;
    scanScope: string;
  };
  contracts: {
    /** Counts per decision kind and how many findings the decisions suppressed; null when the config has no decisions. */
    decisions: AuditDecisionSummary | null;
    motion?: unknown;
    scale: {
      cleanliness?: unknown;
      files: string[];
      offScaleProperties?: Record<string, number>;
      offScaleValues?: unknown;
      rejected: AuditScaleRejected | null;
      source: AuditScaleSource;
      tokenOpportunities?: unknown;
      values: Array<number | string> | null;
    };
    tokens?: unknown;
  };
  findings: unknown;
  scanned: AuditScanned;
  schemaVersion: "2.0";
  summary: AuditSummary;
}

export interface TokenSourceReport {
  file: string;
  format: AuditTokenSourceFormat;
  requestedFormat: AuditTokenSourceFormat;
  tokenCount: number;
  warnings: string[];
}

export interface ParsedTokenSources {
  definitions: Map<string, unknown>;
  sources: TokenSourceReport[];
  warnings: string[];
}

export const AUDIT_JSON_SCHEMA: Readonly<Record<string, unknown>>;

export function createAuditReport(options?: AuditOptions): Promise<AuditReport>;

/** The parsed `.rhythmguardrc.json`, or null when there is none or `noConfig` is set. Throws on an invalid file. */
export function loadAuditConfig(options?: AuditOptions): {
  audit: Record<string, unknown>;
  decisions: unknown;
  file: string;
  rootDir: string;
} | null;

export function parseTokenSources(options?: {
  baseFontSize?: number;
  sources?: AuditTokenSource[];
  tokenKind?: AuditTokenKind;
  /** Warn about a source that parses but yields no token of `tokenKind`, as the audit does. Default false. */
  warnWhenEmpty?: boolean;
}): ParsedTokenSources;

export function toAuditContractReport(report: AuditReport): AuditContractReport;

declare const audit: {
  AUDIT_JSON_SCHEMA: typeof AUDIT_JSON_SCHEMA;
  createAuditReport: typeof createAuditReport;
  loadAuditConfig: typeof loadAuditConfig;
  parseTokenSources: typeof parseTokenSources;
  toAuditContractReport: typeof toAuditContractReport;
};

export default audit;
