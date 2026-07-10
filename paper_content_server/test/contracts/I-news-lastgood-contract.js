#!/usr/bin/env node
// I-news-lastgood-contract: last-good behavior via real production pipeline
var path=require('path'),http=require('http'),fs=require('fs');
var ROOT=path.join(__dirname,'..','..'),PORT=8797,BASE='http://127.0.0.1:'+PORT;
var TMPDIR=path.join(ROOT,'test_lg_'+Date.now()),ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
function s(n,st,d){console.log('STATUS '+n+'='+st+(d?': '+d:''));}
function sha256(b){return require('crypto').createHash('sha256').update(b).digest('hex');}
function fetch(p,to){return new Promise(function(r,e){var q=http.get(BASE+p,function(s){var d=[];s.on('data',function(c){d.push(c)});s.on('end',function(){r({s:s.statusCode,b:Buffer.concat(d)})})});q.on('error',e);q.setTimeout(to||30000,function(){q.destroy();e(new Error('timeout'))})})}

function makeItem(i,srcLang){
  var srcNames=['SrcA','SrcB','SrcC'];
  var srcName=srcNames[(i-1)%srcNames.length];
  return{title:'新闻标题'+(i+1),description:'这是第'+(i+1)+'条新闻的摘要全文包含足够的描述信息。',url:'http://test-'+(i+1)+'.com/news/'+(i+1),source:srcName,category:'technology',publishedAt:new Date().toISOString(),language:srcLang||'zh'};
}

fs.mkdirSync(TMPDIR,{recursive:true});
var FEED_PORT=8989,LG_FILE=path.join(TMPDIR,'last_good_news.json');

function startSrv(feedsData){
  return new Promise(function(res){
    var env=Object.assign({},process.env,{PORT:String(PORT),TZ:'Europe/Paris',TRANSLATION_PROVIDER:'none',DATA_DIR:TMPDIR,FEEDS_FILE:path.join(TMPDIR,'feeds.json'),LAST_GOOD_NEWS_FILE:LG_FILE,NEWS_CACHE_FILE:path.join(TMPDIR,'news_cache.json'),NEWS_ROTATION_FILE:path.join(TMPDIR,'news_rotation_state.json'),IMAGE_INDEX_FILE:path.join(TMPDIR,'image_index.json'),LIBRARY_STATE_FILE:path.join(TMPDIR,'library_state.json')});
    fs.writeFileSync(path.join(TMPDIR,'feeds.json'),JSON.stringify(feedsData));
    var cp=require('child_process');
    var srv=cp.spawn(process.execPath,[path.join(ROOT,'server.js')],{env:env,cwd:ROOT,stdio:['ignore','pipe','pipe']});
    var timer=setInterval(function(){http.get(BASE+'/api/state.json',function(r){r.resume();r.on('end',function(){if(r.statusCode===200){clearInterval(timer);res(srv)}})}).on('error',function(){})},2000);
    setTimeout(function(){clearInterval(timer);srv.kill();res(null)},30000);
  });
}

function startFeedSrv(itemsByPath,port){
  return new Promise(function(res){
    var s=http.createServer(function(req,r2){
      var its=itemsByPath[req.url]||[];
      r2.writeHead(200,{'Content-Type':'application/json'});r2.end(JSON.stringify({items:its}));
    });
    s.listen(port||FEED_PORT,function(){res(s)});
  });
}

function killSrv(srv){
  return new Promise(function(res){if(!srv){res();return;}srv.on('exit',res);srv.kill();setTimeout(res,1000)});
}

async function main(){
  console.log('--- I-news-lastgood-contract ---');
  
  // CASE A: LIVE_VALID — 3 sources x 2 items each = 6
  var feedRoutes={};
  var feedEntries=[];
  var srcNames2=['SrcA','SrcB','SrcC'];
  srcNames2.forEach(function(src,si){
    var p='/feed'+si;
    feedRoutes[p]=[makeItem(si*2+1,src),makeItem(si*2+2,src)];
    feedEntries.push({id:'f-'+src,source:src,country:'China',category:'technology',language:'zh',url:'http://127.0.0.1:'+FEED_PORT+p,weight:100});
  });
  var feedA=await startFeedSrv(feedRoutes);
  var srvA=await startSrv({feeds:feedEntries});
  if(!srvA){t('A_SRV_START',false,'');process.exit(1)}
  
  var hashA='';
  try{
    var n=await fetch('/api/news.json',45000);
    var j=JSON.parse(n.b);t('A_200',n.s===200,'');
    t('A_COUNT_6',j.items.length===6,'count='+j.items.length);
    var lg=JSON.parse(fs.readFileSync(LG_FILE,'utf8'));
    hashA=sha256(JSON.stringify(lg.items));
    t('A_LAST_GOOD_SAVED',lg.items&&lg.items.length===6,'len='+(lg.items?lg.items.length:0));
  }catch(e){t('A_CHECK',false,e.message)}
  
  await killSrv(srvA);await feedA.close();
  
  if(!hashA){t('SKIP_BC_NO_HASH',false,'no hash from A');process.exit(1)}
  
  // CASE B: LIVE_FAIL — dead feed
  var feedB=http.createServer(function(req,r2){r2.writeHead(500);r2.end('err');});
  feedB.listen(8990);
  var srvB=await startSrv({feeds:[{id:'dead',source:'Dead',country:'China',category:'technology',language:'zh',url:'http://127.0.0.1:8990/rss',weight:100}]});
  if(srvB){
    try{
      var n2=await fetch('/api/news.json',45000);
      var j2=JSON.parse(n2.b);t('B_200',n2.s===200,'');
      t('B_COUNT_6',j2.items.length===6,'count='+j2.items.length);
      var hashB=sha256(JSON.stringify(j2.items));
      t('B_USES_A',hashA&&hashB===hashA,'match='+(hashB===hashA));
      var lg2=JSON.parse(fs.readFileSync(LG_FILE,'utf8'));
      var hashA2=sha256(JSON.stringify(lg2.items));
      t('B_FILE_UNCHANGED',hashA2===hashA,'match='+(hashA2===hashA));
    }catch(e){t('B_CHECK',false,e.message)}
    await killSrv(srvB);
  }
  feedB.close();
  
  s('FinalNewsUniqueness','PARTIAL','URL/title dedup exists; article identity/event-level not proven');
  
  try{fs.rmdirSync(TMPDIR,{recursive:true})}catch(e){}
  console.log('=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
}
main().catch(function(e){console.log('FATAL:'+e.message);process.exit(1)});
