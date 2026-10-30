/**
 * Compile-time consumer of the public declarations.
 * `npm run typecheck` fails if any published export or type drifts.
 * Nothing here runs; it only has to type-check.
 */
import plugin, { audit, configs, eslint, presets, rules } from 'stylelint-plugin-rhythmguard';
import type {
  AuditContractReport,
  AuditReport,
  RhythmguardRuleOptions,
  RhythmguardStylelintConfig,
  ScalePresetMetadata,
} from 'stylelint-plugin-rhythmguard';
import { createAuditReport, toAuditContractReport } from 'stylelint-plugin-rhythmguard/audit';
import eslintPlugin from 'stylelint-plugin-rhythmguard/eslint';
import { getScalePreset, listScalePresetNames } from 'stylelint-plugin-rhythmguard/presets';
import recommended from 'stylelint-plugin-rhythmguard/configs/recommended';
import embed from 'stylelint-plugin-rhythmguard/configs/embed';
import useScale, { ruleName as useScaleName } from 'stylelint-plugin-rhythmguard/rules/use-scale';

const pluginConfigs: readonly RhythmguardStylelintConfig[] = [
  plugin.configs.recommended,
  plugin.configs.strict,
  plugin.configs.tailwind,
  plugin.configs.motion,
  configs.recommended,
  plugin.configs.embed,
  embed,
  recommended,
];

const ruleOptions: RhythmguardRuleOptions = {
  preset: 'rhythmic-4',
  scale: [0, 4, 8, 12, 16],
  tokenMap: { '4px': 'var(--space-1)' },
  tokenMapFromCssCustomProperties: true,
};

const autoScaleOptions: RhythmguardRuleOptions = {
  scale: 'auto',
  scaleSources: ['./tokens.json', { path: './theme.css', format: 'css' }],
  tailwindConfigPath: './tailwind.config.mjs',
};

const useScaleRule = rules['rhythmguard/use-scale'];
const fixable: boolean | undefined = useScaleRule.meta.fixable;
const docUrl: string | undefined = useScale.meta.url;
const name: string = useScaleName;

const presetNames: string[] = listScalePresetNames();
const preset = getScalePreset('rhythmic-4');
// Unknown names return null, as the runtime does (#281).
const missingPreset: readonly number[] | null = getScalePreset('nope');
const missingMetadata: ScalePresetMetadata | null = presets.getCommunityScaleMetadata('nope');
const presetsAgain: string[] = presets.listScalePresetNames();

const eslintRule = eslint.rules['tailwind-class-use-scale'];
const eslintRuleAgain = eslintPlugin.rules['tailwind-class-use-motion-scale'];

async function runAudit(): Promise<AuditContractReport> {
  const report: AuditReport = await createAuditReport({ dir: './src', noConfig: true });
  const viaPlugin: AuditReport = await audit.createAuditReport({ dir: './src', scale: undefined });
  void viaPlugin;
  // The fields the runtime report has (#284).
  const cleanliness: number = report.summary.scaleCleanliness + report.scaleCleanliness;
  const counts: number = report.summary.totalFindings + report.summary.filesWithIssues + report.filesWithIssues;
  const configFile: string | undefined = report.config?.file;
  const firstText: string | undefined = report.findings.css[0]?.text;
  const resolved: number | undefined = report.baseline?.resolvedFindingsCount;
  const contractConfig: { file: string } | null = toAuditContractReport(report).command.config;
  // Non-authored stylesheets: skipped by default, listed with a reason (#161).
  const withVendored: AuditReport = await createAuditReport({ dir: './src', includeNonAuthored: true });
  const skippedFiles: string[] = (report.scanned.nonAuthoredFiles ?? []).map((entry) => `${entry.file} (${entry.reason})`);
  const skippedCount: number | undefined = withVendored.scanned.nonAuthoredSkipped;
  void cleanliness;
  void counts;
  void configFile;
  void firstText;
  void resolved;
  void contractConfig;
  void skippedFiles;
  void skippedCount;
  return toAuditContractReport(report);
}

void pluginConfigs;
void ruleOptions;
void autoScaleOptions;
void fixable;
void docUrl;
void name;
void presetNames;
void preset;
void missingPreset;
void missingMetadata;
void presetsAgain;
void eslintRule;
void eslintRuleAgain;
void runAudit;
