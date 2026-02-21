import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const presets = require('./index.js');

export default presets;
export const scales = presets.scales;
export const communityScaleMetadata = presets.communityScaleMetadata;
export const listScalePresetNames = presets.listScalePresetNames;
export const listCommunityScalePresetNames = presets.listCommunityScalePresetNames;
export const getScalePreset = presets.getScalePreset;
export const getCommunityScaleMetadata = presets.getCommunityScaleMetadata;
