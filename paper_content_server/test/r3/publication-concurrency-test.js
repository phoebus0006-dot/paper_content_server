#!/usr/bin/env node
// R3 test: concurrent publish serialization via PublicationLock
var path=require('path'),fs=require('fs'),os=require('os');
var ROOT=path.join(__dirname,'..','..');
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
function mf(s){var b=Buffer.alloc(s||192010,0xAA);b.write('EPF1',0,'ascii');b.writeUInt16LE(800,4);b.writeUInt16LE(480,6);b[8]=49;return b;}
var sm=require(path.join(ROOT,'src','snapshot','snapshot-model'));
var SS=require(path.join(ROOT,'src','snapshot','snapshot-store')).SnapshotStore;
var SC=require(path.join(ROOT,'src','snapshot','snapshot-cache')).SnapshotCache;
var PS=require(path.join(ROOT,'src','snapshot','pin-store')).PinStore;
var PL=require(path.join(ROOT,'src','publication','publication-lock')).PublicationLock;
var PH=require(path.join(ROOT,'src','publication','publication-history')).PublicationHistory;
var PubSvc=require(path.join(ROOT,'src','publication','publication-service')).PublicationService;
var tmp=path.join(os.tmpdir(),'r3_conc_'+Date.now());fs.mkdirSync(tmp,{recursive:true});
var lg={info:function(){},warn:function(){},error:function(){}};

async function run(){
  var store=SS(path.join(tmp,'snap'),path.join(tmp,'pub'),lg);await store.ensureDirs();
  var svc=PubSvc(store,SC(),PS(),PL(),{notify:function(){return new Promise(function(r){setTimeout(r,50);});},name:'slow'},null,PH(path.join(tmp,'h.json'),lg),lg);
  // Two concurrent publishes should be serialized
  var order=[];
  var p1=svc.publish(sm.createSnapshot('news:1',{mode:'news'},mf(16),'news')).then(function(){order.push(1);});
  var p2=svc.publish(sm.createSnapshot('news:2',{mode:'news'},mf(16),'news')).then(function(){order.push(2);});
  await Promise.all([p1,p2]);
  t('CONCURRENT_SERIALIZED',order.length===2&&order[0]===1&&order[1]===2,'order='+JSON.stringify(order));
  var ids=await store.listSnapshots();
  t('TWO_SNAPSHOTS',ids.length===2,'');
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
  try{fs.rmdirSync(tmp,{recursive:true})}catch(e){}
  process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);try{fs.rmdirSync(tmp,{recursive:true})}catch(e2){}process.exit(1)});
