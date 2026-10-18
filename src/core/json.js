'use strict';

const fs = require('node:fs');

const BYTE_ORDER_MARK = /^\uFEFF/;

/** Text without a leading UTF-8 byte order mark, which some Windows editors write and JSON.parse rejects (issue #291). */
function stripBom(text) {
  return String(text).replace(BYTE_ORDER_MARK, '');
}

/** JSON.parse for files people edit: a leading byte order mark is tolerated. */
function parseJson(text) {
  return JSON.parse(stripBom(text));
}

function readJsonFile(file) {
  return parseJson(fs.readFileSync(file, 'utf8'));
}

module.exports = {
  parseJson,
  readJsonFile,
  stripBom,
};
