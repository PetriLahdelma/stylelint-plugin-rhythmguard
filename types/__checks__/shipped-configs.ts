/**
 * Compile-time check that every config the package ships fits the public
 * Stylelint config type (#280). Each src/configs/*.js declares that type in a
 * JSDoc `@type` and is type-checked itself (tsconfig.typecheck.json includes
 * src/configs), so an option the types lack fails `npm run typecheck`. A
 * contract test keeps this list and the annotations in step with src/configs.
 * Nothing here runs; it only has to type-check.
 */
import type {
  RhythmguardMotionRuleOptions,
  RhythmguardPreferTokenOptions,
  RhythmguardRuleOptions,
  RhythmguardStylelintConfig,
  RhythmguardTransformRuleOptions,
  RhythmguardUseScaleOptions,
} from 'stylelint-plugin-rhythmguard';
import embed from '../../src/configs/embed.js';
import motion from '../../src/configs/motion.js';
import recommended from '../../src/configs/recommended.js';
import strict from '../../src/configs/strict.js';
import tailwind from '../../src/configs/tailwind.js';

const shipped: Record<'embed' | 'motion' | 'recommended' | 'strict' | 'tailwind', RhythmguardStylelintConfig> = {
  embed,
  motion,
  recommended,
  strict,
  tailwind,
};

// Stylelint's own secondary options sit next to the rule's options.
const withStylelintOptions: RhythmguardRuleOptions = {
  disableFix: true,
  message: (value: string) => `Spacing ${value} is off the scale`,
  reportDisables: true,
  severity: 'warning',
  url: 'https://example.com/spacing',
};

const useScale: RhythmguardUseScaleOptions = {
  allowNegative: false,
  allowPercentages: true,
  enforceInsideMathFunctions: true,
  fixToScale: false,
  ignoreMathFunctionArguments: { clamp: [2] },
  ignoreValues: ['auto'],
  mathFunctionArguments: { calc: [1] },
  propertyGroups: ['spacing', 'radius'],
  propertyScales: { '/^margin/': { preset: 'rhythmic-4' }, gap: [0, 8, 16], padding: 'rhythmic-8' },
  scales: { radius: [0, 2, 4], typography: 'auto' },
  tokenFunctions: ['var', 'theme'],
  unitStrategy: 'exact',
  units: ['px', 'vw'],
};

const transform: RhythmguardTransformRuleOptions = { allowNegative: true, fixWith: 'token', tokenPattern: '^--space-' };

const preferToken: RhythmguardPreferTokenOptions = {
  allowNumericScale: true,
  tokenMap: { '16px': 'var(--space-4)' },
  tokenMapFile: './tokens.json',
};

const motionOptions: RhythmguardMotionRuleOptions = {
  durationScale: [0, 100, 200],
  durationUnits: ['ms'],
  easingTokenMap: { 'cubic-bezier(.2,0,0,1)': 'var(--ease-standard)' },
  fixToScale: false,
  severity: 'error',
};

const perRule: RhythmguardStylelintConfig = {
  rules: {
    'rhythmguard/no-offscale-transform': [true, transform],
    'rhythmguard/prefer-token': [true, preferToken],
    'rhythmguard/use-motion-scale': [true, motionOptions],
    'rhythmguard/use-scale': [true, useScale],
    'other-plugin/rule': [true],
  },
};

const motionOnScaleRule: RhythmguardStylelintConfig = {
  // @ts-expect-error durationScale belongs to use-motion-scale, not use-scale.
  rules: { 'rhythmguard/use-scale': [true, { durationScale: [100] }] },
};

const unknownOption: RhythmguardUseScaleOptions = {
  // @ts-expect-error not an option: Stylelint rejects unknown option names.
  includeMathFunctions: true,
};

void shipped;
void withStylelintOptions;
void perRule;
void motionOnScaleRule;
void unknownOption;
