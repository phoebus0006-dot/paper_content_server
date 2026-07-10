#!/usr/bin/env node
// docs-consistency-check.js — validate documentation baseline integrity
var fs = require('fs');
var path = require('path');
var DOCS = path.join(__dirname, '..', 'docs');
var exitCode = 0;

function check(ok, msg) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + msg);
  if (!ok) exitCode = 1;
}

// Required files
var required = [
  'PRODUCT_REQUIREMENTS.md', 'ACCEPTANCE_CRITERIA.md', 'SYSTEM_ARCHITECTURE.md',
  'DOMAIN_MODEL.md', 'API_CONTRACT.md', 'MQTT_CONTRACT.md', 'NEWS_PIPELINE.md',
  'IMAGE_LIBRARY_ARCHITECTURE.md', 'CONTENT_SAFETY.md', 'RENDERING_AND_EPF1.md',
  'DATA_STORAGE.md', 'TEST_STRATEGY.md', 'REVIEW_GUIDE.md', 'DEPLOYMENT_RUNBOOK.md',
  'REFACTOR_ROADMAP.md', 'TRACEABILITY_MATRIX.md', 'PROJECT_GOVERNANCE.md',
  'DOCUMENT_CONTROL.md', 'CURRENT_STATE_BASELINE.md', 'CURRENT_IMPLEMENTATION_MAP.md',
  'INDEPENDENT_AUDIT_HANDOFF.md', 'KNOWN_INCIDENTS_AND_LESSONS.md',
  'AUDIT_PROTOCOL.md', 'BASELINE_INVARIANTS.md', 'PHASE_GATE_STANDARD.md',
];
required.forEach(function(f) {
  var fp = path.join(DOCS, f);
  check(fs.existsSync(fp), 'Required doc exists: ' + f);
});

// ADR files
var adrs = ['0001', '0002', '0003', '0004', '0005', '0006'];
adrs.forEach(function(n) {
  var dir = path.join(DOCS, 'adr');
  var found = fs.readdirSync(dir).filter(function(f) { return f.startsWith(n); });
  check(found.length > 0, 'ADR ' + n + ' exists: ' + (found[0] || 'MISSING'));
});

// ACCEPTANCE must not contain old model terms
var acc = fs.readFileSync(path.join(DOCS, 'ACCEPTANCE_CRITERIA.md'), 'utf8');
check(acc.indexOf('poolType=study_frames') < 0, 'ACCEPTANCE: no poolType=study_frames');
check(acc.indexOf('decorative_photos') < 0, 'ACCEPTANCE: no decorative_photos');

// Active docs must not contain wrong patterns
var activeDocs = ['PRODUCT_REQUIREMENTS.md', 'ACCEPTANCE_CRITERIA.md', 'DOMAIN_MODEL.md',
  'API_CONTRACT.md', 'MQTT_CONTRACT.md', 'NEWS_PIPELINE.md', 'IMAGE_LIBRARY_ARCHITECTURE.md',
  'CONTENT_SAFETY.md', 'SYSTEM_ARCHITECTURE.md'];
var badPatterns = [
  'custom library only', 'disable automatic image fetching',
  'summaryLines strictly equals 3', 'MQTT replaces HTTP',
];
activeDocs.forEach(function(f) {
  var fp = path.join(DOCS, f);
  if (!fs.existsSync(fp)) return;
  var text = fs.readFileSync(fp, 'utf8');
  badPatterns.forEach(function(pat) {
    check(text.indexOf(pat) < 0, f + ': no "' + pat + '"');
  });
});

// README links must exist
var readme = fs.readFileSync(path.join(DOCS, 'README.md'), 'utf8');
var links = readme.match(/\(([^\)]+\.md)\)/g) || [];
links.forEach(function(link) {
  var f = link.replace(/[\(\ \)]/g, '');
  var fp = path.join(DOCS, f);
  check(fs.existsSync(fp), 'README link exists: ' + f);
});

// CURRENT_STATE status values
var cs = fs.readFileSync(path.join(DOCS, 'CURRENT_STATE_BASELINE.md'), 'utf8');
var validStatuses = ['IMPLEMENTED_AND_VERIFIED', 'IMPLEMENTED_NOT_PRODUCTION_VERIFIED',
  'PARTIAL', 'NOT_IMPLEMENTED', 'BLOCKED', 'UNKNOWN'];
var statuses = cs.match(/\| [A-Z_]+ \|/g) || [];
statuses.forEach(function(s) {
  var st = s.replace(/\| /g, '').trim();
  if (validStatuses.indexOf(st) < 0 && st !== 'Status') {
    check(false, 'CURRENT_STATE invalid status: ' + st);
  }
});

console.log('\n=== exitCode=' + exitCode + ' ===');
process.exit(exitCode);
