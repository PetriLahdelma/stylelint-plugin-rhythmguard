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
  config?: string;
  dir?: string;
  failOnNewDrift?: boolean;
  format?: "json" | "json-v1" | "markdown" | "text" | "html";
  ignorePath?: string;
  ignorePatterns?: string[];
  includeMotion?: boolean;
  maxFindings?: number;
  minCleanliness?: number;
  output?: string;
  scale?: Array<number | string>;
  since?: string;
  sinceBaseline?: boolean;
  staged?: boolean;
  tokenCandidateMinCount?: number;
  tokenKind?: AuditTokenKind;
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
  cssFiles: number;
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

export interface AuditReport {
  baseline?: AuditBaselineComparison | null;
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
      offScaleValues?: unknown;
      tokenOpportunities?: unknown;
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
