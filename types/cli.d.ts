/** The usage text printed by `rhythmguard --help`. */
export const HELP: string;

/** Run the rhythmguard CLI against `process.argv`. Exits the process on completion or error. */
export function main(): void;

/** `pass` and `skip` never fail a run; `warn` is worth reading; `fail` makes `ok` false. */
export type DoctorCheckStatus = "pass" | "fail" | "warn" | "skip";

export interface DoctorCheck {
  /** Stable name of the check, such as `stylelint-config`, `scale` or `eslint-scale`. Several checks can share one. */
  id: string;
  status: DoctorCheckStatus;
  /** One line describing what was found. */
  message: string;
  /** What to do about a failure or warning, often an exact `npm install` command. */
  fix?: string;
}

export interface DoctorScale {
  /** The scale in px, sorted. */
  values: number[];
  /** Where it comes from, in words: `the "scale" option of rhythmguard/use-scale`, `scale "auto" on ..., from scaleSources: tokens.json`. */
  label: string;
  /**
   * The resolution step that produced it: `explicit`, `preset` or `default` for a
   * configured scale; `scaleSources`, `rhythmguardrc`, `stylesheet`, `tailwind`,
   * `token-package` or `fallback` for `scale: "auto"`; `tailwind-default` for
   * the ESLint rule with no `scale`.
   */
  source: string;
  /** Token files the scale was read from, relative to `cwd`. */
  files: string[];
  /** True when the scale is the default (Stylelint) or Tailwind's default ladder (ESLint). */
  isDefault: boolean;
  /** Why a token source gave nothing, when `scale: "auto"` fell back. */
  warnings: string[];
}

export interface DoctorResult {
  /** False when any check failed. `rhythmguard doctor` exits 1 then. */
  ok: boolean;
  /** The directory checked, absolute. */
  cwd: string;
  /** `eslint-only` when there is no Stylelint and Rhythmguard is used through ESLint; the Stylelint checks are skipped then. */
  setup: "stylelint" | "eslint-only";
  /** Number of failed checks. */
  issues: number;
  /** Number of warnings. */
  warnings: number;
  /** Every check, in the order the CLI prints them. */
  checks: DoctorCheck[];
  /** The spacing scale the Stylelint rules check, or null when it was not resolved. */
  scale: DoctorScale | null;
  /** The spacing scale `tailwind-class-use-scale` checks, or null when ESLint does not run it. */
  eslintScale: DoctorScale | null;
}

export interface DoctorOptions {
  /** The project directory. Default: `process.cwd()`. */
  cwd?: string;
}

/**
 * The checks `rhythmguard doctor` runs, as a function: loads the project's
 * own Stylelint and ESLint configs, lints one file with each, and resolves
 * the spacing scale. Writes nothing and never exits the process.
 */
export function runDoctor(options?: DoctorOptions): Promise<DoctorResult>;

/** The text `rhythmguard doctor` prints for a result. */
export function formatDoctorReport(result: DoctorResult): string;

/** A few lines for another command to print: the count, the scale on success, each failure with its fix. */
export function doctorSummary(resultOrChecks: DoctorResult | readonly DoctorCheck[]): string;

declare const cli: {
  HELP: string;
  main: typeof main;
  runDoctor: typeof runDoctor;
  formatDoctorReport: typeof formatDoctorReport;
  doctorSummary: typeof doctorSummary;
};

export default cli;
