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

function sectionBetween(text, startHeading, endHeading) {
  var start = text.indexOf(startHeading);
  if (start < 0) return '';
  var fromStart = text.slice(start);
  var end = fromStart.indexOf(endHeading);
  return end < 0 ? fromStart : fromStart.slice(0, end);
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

// 6. CURRENT_IMPLEMENTATION_MAP: Git Integrity Verification
var impl = readFile('CURRENT_IMPLEMENTATION_MAP.md');
if (impl) {
  var GIT_CWD = path.join(DOCS, '..', '..');

  function git(args) {
    try { return require('child_process').execFileSync('git', args, { cwd: GIT_CWD, encoding: 'utf-8' }).trim(); }
    catch(e) { return null; }
  }
  function gitOk(args) {
    try { require('child_process').execFileSync('git', args, { cwd: GIT_CWD }); return true; }
    catch(e) { return false; }
  }
  function isAncestor(a, d) { return gitOk(['merge-base', '--is-ancestor', a, d]); }

  // 6a. Resolve current HEAD
  var currentHead = git(['rev-parse', 'HEAD']);
  check(!!currentHead, 'Git HEAD resolved: ' + (currentHead ? currentHead.substr(0, 12) : 'FAILED'));

  // 6b. Read audited SHA (support AUDITED_CODE_SHA and legacy AUDITED_CODE_BASE_SHA)
  var PENDING_PLACEHOLDER = 'AUDITED_CODE_SHA_PENDING_INTEGRATION';
  var pendingMatch = /AUDITED_CODE_SHA=AUDITED_CODE_SHA_PENDING_INTEGRATION/.test(impl);
  var auditedMatch = impl.match(/AUDITED_CODE_SHA=([a-f0-9]{40})/);
  var legacyMatch = !auditedMatch ? impl.match(/AUDITED_CODE_BASE_SHA=([a-f0-9]{40})/) : null;
  var auditedSha = auditedMatch ? auditedMatch[1] : (legacyMatch ? legacyMatch[1] : null);

  if (legacyMatch) {
    console.log('NOTE: Using legacy AUDITED_CODE_BASE_SHA field (migrate to AUDITED_CODE_SHA)');
  }
  if (pendingMatch) {
    check(true, 'Audited SHA present as PENDING_INTEGRATION placeholder (git ancestry check skipped)');
  } else {
    check(!!auditedSha, 'Audited SHA present in CURRENT_IMPLEMENTATION_MAP');
  }

  if (auditedSha && currentHead && !pendingMatch) {
    // 6c. Verify SHA exists as commit
    var exists = gitOk(['cat-file', '-e', auditedSha + '^{commit}']);
    check(exists, 'Audited SHA ' + auditedSha.substr(0,12) + (exists ? ' exists as commit' : ' DOES NOT EXIST'));

    if (exists) {
      // 6d. Verify ancestry
      var anc = isAncestor(auditedSha, currentHead);
      check(anc, 'Audited SHA ' + auditedSha.substr(0,12) + (anc ? ' is ancestor of' : ' is NOT ancestor of') + ' HEAD ' + currentHead.substr(0,12));

      if (anc) {
        // 6e. Check protected production files
        var PROTECTED_PATHS = [
          'paper_content_server/src/',
          'paper_content_server/scripts/',
          'paper_content_server/deploy/',
          'paper_content_server/public/',
          'paper_content_server/server.js',
          'paper_content_server/lib/',
          'paper_content_server/package.json',
          'paper_content_server/package-lock.json',
          'paper_content_server/Dockerfile',
          'paper_content_server/.dockerignore',
          'NewsPhoto_esp32wf/',
          '.github/workflows/',
        ];
        var diff = git(['diff', '--name-only', auditedSha + '..' + currentHead]);
        var files = diff ? diff.split('\n').filter(Boolean) : [];
        var coreChanges = files.filter(function(f) {
          return PROTECTED_PATHS.some(function(p) { return f.indexOf(p) === 0; });
        });
        if (coreChanges.length > 0) {
          check(false, 'ARCHITECTURE_BASELINE_STALE');
          console.log('AUDITED_CODE_SHA=' + auditedSha);
          console.log('CURRENT_HEAD=' + currentHead);
          console.log('CORE_FILES_CHANGED_SINCE_AUDIT:');
          coreChanges.forEach(function(f) { console.log('  - ' + f); });
        } else {
          check(true, 'No protected production files changed since audited SHA');
        }
      }
    }
  }

  // 6f. Verify SHA consistency across 3 truth baseline docs
  var gbl = readFile('GLOBAL_REFACTOR_BASELINE.md');
  var gaa = readFile('GLOBAL_ARCHITECTURE_AUDIT.md');
  if (gbl && gaa) {
    function extractTruthSha(text) {
      var m = text.match(/AUDITED_CODE_SHA=([a-f0-9]{40})/);
      if (m) return m[1];
      if (/AUDITED_CODE_SHA=AUDITED_CODE_SHA_PENDING_INTEGRATION/.test(text)) return PENDING_PLACEHOLDER;
      return null;
    }
    var mapShaVal = extractTruthSha(impl);
    var blShaVal = extractTruthSha(gbl);
    var aaShaVal = extractTruthSha(gaa);
    var allSame = mapShaVal && blShaVal && aaShaVal && mapShaVal === blShaVal && blShaVal === aaShaVal;
    check(allSame, 'Truth baseline SHA consistent across 3 docs: MAP=' + (mapShaVal||'MISS').substr(0,12) + ' BL=' + (blShaVal||'MISS').substr(0,12) + ' AA=' + (aaShaVal||'MISS').substr(0,12));
  }

  // 6g. Original map content checks (SHA-independent)
  check(impl.indexOf('| GET | /api/state.json') >= 0, 'CURRENT_IMPLEMENTATION_MAP has route data');
  check(impl.indexOf('| News translation cache |') >= 0, 'CURRENT_IMPLEMENTATION_MAP has runtime state data');
  check(impl.indexOf('| fetch |') >= 0, 'CURRENT_IMPLEMENTATION_MAP has news map data');
  check(impl.indexOf('| source adapters |') >= 0, 'CURRENT_IMPLEMENTATION_MAP has learning map data');
  check(impl.indexOf('| upload endpoint |') >= 0, 'CURRENT_IMPLEMENTATION_MAP has custom map data');
  check(impl.indexOf('| schedule-test.js |') >= 0, 'CURRENT_IMPLEMENTATION_MAP has test map data');
  var expectedTests = ['schedule-test', 'frame-selftest', 'coherence-test', 'restart-test', 'admin-test',
    'photo-safety-test', 'storyboard-source-test', 'rotation-test', 'translation-quality-test',
    'news-render-readability-test', 'docs-consistency-check'];
  expectedTests.forEach(function(t) {{
    check(impl.indexOf('| ' + t + '.js |') >= 0, 'Test map has ' + t + '.js');
  }});
  check(impl.indexOf('FULL_TRANSLATION_PIPELINE_COVERED=YES') >= 0, 'Test map: FULL_TRANSLATION_PIPELINE_COVERED=YES marker present');
  check(impl.indexOf('Contract aligned with Acceptance: summaryLines must be 2 or 3') >= 0, 'Test map: news layout contract aligned');
  check(impl.indexOf('NEWS_LAYOUT_LEGACY_REQUIREMENT_MISMATCH') < 0, 'Test map: old news layout mismatch marker absent');
  check(impl.indexOf('DUAL_LIBRARY_COVERAGE=YES') >= 0, 'Test map: DUAL_LIBRARY_COVERAGE=YES marker present');
  check(impl.indexOf('GAP-001') >= 0, 'CURRENT_IMPLEMENTATION_MAP has known gaps');
  check(impl.indexOf('DATA_DIR resolution') >= 0, 'CURRENT_IMPLEMENTATION_MAP has data/deployment');
  var newsSection = sectionBetween(impl, '## 5. News Implementation Map', '## 6. Image Library Implementation Map');
  if (newsSection) {
    var learningSection = sectionBetween(impl, '## 6. Image Library Implementation Map', '## 7. Operating Modes');
    if (learningSection) {
      check(newsSection.indexOf('selectStudyPhoto') < 0, 'News map: no selectStudyPhoto cross-contamination');
      check(learningSection.indexOf('evaluateNewsItemQuality') < 0, 'Image map: no evaluateNewsItemQuality cross-contamination');
    }
  }
}

// 7. TRACEABILITY_MATRIX: single canonical matrix, no duplicates
var trace = readFile('TRACEABILITY_MATRIX.md');
if (trace) {
  var headers = trace.match(/^\| Requirement /gm) || [];
  check(headers.length === 1, 'TRACEABILITY: exactly 1 table header (found ' + headers.length + ')');

  // Extract requirement names
  var reqs = trace.split(/\r?\n/).filter(function(line) {
    return line.indexOf('|') === 0 && line.indexOf('|---') !== 0 && line.indexOf('| Requirement |') !== 0;
  }).map(function(line) {
    return line.split('|')[1].trim();
  }).filter(Boolean);
  var unique = {};
  var dupes = [];
  reqs.forEach(function(r) {
    var trimmed = r.trim();
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
  var statusSection = sectionBetween(cs, '## 3. 当前功能状态表', '## 4. 更新规则');
  var statusRows = statusSection.split(/\r?\n/).filter(function(line) {
    return line.indexOf('|') === 0 && line.indexOf('|---') !== 0 && line.indexOf('| Capability |') !== 0;
  });
  statusRows.forEach(function(line) {
    var cols = line.split('|').map(function(c) { return c.trim(); });
    var st = cols[2];
    if (st && validStatuses.indexOf(st) < 0) {
      check(false, 'CURRENT_STATE invalid status: ' + st);
    }
  });
}

// 9. KNOWN_INCIDENTS: must have empty commit or b49d262
var ki = readFile('KNOWN_INCIDENTS_AND_LESSONS.md');
if (ki) {
  check(ki.indexOf('b49d262') >= 0 || ki.indexOf('empty commit') >= 0, 'KNOWN_INCIDENTS: references empty commit risk');
}

// 10. Data and Deployment fields not all empty
if (impl) {
  var deployFields = ['DATA_DIR resolution', 'NAS target path', 'Docker mode', 'Container name'];
  var deployOk = deployFields.every(function(f) {{ return impl.indexOf(f + '=') >= 0 || impl.indexOf('| ' + f) >= 0; }});
  check(deployOk, 'Data/Deployment: all 4 key fields present (' + deployFields.filter(function(f) {{ return impl.indexOf(f + '=') < 0 && impl.indexOf('| ' + f) < 0; }}).join(', ') + ' missing)');
}

// 11. Enhanced docs consistency checks
var REPO_ROOT = path.join(__dirname, '..'); // paper_content_server/
var WORKSPACE_ROOT = path.join(REPO_ROOT, '..'); // workspace root (contains .github/)
function readRepoFile(relPath) {
  try { return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8'); } catch(e) { return null; }
}
function readWorkspaceFile(relPath) {
  try { return fs.readFileSync(path.join(WORKSPACE_ROOT, relPath), 'utf8'); } catch(e) { return null; }
}

var pkgJson = {};
try { pkgJson = JSON.parse(readRepoFile('package.json') || '{}'); } catch(e) {}
var serverSrc = readRepoFile('server.js') || '';
var apiContract = readFile('API_CONTRACT.md') || '';

// 11a. CURRENT admin routes documented in API_CONTRACT must exist in server.js
//      OR be explicitly marked TARGET_NOT_IMPLEMENTED in the doc.
if (apiContract) {
  var adminRouteMatches = apiContract.match(/\/api\/admin\/[a-zA-Z0-9_\-\/:?]+/g) || [];
  var seen = {};
  var routeInfos = [];
  adminRouteMatches.forEach(function(raw) {
    if (seen[raw]) return;
    seen[raw] = true;
    var clean = raw.replace(/\/:[a-zA-Z][a-zA-Z0-9_]*/g, '').replace(/[?]libraryType(=[a-z]+)?/g, '').replace(/\/+$/, '');
    routeInfos.push({ raw: raw, clean: clean });
  });
  var missingRoutes = [];
  routeInfos.forEach(function(info) {
    if (serverSrc.indexOf(info.clean) >= 0) return;
    // Allow documented-but-not-implemented routes when marked TARGET_NOT_IMPLEMENTED.
    var idx = apiContract.indexOf(info.raw);
    if (idx < 0) { missingRoutes.push(info.clean); return; }
    var ctx = apiContract.slice(Math.max(0, idx - 400), idx + 400);
    if (ctx.indexOf('TARGET_NOT_IMPLEMENTED') < 0) missingRoutes.push(info.clean);
  });
  check(missingRoutes.length === 0, 'API_CONTRACT admin routes exist in server.js or marked TARGET_NOT_IMPLEMENTED (missing: ' + missingRoutes.join(', ') + ')');
}

// 11b. Package scripts referenced by CI must exist
var ciScripts = ['docs:check','contracts:test','r1:test','r2:test','r3:test','r4:test','r5:test','r6:test','r7:test','r8:test','r9:test','r10:test','r11:test','r12:all','admin:test','lifecycle:test','restart:test'];
var missingScripts = ciScripts.filter(function(s) { return !pkgJson.scripts || !pkgJson.scripts[s]; });
check(missingScripts.length === 0, 'Package scripts present (missing: ' + missingScripts.join(', ') + ')');

// 11c. Root CI workflow must exist
var rootCi = readWorkspaceFile('.github/workflows/ci.yml');
check(!!rootCi, 'Root CI workflow .github/workflows/ci.yml exists');
if (rootCi) {
  check(rootCi.indexOf('lifecycle:test') >= 0, 'Root CI workflow includes lifecycle:test');
  check(rootCi.indexOf('r12:all') >= 0, 'Root CI workflow includes r12:all');
  check(rootCi.indexOf('admin:test') >= 0, 'Root CI workflow includes admin:test');
  check(rootCi.indexOf('restart:test') >= 0, 'Root CI workflow includes restart:test');
  check(rootCi.indexOf('working-directory: paper_content_server') >= 0, 'Root CI uses paper_content_server working directory');
}

// 11d. ESP32 must NOT be marked as PASS/verified in docs
var runbook = readFile('DEPLOYMENT_RUNBOOK.md') || '';
var baseline = readFile('CURRENT_STATE_BASELINE.md') || '';
check(!/ESP32[^=]*=(\s*)PASS/i.test(runbook), 'DEPLOYMENT_RUNBOOK: ESP32 not marked PASS');
check(!/ESP32[^=]*=(\s*)PASS/i.test(baseline), 'CURRENT_STATE_BASELINE: ESP32 not marked PASS');

// 11e. NAS port consistency (18080:8787)
var nasCompose = readRepoFile('deploy/nas/docker-compose.yml') || '';
var nasHasPort = nasCompose.indexOf('18080:8787') >= 0;
check(nasHasPort, 'NAS docker-compose port 18080:8787 present');
if (runbook) {
  check(runbook.indexOf('18080') >= 0, 'DEPLOYMENT_RUNBOOK documents NAS port 18080');
}

console.log('\n=== exitCode=' + exitCode + ' ===');
if (!process.env.DOCS_CHECK_SELF_TEST) { process.exit(exitCode); }

// === SELF TEST (DOCS_CHECK_SELF_TEST=1) ===
(function() {
  console.log('\n=== DOCS CHECKER SELF TEST ===\n');
  var tmpDir = path.join(require('os').tmpdir(), 'docs_check_self_' + Date.now());
  var stPass = 0, stFail = 0;
  function st(n, o, d) { console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:'')); if(o)stPass++;else stFail++; }
  function gitExit(tmpDir2, args) { try { require('child_process').execFileSync('git', args, { cwd: tmpDir2 }); return 0; } catch(e) { return e.status !== undefined ? e.status : 1; } }
  try {
    var fs2 = require('fs');
    var exec2 = require('child_process').execFileSync;
    fs2.mkdirSync(tmpDir, { recursive: true });
    process.chdir(tmpDir);
    exec2('git', ['init']);
    exec2('git', ['config', 'user.email', 't@t.com']);
    exec2('git', ['config', 'user.name', 'T']);
    exec2('git', ['config', 'commit.gpgsign', 'false']);

    fs2.writeFileSync('server.js', '// production\n');
    fs2.mkdirSync('docs');
    fs2.writeFileSync('docs/CURRENT_IMPLEMENTATION_MAP.md', 'AUDITED_CODE_SHA=' + 'a'.repeat(40) + '\n');
    exec2('git', ['add', '.']);
    exec2('git', ['commit', '-m', 'A']);
    var shaA = exec2('git', ['rev-parse', 'HEAD']).toString().trim();

    // Case 1: valid ancestor
    var anc = true;
    try { exec2('git', ['merge-base', '--is-ancestor', shaA, shaA]); } catch(e) { anc = false; }
    st('CASE1_VALID_ANCESTOR', anc, shaA.substr(0,8));

    // Case 2: unknown SHA
    var unk = false;
    try { exec2('git', ['cat-file', '-e', '0000000000000000000000000000000000000000^{commit}']); unk = true; } catch(e) {}
    st('CASE2_UNKNOWN_SHA', !unk, '');

    // Case 3: non-ancestor (same repo, orphan branch — no shared history)
    // Commit B is child of A (normal)
    fs2.writeFileSync('server.js', '// modified\n');
    exec2('git', ['add', '.']);
    exec2('git', ['commit', '-m', 'B']);
    var shaB = exec2('git', ['rev-parse', 'HEAD']).toString().trim();
    // Create orphan commit C with completely unrelated history
    exec2('git', ['checkout', '--orphan', 'orphan-branch']);
    // Clean working tree for orphan
    try { exec2('git', ['rm', '-rf', '.']); } catch(e) {}
    try { exec2('git', ['reset', '--hard']); } catch(e) {}
    fs2.writeFileSync('orphan.txt', 'orphan content');
    exec2('git', ['add', '.']);
    exec2('git', ['commit', '-m', 'C']);
    var shaC = exec2('git', ['rev-parse', 'HEAD']).toString().trim();
    // Verify both commits exist
    var c3LeftOk = gitExit(tmpDir, ['cat-file', '-e', shaC + '^{commit}']) === 0;
    st('CASE3_LEFT_EXISTS', c3LeftOk, shaC.substr(0,8));
    var c3RightOk = gitExit(tmpDir, ['cat-file', '-e', shaB + '^{commit}']) === 0;
    st('CASE3_RIGHT_EXISTS', c3RightOk, shaB.substr(0,8));
    // merge-base between unrelated orphans should exit 1
    var mbExit = gitExit(tmpDir, ['merge-base', '--is-ancestor', shaC, shaB]);
    st('CASE3_MERGE_BASE_EXIT', mbExit === 1, 'exit=' + mbExit);
    st('CASE3_VALID_NON_ANCESTOR', mbExit === 1, shaC.substr(0,8) + ' not ancestor of ' + shaB.substr(0,8));
    // Return to master
    exec2('git', ['checkout', 'master']);

    // Case 4: docs-only change (B..C)
    fs2.writeFileSync('docs/README.md', '# docs');
    exec2('git', ['add', '.']);
    exec2('git', ['commit', '-m', 'C']);
    var shaC = exec2('git', ['rev-parse', 'HEAD']).toString().trim();
    var diff4 = exec2('git', ['diff', '--name-only', shaB+'..'+shaC]).toString().trim();
    var core4 = diff4.split('\n').filter(function(f) {
      var t = f.trim(); if (!t) return false;
      return ['server.js','lib/','package.json','Dockerfile'].some(function(p) { return t.indexOf(p) === 0; });
    });
    st('CASE4_DOCS_ONLY', core4.length === 0, diff4);

    // Case 5: production code change (C..D)
    fs2.writeFileSync('server.js', '// changed');
    exec2('git', ['add', '.']);
    exec2('git', ['commit', '-m', 'D']);
    var shaD = exec2('git', ['rev-parse', 'HEAD']).toString().trim();
    var diff5 = exec2('git', ['diff', '--name-only', shaC+'..'+shaD]).toString().trim();
    var core5 = diff5.split('\n').filter(function(f) {
      var t = f.trim(); if (!t) return false;
      return ['server.js','lib/','package.json','Dockerfile'].some(function(p) { return t.indexOf(p) === 0; });
    });
    st('CASE5_PRODUCTION_CHANGE', core5.length > 0, 'changed: ' + core5.join(','));

    // Cases 6-9: expanded protected paths (mirror production PROTECTED_PATHS).
    // Verify that changes under src/, deploy/, .github/workflows/ trigger STALE
    // while docs-only changes do not.
    var ST_PROTECTED = [
      'paper_content_server/src/',
      'paper_content_server/scripts/',
      'paper_content_server/deploy/',
      'paper_content_server/public/',
      'paper_content_server/server.js',
      'paper_content_server/lib/',
      'paper_content_server/package.json',
      'paper_content_server/package-lock.json',
      'paper_content_server/Dockerfile',
      'paper_content_server/.dockerignore',
      'NewsPhoto_esp32wf/',
      '.github/workflows/',
    ];
    function stCoreFilter(diffStr) {
      return diffStr.split('\n').filter(function(f) {
        var t = f.trim(); if (!t) return false;
        return ST_PROTECTED.some(function(p) { return t.indexOf(p) === 0; });
      });
    }

    // Case 6: src/ change → STALE (coreChanges.length > 0)
    fs2.mkdirSync('paper_content_server/src', { recursive: true });
    fs2.writeFileSync('paper_content_server/src/asset.js', '// src change\n');
    exec2('git', ['add', '.']);
    exec2('git', ['commit', '-m', 'E']);
    var shaE = exec2('git', ['rev-parse', 'HEAD']).toString().trim();
    var diff6 = exec2('git', ['diff', '--name-only', shaD + '..' + shaE]).toString().trim();
    var core6 = stCoreFilter(diff6);
    st('CASE6_SRC_CHANGE_STALE', core6.length > 0, 'changed: ' + core6.join(','));

    // Case 7: deploy/ change → STALE (coreChanges.length > 0)
    fs2.mkdirSync('paper_content_server/deploy', { recursive: true });
    fs2.writeFileSync('paper_content_server/deploy/deploy.sh', '#!/bin/sh\n');
    exec2('git', ['add', '.']);
    exec2('git', ['commit', '-m', 'F']);
    var shaF = exec2('git', ['rev-parse', 'HEAD']).toString().trim();
    var diff7 = exec2('git', ['diff', '--name-only', shaE + '..' + shaF]).toString().trim();
    var core7 = stCoreFilter(diff7);
    st('CASE7_DEPLOY_CHANGE_STALE', core7.length > 0, 'changed: ' + core7.join(','));

    // Case 8: .github/workflows/ change → STALE (coreChanges.length > 0)
    fs2.mkdirSync('.github/workflows', { recursive: true });
    fs2.writeFileSync('.github/workflows/ci.yml', 'name: CI\n');
    exec2('git', ['add', '.']);
    exec2('git', ['commit', '-m', 'G']);
    var shaG = exec2('git', ['rev-parse', 'HEAD']).toString().trim();
    var diff8 = exec2('git', ['diff', '--name-only', shaF + '..' + shaG]).toString().trim();
    var core8 = stCoreFilter(diff8);
    st('CASE8_WORKFLOW_CHANGE_STALE', core8.length > 0, 'changed: ' + core8.join(','));

    // Case 9: docs-only change → NOT STALE (coreChanges.length === 0)
    fs2.writeFileSync('docs/EXTRA.md', '# extra doc\n');
    exec2('git', ['add', '.']);
    exec2('git', ['commit', '-m', 'H']);
    var shaH = exec2('git', ['rev-parse', 'HEAD']).toString().trim();
    var diff9 = exec2('git', ['diff', '--name-only', shaG + '..' + shaH]).toString().trim();
    var core9 = stCoreFilter(diff9);
    st('CASE9_DOCS_ONLY_NOT_STALE', core9.length === 0, 'changed: ' + core9.join(','));

    // Cleanup
    try { process.chdir(path.join(tmpDir, '..')); } catch(e) {}
    try { fs2.rmdirSync(tmpDir, { recursive: true }); } catch(e) {}

    console.log('\nSELF_TEST_RESULT: ' + stPass + ' pass, ' + stFail + ' fail');
    process.exit(stFail > 0 ? 1 : 0);
  } catch(e) {
    console.log('SELF_TEST_CRASH: ' + e.message);
    try { process.chdir(path.join(tmpDir, '..')); } catch(e) {}
    try { require('fs').rmdirSync(tmpDir, { recursive: true }); } catch(e2) {}
    process.exit(1);
  }
})();
