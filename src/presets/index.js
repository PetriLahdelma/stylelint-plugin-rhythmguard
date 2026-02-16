'use strict';

const {
  SCALE_PRESETS,
  getScalePreset,
  listScalePresetNames,
} = require('./scales');

module.exports = {
  scales: SCALE_PRESETS,
  getScalePreset,
  listScalePresetNames,
};
