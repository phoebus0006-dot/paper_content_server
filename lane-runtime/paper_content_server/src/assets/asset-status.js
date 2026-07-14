// asset-status.js — Asset lifecycle status definitions, transitions, and stable legacy ID
var crypto = require('crypto');

var LIFECYCLE_STATUS_LIST = ['DISCOVERED','DOWNLOADED','VALIDATED','SELECTABLE','BLOCKED','TOMBSTONED','DELETED'];
var LIFECYCLE_STATUS = {}; LIFECYCLE_STATUS_LIST.forEach(function(s){LIFECYCLE_STATUS[s]=s;});

var LIBRARY_TYPE_LIST = ['LEARNING','CUSTOM','LEGACY_STUDY','LEGACY_DECORATIVE'];
var LIBRARY_TYPE = {}; LIBRARY_TYPE_LIST.forEach(function(s){LIBRARY_TYPE[s]=s;});

var SAFETY_STATUS_LIST = ['UNKNOWN','PENDING','SAFE','UNSAFE','SUSPICIOUS'];
var SAFETY_STATUS = {}; SAFETY_STATUS_LIST.forEach(function(s){SAFETY_STATUS[s]=s;});

var RELEVANCE_STATUS_LIST = ['UNKNOWN','RELEVANT','IRRELEVANT'];
var RELEVANCE_STATUS = {}; RELEVANCE_STATUS_LIST.forEach(function(s){RELEVANCE_STATUS[s]=s;});

var QUALITY_STATUS_LIST = ['UNKNOWN','ACCEPTABLE','REJECTED'];
var QUALITY_STATUS = {}; QUALITY_STATUS_LIST.forEach(function(s){QUALITY_STATUS[s]=s;});

var DECODE_STATUS_LIST = ['PENDING','SUCCESS','FAILED'];
var DECODE_STATUS = {}; DECODE_STATUS_LIST.forEach(function(s){DECODE_STATUS[s]=s;});

var TRANSITIONS = {};
TRANSITIONS[LIFECYCLE_STATUS.DISCOVERED]  = [LIFECYCLE_STATUS.DOWNLOADED, LIFECYCLE_STATUS.BLOCKED];
TRANSITIONS[LIFECYCLE_STATUS.DOWNLOADED]  = [LIFECYCLE_STATUS.VALIDATED, LIFECYCLE_STATUS.BLOCKED];
TRANSITIONS[LIFECYCLE_STATUS.VALIDATED]   = [LIFECYCLE_STATUS.SELECTABLE, LIFECYCLE_STATUS.BLOCKED];
TRANSITIONS[LIFECYCLE_STATUS.SELECTABLE]  = [LIFECYCLE_STATUS.BLOCKED];
TRANSITIONS[LIFECYCLE_STATUS.BLOCKED]     = [LIFECYCLE_STATUS.TOMBSTONED];
TRANSITIONS[LIFECYCLE_STATUS.TOMBSTONED]  = [LIFECYCLE_STATUS.DELETED];
TRANSITIONS[LIFECYCLE_STATUS.DELETED]     = [];

function canTransition(from, to) {
  var allowed = TRANSITIONS[from];
  return allowed ? allowed.indexOf(to) >= 0 : false;
}

function assertTransition(from, to) {
  if (!canTransition(from, to)) throw new Error('Forbidden transition: ' + from + ' -> ' + to);
}

function canBeSelected(safety, lifecycle) {
  return safety === 'SAFE' && lifecycle === 'SELECTABLE';
}

function isValidEnum(value, allowedList) {
  return allowedList.indexOf(value) >= 0;
}

// Stable deterministic legacy asset ID — no random, no date
function legacyAssetId(namespace, legacyId, localPath, sourceUrl) {
  var parts = [
    String(namespace || 'unknown'),
    String(legacyId || ''),
    String(localPath || ''),
    String(sourceUrl || ''),
  ];
  var hash = crypto.createHash('sha256').update(parts.join('\n')).digest('hex');
  return 'ast_' + hash.slice(0, 24);
}

module.exports = {
  LIFECYCLE_STATUS: LIFECYCLE_STATUS,
  LIFECYCLE_STATUS_LIST: LIFECYCLE_STATUS_LIST,
  LIBRARY_TYPE: LIBRARY_TYPE,
  LIBRARY_TYPE_LIST: LIBRARY_TYPE_LIST,
  SAFETY_STATUS: SAFETY_STATUS,
  SAFETY_STATUS_LIST: SAFETY_STATUS_LIST,
  RELEVANCE_STATUS: RELEVANCE_STATUS,
  RELEVANCE_STATUS_LIST: RELEVANCE_STATUS_LIST,
  QUALITY_STATUS: QUALITY_STATUS,
  QUALITY_STATUS_LIST: QUALITY_STATUS_LIST,
  DECODE_STATUS: DECODE_STATUS,
  DECODE_STATUS_LIST: DECODE_STATUS_LIST,
  canTransition: canTransition,
  assertTransition: assertTransition,
  canBeSelected: canBeSelected,
  isValidEnum: isValidEnum,
  legacyAssetId: legacyAssetId,
};
