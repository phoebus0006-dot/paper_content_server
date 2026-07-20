#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname, '..', '..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var msg=require(path.join(ROOT,'src','mqtt','mqtt-message'));
var m=msg.createPublicationMessage('dev-1','snap_1','news:123','abc123');
t('SCHEMA_VERSION',m.schemaVersion===2,'');t('DEVICE_ID',m.deviceId==='dev-1','');
t('SNAPSHOT_ID',m.snapshotId==='snap_1','');t('FRAME_ID',m.frameId==='news:123','');
t('FRAME_SHA',m.frameSha256==='abc123','');t('PUBLISHED_AT',!!m.publishedAt,'');
t('NO_REASON_WHEN_OMITTED',!m.hasOwnProperty('reason'),'no reason when omitted');
t('VALID',msg.validateMessage(m),'');t('INVALID_NULL',!msg.validateMessage(null),'');
t('INVALID_NO_SNAPSHOT',!msg.validateMessage({schemaVersion:2,frameId:'x'}),'');
t('NO_FRAME_BYTES',!m.hasOwnProperty('frame'),'');

// reason field tests (Phase 6)
var mWithReason=msg.createPublicationMessage('dev-1','snap_2','news:456','def456','one_shot');
t('REASON_PRESENT',mWithReason.reason==='one_shot','reason=one_shot');
t('REASON_VALID',msg.validateMessage(mWithReason),'valid with reason');
var mBadReason=msg.createPublicationMessage('dev-1','snap_3','news:789','ghi789','invalid_reason');
t('REASON_INVALID_NOT_SET',!mBadReason.hasOwnProperty('reason'),'invalid reason not set');
var mInvalidMsg={schemaVersion:2,snapshotId:'s',frameId:'f',reason:'bad_value'};
t('REASON_INVALID_REJECTED',!msg.validateMessage(mInvalidMsg),'reject invalid reason value');

// Backward compat: schemaVersion 1 messages still validate
var legacyMsg={schemaVersion:1,snapshotId:'s_legacy',frameId:'f_legacy'};
t('SCHEMA_V1_BACKWARD_COMPAT',msg.validateMessage(legacyMsg),'v1 backward compat');

console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
