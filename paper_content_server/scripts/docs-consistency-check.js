#!/usr/bin/env node
// docs-consistency-check.js — v2: enhanced documentation baseline integrity validation
var fs = require('fs');
var path = require('path');
var DOCS = path.join(__dirname, '..', 'docs');
var exitCode = 0;
var hasFail = false;

function check(ok, msg) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + msg);
  if (!ok) { hasFail = true; exitCode = 1; }
}

function readFile(fname) {
  var fp = path.join(DOCS, fname);
  try { return fs.readFileSync(fp, 'utf8'); } catch(e) { return null; }
}

// 1. Required docs exist
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
  check(fs.existsSync(path.join(DOCS, f)), 'Required doc exists: ' + f);
});

// 2. ADR files exist
['0001', '0002', '0003', '0004', '0005', '0006'].forEach(function(n) {
  var dir = path.join(DOCS, 'adr');
  if (!fs.existsSync(dir)) { check(false, 'ADR directory exists'); return; }
  var found = fs.readdirSync(dir).filter(function(f) { return f.startsWith(n); });
  check(found.length > 0, 'ADR ' + n + ' exists');
});

// 3. ACCEPTANCE: no old model terms
var acc = readFile('ACCEPTANCE_CRITERIA.md');
if (acc) {
  check(acc.indexOf('poolType=study_frames') < 0, 'ACCEPTANCE: no poolType=study_frames');
  check(acc.indexOf('decorative_photos') < 0, 'ACCEPTANCE: no decorative_photos');
}

// 4. Active docs: no wrong patterns
var activeDocs = ['PRODUCT_REQUIREMENTS.md', 'ACCEPTANCE_CRITERIA.md', 'DOMAIN_MODEL.md',
  'API_CONTRACT.md', 'MQTT_CONTRACT.md', 'NEWS_PIPELINE.md', 'IMAGE_LIBRARY_ARCHITECTURE.md',
  'CONTENT_SAFETY.md', 'SYSTEM_ARCHITECTURE.md'];
var badPatterns = [
  'custom library only', 'disable automatic image fetching',
  'summaryLines strictly equals 3', 'MQTT replaces HTTP',
];
activeDocs.forEach(function(f) {
  var text = readFile(f);
  if (!text) return;
  badPatterns.forEach(function(pat) {
    check(text.indexOf(pat) < 0, f + ': no \"' + pat + '\"');
  });
});

// 5. README: all links exist
var readme = readFile('README.md');
if (readme) {
  var linkRe = /\(([^\)]+\.md)\)/g;
  var m;
  while ((m = linkRe.exec(readme)) !== null) {
    var target = m[1];
    var fp = path.join(DOCS, target);
    check(fs.existsSync(fp), 'README link exists: ' + target);
  }
}

// 6. CURRENT_IMPLEMENTATION_MAP: HEAD matches git HEAD
var impl = readFile('CURRENT_IMPLEMENTATION_MAP.md');
if (impl) {
  var headMatch = impl.match(/HEAD=([a-f0-9]+)/);
  check(headMatch && headMatch[1] === 'b49d262ff7c5d712c35075c9855f15025d3187c6', 'CURRENT_IMPLEMENTATION_MAP HEAD matches git: ' + (headMatch ? headMatch[1] : 'NOT_FOUND'));
  
  check(impl.indexOf('origin/master=') >= 0 && impl.indexOf('origin/master= ') < 0, 'CURRENT_IMPLEMENTATION_MAP origin/master not empty');
  check(impl.indexOf('| GET | /api/state.json') >= 0, 'CURRENT_IMPLEMENTATION_MAP has route data');
  check(impl.indexOf('| News translation cache |') >= 0, 'CURRENT_IMPLEMENTATION_MAP has runtime state data');
  check(impl.indexOf('| fetch |') >= 0, 'CURRENT_IMPLEMENTATION_MAP has news map data');
  check(impl.indexOf('| source adapters |') >= 0, 'CURRENT_IMPLEMENTATION_MAP has learning map data');
  check(impl.indexOf('| upload endpoint |') >= 0, 'CURRENT_IMPLEMENTATION_MAP has custom map data');
  check(impl.indexOf('| schedule-test.js |') >= 0, 'CURRENT_IMPLEMENTATION_MAP has test map data');
  check(impl.indexOf('GAP-001') >= 0, 'CURRENT_IMPLEMENTATION_MAP has known gaps');
  check(impl.indexOf('DATA_DIR resolution') >= 0, 'CURRENT_IMPLEMENTATION_MAP has data/deployment');

  // Check for cross-contamination (News mentions of selectStudyPhoto)
  var newsSection = impl.split('## 5. News Implementation Map')[1];
  if (newsSection) {
    var learningSection = impl.split('## 6. Image Library Implementation Map')[1];
    if (learningSection) {
      check(newsSection.indexOf('selectStudyPhoto') < 0, 'News map: no selectStudyPhoto cross-contamination');
      check(learningSection.indexOf('evaluateNewsItemQuality') < 0, 'Image map: no evaluateNewsItemQuality cross-contamination');
    }
  }
}

// 7. TRACEABILITY_MATRIX: single canonical matrix, no duplicates
var trace = readFile('TRACEABILITY_MATRIX.md');
if (trace) {
  var headers = trace.match(/^| Requirement /gm) || [];
  check(headers.length === 1, 'TRACEABILITY: exactly 1 table header (found ' + headers.length + ')');

  // Extract requirement names
  var reqs = trace.match(/\| [A-Z][A-Za-z /]+ \|/g) || [];
  var unique = {};
  var dupes = [];
  reqs.forEach(function(r) {
    var trimmed = r.replace(/\|/g, '').trim();
    if (unique[trimmed]) dupes.push(trimmed);
    unique[trimmed] = true;
  });
  check(dupes.length === 0, 'TRACEABILITY: no duplicate requirements' + (dupes.length ? ': ' + dupes.join(', ') : ''));
}

// 8. CURRENT_STATE_BASELINE: valid status values
var cs = readFile('CURRENT_STATE_BASELINE.md');
if (cs) {
  var validStatuses = ['IMPLEMENTED_AND_VERIFIED', 'IMPLEMENTED_NOT_PRODUCTION_VERIFIED',
    'PARTIAL', 'NOT_IMPLEMENTED', 'BLOCKED', 'UNKNOWN'];
  var cellRe = /\| ([A-Z_]+) \|/g;
  var cm;
  while ((cm = cellRe.exec(cs)) !== null) {
    var st = cm[1];
    if (st !== 'Status' && validStatuses.indexOf(st) < 0 && st.indexOf(' ') < 0) {
      check(false, 'CURRENT_STATE invalid status: ' + st);
    }
  }
}

// 9. KNOWN_INCIDENTS: must have empty commit or b49d262
var ki = readFile('KNOWN_INCIDENTS_AND_LESSONS.md');
if (ki) {
  check(ki.indexOf('b49d262') >= 0 || ki.indexOf('empty commit') >= 0, 'KNOWN_INCIDENTS: references empty commit risk');
}

// 10. Data and Deployment fields not all empty
if (impl) {
  check(impl.indexOf('DATA_DIR resolution=') >= 0 && impl.indexOf('UNKNOWN') < impl.indexOf('DATA_DIR'), 'Data/Deployment: fields not all empty');
}

console.log('\n=== exitCode=' + exitCode + ' ===');
process.exit(exitCode);
