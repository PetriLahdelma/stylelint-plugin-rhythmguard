'use strict';

const {
  COMMUNITY_SCALE_METADATA,
  SCALE_PRESETS,
  getCommunityScaleMetadata,
  getScalePreset,
  listCommunityScalePresetNames,
  listScalePresetNames,
} = require('./scales');

module.exports = {
  communityScaleMetadata: COMMUNITY_SCALE_METADATA,
  getCommunityScaleMetadata,
  getScalePreset,
  listCommunityScalePresetNames,
  listScalePresetNames,
  scales: SCALE_PRESETS,
};
