'use strict';

/**
 * The one-liner for shared-config authors.
 *
 * One rule, warning level, scale inferred from the consuming project's own
 * spacing tokens (scaleSources, .rhythmguardrc.json token sources, the
 * stylesheet's custom properties, a Tailwind config, then rhythmic-4).
 * No `extends`, no dependency beyond this plugin, and the shape is frozen for
 * the life of a major version so a config that embeds it never changes
 * behaviour on a minor bump.
 */
module.exports = {
  plugins: ['stylelint-plugin-rhythmguard'],
  rules: {
    'rhythmguard/use-scale': [
      true,
      {
        scale: 'auto',
        severity: 'warning',
      },
    ],
  },
};
