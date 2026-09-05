# Scale presets

Use a preset by name in any rule that accepts `preset`. `customScale` and `scale` override it.

## Built-in presets

| Preset | Pattern | Scale |
| --- | --- | --- |
| `rhythmic-4` | 4pt rhythm (default) | `[0,4,8,12,16,24,32,40,48,64]` |
| `rhythmic-8` | 8pt rhythm | `[0,8,16,24,32,40,48,64,80,96]` |
| `product-material-8dp` | Material 8dp baseline + 4dp increments | `[0,4,8,12,16,24,32,40,48,56,64,72,80]` |
| `product-atlassian-8px` | Atlassian-like product spacing | `[0,2,4,6,8,12,16,20,24,32,40,48,64,80]` |
| `product-carbon-2x` | Carbon 2x spacing | `[0,2,4,8,12,16,24,32,40,48,64,80]` |
| `editorial-baseline-4` | Editorial baseline at 4-unit cadence | `[0,4,8,12,16,20,24,28,32,40,48,56,64]` |
| `editorial-baseline-6` | Editorial baseline at 6-unit cadence | `[0,6,12,18,24,30,36,48,60,72]` |
| `compact` | Dense UI spacing | `[0,2,4,6,8,12,16,20,24,32]` |
| `fibonacci` | Fibonacci progression | `[0,2,3,5,8,13,21,34,55,89]` |
| `powers-of-two` | Geometric doubling | `[0,2,4,8,16,32,64,128]` |
| `golden-ratio` | Ratio 1.618 | generated modular sequence |
| `modular-major-second` | Ratio 1.125 | generated modular sequence |
| `modular-minor-third` | Ratio 1.2 | generated modular sequence |
| `modular-major-third` | Ratio 1.25 | generated modular sequence |
| `modular-augmented-fourth` | Ratio 1.414 | generated modular sequence |
| `modular-perfect-fourth` | Ratio 1.333 | generated modular sequence |
| `modular-perfect-fifth` | Ratio 1.5 | generated modular sequence |

Aliases: `4pt`, `8pt`, `material`, `atlassian-8`, `carbon`, `baseline-4`, `baseline-6`, `golden`, `major-second`, `minor-third`, `major-third`, `augmented-fourth`, `perfect-fourth`, `perfect-fifth` map to the matching preset above.

Product presets follow widely used design-system spacing frameworks. Editorial presets model baseline-grid cadence for long-form typography. Theory presets expose modular scales from typographic proportion systems. Sources and reasoning are in [`SCALE_RESEARCH.md`](./SCALE_RESEARCH.md).

## Community presets

Community scales live in `scales/community/*.json` and are loaded as presets alongside the built-ins.

| Preset | Base | Pattern | Contributor |
| --- | --- | --- | --- |
| `product-decimal-10` | `10` | Decimal-friendly dashboard cadence | [Petri Lahdelma](https://github.com/PetriLahdelma) |

To contribute one:

```bash
npm run scales:add -- --name my-team-scale --base 8 --steps 0,4,8,12,16,24,32
npm run scales:validate
```

Then open a pull request with the JSON file. Spec, validation rules and policy: [`COMMUNITY_SCALES.md`](./COMMUNITY_SCALES.md). If your scale is private or niche, keep it in your own config with `customScale` instead.

## Programmatic access

```js
const rhythmguard = require('stylelint-plugin-rhythmguard');

rhythmguard.presets.listScalePresetNames();
rhythmguard.presets.listCommunityScalePresetNames();
rhythmguard.presets.getCommunityScaleMetadata('product-decimal-10');
rhythmguard.presets.scales['rhythmic-4'];
```

Also available as `stylelint-plugin-rhythmguard/presets` with TypeScript declarations.
