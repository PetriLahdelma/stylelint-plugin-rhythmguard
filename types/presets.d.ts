import type { RhythmguardPresets } from "./shared";

export type { RhythmguardPresets, ScalePresetMetadata } from "./shared";

export const communityScaleMetadata: RhythmguardPresets["communityScaleMetadata"];
export const getCommunityScaleMetadata: RhythmguardPresets["getCommunityScaleMetadata"];
export const getScalePreset: RhythmguardPresets["getScalePreset"];
export const listCommunityScalePresetNames: RhythmguardPresets["listCommunityScalePresetNames"];
export const listScalePresetNames: RhythmguardPresets["listScalePresetNames"];
export const scales: RhythmguardPresets["scales"];

declare const presets: RhythmguardPresets;

export default presets;
