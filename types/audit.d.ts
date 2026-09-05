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
}

export interface AuditOptions {
  baseFontSize?: number;
  baselinePath?: string;
  /** Path to a `.rhythmguardrc.json`-style config. Defaults to `.rhythmguardrc.json` in `cwd`. */
  configPath?: string;
  dir?: string;
  failOnNewDrift?: boolean;
  format?: "json" | "json-v1" | "markdown" | "text" | "html" | "github";
  ignorePath?: string;
  ignorePatterns?: string[];
  includeMotion?: boolean;
  maxFindings?: number;
  minCleanliness?: number;
  /** Skip config discovery entirely (equivalent to `--no-config`). */
  noConfig?: boolean;
  /** Write rendered output to this file instead of stdout (equivalent to `--output`). */
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
  tokenSources?: AuditTokenSource[];
  writeBaseline?: boolean;
}

export interface AuditSummary {
  cleanliness: number;
  filesWithFindings: number;
  findingCount: number;
  motionFindingCount?: number;
  tokenOpportunityCount?: number;
  [key: string]: unknown;
}

export interface AuditScanned {
  /** Authored stylesheets scanned: .css plus .scss when postcss-scss is available. */
  cssFiles: number;
  /** .scss files found. Audited through postcss-scss when it resolves. */
  scssFiles?: number;
  /** .scss files found but not audited because postcss-scss is not installed. */
  scssSkipped?: number;
  templateFiles: number;
  totalFiles?: number;
  [key: string]: unknown;
}

export interface AuditFinding {
  column?: number;
  file: string;
  key?: string;
  line?: number;
  message: string;
  property?: string;
  rule?: string;
  type: string;
  value?: string;
  [key: string]: unknown;
}

export interface AuditBaselineComparison {
  baselineFindings: number;
  newFindings: AuditFinding[];
  newFindingsCount: number;
  resolvedFindings: AuditFinding[];
  resolvedFindingsCount: number;
  [key: string]: unknown;
}

export type AuditScaleSource = "default" | "explicit" | "fallback" | "scanned-css" | "token-sources";

export interface AuditScale {
  /** Files the scale was derived from (token sources or scanned stylesheets). Empty for explicit, default and fallback. */
  files: string[];
  source: AuditScaleSource;
  tokenCount: number;
  values: Array<number | string>;
}

export interface AuditReport {
  baseline?: AuditBaselineComparison | null;
  scale?: AuditScale | null;
  config?: string | null;
  directory: string;
  findings: {
    css: AuditFinding[];
    motion: AuditFinding[];
    tailwind: AuditFinding[];
  };
  scanned: AuditScanned;
  summary: AuditSummary;
  [key: string]: unknown;
}

export interface AuditContractReport {
  baseline: AuditBaselineComparison | null;
  command: {
    config?: string | null;
    directory: string;
    scanScope: string;
  };
  contracts: {
    motion?: unknown;
    scale: {
      cleanliness?: unknown;
      files: string[];
      offScaleValues?: unknown;
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

export function loadAuditConfig(options?: AuditOptions): Record<string, unknown>;

export function parseTokenSources(options?: {
  baseFontSize?: number;
  sources?: AuditTokenSource[];
  tokenKind?: AuditTokenKind;
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
