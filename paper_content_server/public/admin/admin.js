var STATE={adminState:null,news:{selected:[],candidates:[]},gallery:{},publishHistory:[],editor:{assetId:null,originalImage:null,transformHistory:[],historyIndex:-1,zoom:1,panX:0,panY:0,rotation:0,flipH:false,flipV:false,mode:'contain',cropRect:null,isEinkPreview:false,saved:false}};
var ACCESS_MODE=null,TOKEN=null,LOGIN_CALLBACK=null,SELECTED_NEWS_IDX=0,CONSISTENT=true,INCONSISTENCIES=[],ACTIVE_TAB='dashboard';

function $(id){return document.getElementById(id)}
function show(el){if(!el)return;if(el.id==='app'){el.style.display='grid'}else if(el.id==='login-overlay'){el.style.display='flex'}else{el.style.display='block'}}
function hide(el){if(el)el.style.display='none'}
function qs(s,p){return(p||document).querySelector(s)}
function qsa(s,p){return(p||document).querySelectorAll(s)}

window.addEventListener('error',function(e){showErrorBox(e.message||'Unknown error')});
window.addEventListener('unhandledrejection',function(e){var msg=(e.reason&&(e.reason.message||e.reason))||'Promise rejected';showErrorBox(String(msg))});

function showErrorBox(msg){
  var box=$('page-error-box');
  if(!box){
    box=document.createElement('div');
    box.id='page-error-box';
    box.style.cssText='position:fixed;top:10px;left:50%;transform:translateX(-50%);background:#dc3545;color:#fff;padding:12px 20px;border-radius:6px;z-index:10000;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.3);max-width:90vw';
    document.body.appendChild(box);
  }
  box.textContent='Error: '+msg;
  box.style.display='block';
}

function api(path,opts){
  opts=opts||{};
  var h={'Content-Type':'application/json'};
  if(TOKEN)h['Authorization']='Bearer '+TOKEN;
  return fetch(path,Object.assign({headers:h},opts)).then(function(r){
    if(r.status===401||r.status===403){
      if(ACCESS_MODE==='token'&&!TOKEN){showLogin();throw new Error('unauthorized')}
    }
    if(r.status===204)return null;
    if(!r.ok){
      return r.text().then(function(t){
        var msg=t;
        try{var j=JSON.parse(t);msg=j.error||j.message||msg}catch(e){}
        throw new Error(msg||'HTTP Error '+r.status);
      });
    }
    var ct=r.headers.get('content-type')||'';
    if(ct.indexOf('application/json')>=0)return r.json().catch(function(){return null});
    if(ct.indexOf('image/')>=0||ct.indexOf('application/octet')>=0)return r.blob();
    return r.text().then(function(t){try{return JSON.parse(t)}catch(e){return t}});
  });
}

function toast(msg,type){type=type||'info';var t=document.createElement('div');t.className='toast toast-'+type;t.textContent=msg;document.body.appendChild(t);setTimeout(function(){t.remove()},3500)}

function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}

function showLogin(){
  if(!$('login-overlay'))return;
  hide($('app'));
  show($('login-overlay'));
  if($('login-token'))$('login-token').value='';
  if($('login-error'))$('login-error').style.display='none';
}

function hideLogin(){
  if(!$('login-overlay'))return;
  hide($('login-overlay'));
  show($('app'));
}

var loginForm=$('login-form');
if(loginForm){
  loginForm.addEventListener('submit',function(e){
    e.preventDefault();
    var token=$('login-token').value.trim();
    if(!token)return;
    var headers={'Authorization':'Bearer '+token};
    api('/api/admin/state',{headers:headers}).then(function(d){
      if(d&&(d.active||d.status==='ok'||d.generatedAt)){
        TOKEN=token;hideLogin();
        if(LOGIN_CALLBACK){LOGIN_CALLBACK();LOGIN_CALLBACK=null}
      }else{
        $('login-error').textContent='Token 无效';
        $('login-error').style.display='block';
      }
    }).catch(function(){toast('认证失败','error')});
  });
}

var TAB_TITLES={dashboard:'工作台','news-page':'新闻审查','photos-page':'图片库','photo-editor-page':'图片编辑','publish-page':'发布中心','status-page':'运行状态'};

function switchTab(name){
  if(name==='photo-editor-page'&&!STATE.editor.assetId)return;
  ACTIVE_TAB=name;
  qsa('.page').forEach(function(p){p.classList.remove('active')});
  var page=$(name);if(page)page.classList.add('active');
  qsa('.sidebar nav a').forEach(function(a){a.classList.remove('active')});
  var link=qs('a[data-tab="'+name+'"]');if(link)link.classList.add('active');
  var titleEl=$('page-title');
  if(titleEl&&TAB_TITLES[name])titleEl.textContent=TAB_TITLES[name];
}

qsa('.sidebar nav a').forEach(function(a){
  a.addEventListener('click',function(e){e.preventDefault();switchTab(a.getAttribute('data-tab'))});
});

function setText(id,text,emptyText){
  var el=$(id);if(!el)return null;
  var val=text;
  if(val===undefined||val===null||val===''||val==='-'||val==='--')val=emptyText||'暂无数据';
  if(typeof val==='object')val=JSON.stringify(val);
  el.textContent=val;
  return el;
}

function badge(text,cls){return '<span class="badge badge-'+cls+'">'+esc(text)+'</span>'}

function checkConsistent(){
  if(!CONSISTENT){
    toast('系统状态不一致: '+INCONSISTENCIES.map(function(i){return i.code}).join(', '),'error');
    return false;
  }
  return true;
}

function firstVal(obj,keys,def){for(var i=0;i<keys.length;i++){if(obj[keys[i]]!=null&&obj[keys[i]]!==''&&obj[keys[i]]!=='--')return obj[keys[i]]}return def||'--'}

function showConfirmInline(parentId,title,message,onConfirm,onCancel){
  var area=$(parentId);
  if(!area)return;
  area.innerHTML='<div class="inline-confirm"><div class="confirm-text"><strong>'+esc(title)+'</strong><br>'+esc(message)+'</div><div class="confirm-actions"><button class="btn btn-danger btn-sm" id="inline-confirm-ok">确认</button><button class="btn btn-outline btn-sm" id="inline-confirm-cancel">取消</button></div></div>';
  $('inline-confirm-ok').onclick=function(){area.innerHTML='';if(onConfirm)onConfirm()};
  $('inline-confirm-cancel').onclick=function(){area.innerHTML='';if(onCancel)onCancel()};
}

function addStatusDetail(el,text,type){
  var existing=el.parentNode.querySelector('.status-detail');
  if(existing)existing.remove();
  var detail=document.createElement('div');
  detail.className='status-detail '+(type||'info');
  detail.textContent=text;
  el.parentNode.appendChild(detail);
}

function formatTime(iso){if(!iso)return '--';try{var d=new Date(iso);if(isNaN(d.getTime()))return iso;return d.toLocaleString('zh-CN')}catch(e){return iso}}

function truncate(s,len){if(!s)return '--';len=len||30;return s.length>len?s.slice(0,len)+'…':s}

function updateRefreshTime(){
  var el=$('last-refresh');
  if(el)el.textContent='最后刷新: '+new Date().toLocaleTimeString('zh-CN');
}

function refreshAll(){
  loadAdminState().then(function(){return Promise.all([loadDashboard(),loadNewsReview(),loadGallery(),loadPublishHistory(),loadStatusPage()])}).then(function(){toast('已刷新','info');updateRefreshTime()}).catch(function(e){toast('刷新失败: '+e.message,'error')});
}

// ═══════════════════════════════════════
// Admin State — primary data source
// ═══════════════════════════════════════

function loadAdminState(){
  return api('/api/admin/state').then(function(d){
    if(!d)return;
    STATE.adminState=d;
    CONSISTENT=d.consistent!==false;
    INCONSISTENCIES=d.inconsistencies||[];
    return d;
  }).catch(function(e){showErrorBox('state load failed: '+(e&&e.message||e))});
}

// ═══════════════════════════════════════
// Workbench / Dashboard
// ═══════════════════════════════════════

function loadDashboard(){
  var st=STATE.adminState;
  if(!st)return;
  var active=st.active||{},ov=st.override||{},sch=st.schedule||{},dev=st.device||{},h=st.health||{},pub=st.lastPublication||{};
  setText('wb-mode',active.contentMode||'unknown');
  setText('wb-opmode',active.operatingMode||'UNKNOWN');
  setText('wb-frameid',active.frameId||'未生成','未生成');
  setText('wb-sha',active.frameSha256?active.frameSha256.slice(0,16)+'…':'--','--');
  setText('wb-nextswitch',sch.nextSwitchAt?formatTime(sch.nextSwitchAt):'未调度','未调度');
  setText('wb-override',ov.type||'auto','auto');
  setText('wb-override-expires',ov.expiresAt?formatTime(ov.expiresAt):'未设置','未设置');
  setText('wb-lastpub',pub.publishedAt?formatTime(pub.publishedAt):'未发布','未发布');
  setText('wb-device',dev.connected?'已连接':'未连接','未连接');
  setText('wb-uptime',h.uptime?Math.floor(h.uptime/60)+' 分钟':'<1 分钟','<1 分钟');
  setText('wb-consistent',CONSISTENT?'是 — 无异常':'否 — 存在不一致','--');
  if(!CONSISTENT){
    var errList=$('wb-inconsistencies');
    if(errList){
      errList.innerHTML='';
      INCONSISTENCIES.forEach(function(inc){
        var li=document.createElement('li');
        li.textContent=inc.code+': 期望 "'+inc.expected+'", 实际 "'+inc.actual+'"';
        errList.appendChild(li);
      });
    }
  }
  var previewBody=$('wb-preview-body');
  if(previewBody){
    previewBody.innerHTML='<div class="placeholder">'+icon('layers')+'<div>800×480 预览</div><div class="muted small mt-4">Frame: '+(active.frameId?truncate(active.frameId,40):'--')+'</div></div>';
  }
  var modeBox=$('dash-mode-box');
  if(modeBox){
    var modeText='auto';
    var modeDesc='自动调度 — 由时间 SLOT 调度器自动选择内容';
    if(ov.active&&ov.type){
      modeText=ov.type;
      modeDesc='手动 — 当前内容由管理员指定，到期时间: '+(ov.expiresAt?formatTime(ov.expiresAt):'永不');
    }
    modeBox.innerHTML='<div class="mode-title">控制模式: '+esc(modeText)+'</div>'+modeDesc;
  }
}

// ═══════════════════════════════════════
// News
// ═══════════════════════════════════════

function loadNewsReview(){
  api('/api/admin/news').then(function(d){
    if(!d)return;
    var el=$('news-list');
    if(!el)return;
    el.innerHTML='';
    var items=d.selected||[];
    STATE.news.selected=items;
    STATE.news.candidates=d.candidates||[];
    if(items.length===0){
      el.innerHTML='<div class="empty-state">暂无新闻。请检查新闻源配置。</div>';
      return;
    }
    if(SELECTED_NEWS_IDX>=items.length)SELECTED_NEWS_IDX=0;
    items.forEach(function(item,i){
      var card=document.createElement('div');
      card.className='news-card'+(i===SELECTED_NEWS_IDX?' selected':'');
      var tsBadge=translationBadge(item.translationStatus);
      var titleStatusBadge=renderTitleStatusBadge(item);
      var isFirst=(i===0),isLast=(i===items.length-1);
      var titleStats='';
      if(item.rawTitle||item.displayTitle){
        titleStats='<div class="title-stats">'+
          'rawTitle: '+esc(truncate(item.rawTitle||item.title,40))+
          ' | displayTitle: '+esc(truncate(item.displayTitle||item.title,40))+
          (item.titleWidthPx?' | width: '+item.titleWidthPx+'/'+item.titleMaxWidthPx+'px':'')+
          ' | '+titleStatusBadge+
          (item.reviewStatus?' '+badge(item.reviewStatus,item.reviewStatus==='approved'?'approved':'pending'):'')+
          '</div>';
      }
      card.innerHTML='<div class="meta">'+
        '<span class="badge badge-primary">'+(item.category||'综合')+'</span>'+
        tsBadge+
        '<span class="small muted">'+(item.source||'')+'</span>'+
        '<span class="small muted">'+(item.titleLen||0)+'字</span>'+
        '</div>'+
        titleStats+
        '<div class="title-row">'+esc(item.displayTitle||item.title||'无标题')+'</div>'+
        '<div class="summary-row">'+esc(item.displaySummary||item.summary||'')+'</div>'+
        '<div class="actions">'+
        '<button class="btn btn-sm btn-outline" '+(isFirst?'disabled':'')+' onclick="event.stopPropagation();moveNews('+i+',-1)">'+icon('chevron-left')+'上移</button>'+
        '<button class="btn btn-sm btn-outline" '+(isLast?'disabled':'')+' onclick="event.stopPropagation();moveNews('+i+',1)">下移'+icon('chevron-right')+'</button>'+
        '<button class="btn btn-sm btn-danger" onclick="event.stopPropagation();removeNews('+i+')">'+icon('trash')+'移除</button>'+
        '<a href="'+(item.url||'#')+'" target="_blank" class="btn btn-sm btn-outline" onclick="event.stopPropagation()">原文</a>'+
        '</div>';
      card.onclick=function(){selectNews(i)};
      el.appendChild(card);
    });
    selectNews(SELECTED_NEWS_IDX);
  }).catch(function(e){
    var el=$('news-list');
    if(el)el.innerHTML='<div class="empty-state">新闻加载失败: '+esc(e.message||e)+'</div>';
  });
}

function translationBadge(status){
  if(status==='translated')return badge('已翻译','success');
  if(status==='original')return badge('原文','muted');
  if(status==='missing-key')return badge('缺Key','warning');
  if(status==='failed')return badge('失败','danger');
  return badge(status||'unknown','muted');
}

function renderTitleStatusBadge(item){
  var s=item.titleStatus||'';
  if(s==='fit')return badge('fit','success');
  if(s==='needs_review')return badge('需复审','needs-review');
  if(s==='error')return badge('错误','error');
  return '';
}

function selectNews(idx){
  SELECTED_NEWS_IDX=idx;
  var items=STATE.news.selected||[];
  qsa('#news-list .news-card').forEach(function(c,i){
    if(i===idx)c.classList.add('selected');else c.classList.remove('selected');
  });
  if(idx>=0&&idx<items.length)renderNewsDetail(items[idx]);
}

function renderNewsDetail(item){
  var el=$('news-detail');
  if(!el||!item)return;
  var html='<div class="field"><div class="field-label">分类</div><div class="field-value">'+
    badge(item.category||'综合','primary')+' '+translationBadge(item.translationStatus)+'</div></div>';
  if(item.titleStatus){
    html+='<div class="field"><div class="field-label">标题状态</div><div class="field-value">'+
      renderTitleStatusBadge(item)+' '+
      (item.reviewStatus?badge(item.reviewStatus,item.reviewStatus==='approved'?'approved':'pending'):'')+
      '</div></div>';
  }
  html+='<div class="field"><div class="field-label">RAW 标题</div><div class="field-value mono">'+esc(item.rawTitle||item.title||'')+'</div></div>'+
    '<div class="field"><div class="field-label">显示标题</div><div class="field-value"><input class="news-title" value="'+esc(item.displayTitle||item.title||'')+'" style="width:100%"></div></div>'+
    (item.titleWidthPx?'<div class="field"><div class="field-label">标题宽度</div><div class="field-value">'+item.titleWidthPx+'px / '+item.titleMaxWidthPx+'px</div></div>':'')+
    '<div class="field"><div class="field-label">RAW 摘要</div><div class="field-value mono">'+esc(item.rawSummary||item.summary||'')+'</div></div>'+
    '<div class="field"><div class="field-label">显示摘要</div><div class="field-value"><textarea class="news-summary" rows="3" style="width:100%">'+esc(item.displaySummary||item.summary||'')+'</textarea></div></div>'+
    '<div class="field"><div class="field-label">来源</div><div class="field-value">'+esc(item.source||'未知')+'</div></div>'+
    '<div class="field"><div class="field-label">发布时间</div><div class="field-value">'+esc(item.publishedAt||'未知')+'</div></div>'+
    '<div class="field"><div class="field-label">原文链接</div><div class="field-value"><a href="'+esc(item.url||'#')+'" target="_blank">'+esc(item.url||'无链接')+'</a></div></div>';
  el.innerHTML=html;
}

async function saveNewsDraft(){
  var items=STATE.news.selected||[];
  var titles=qsa('.news-title');
  var summaries=qsa('.news-summary');
  titles.forEach(function(inp,i){if(items[i])items[i].displayTitle=inp.value;if(items[i]&&!items[i].rawTitle)items[i].rawTitle=inp.value});
  summaries.forEach(function(inp,i){if(items[i])items[i].displaySummary=inp.value;if(items[i]&&!items[i].rawSummary)items[i].rawSummary=inp.value});
  var btn=$('save-draft-btn');
  if(btn){btn.disabled=true;btn.innerHTML=icon('refresh')+'保存中…'}
  try{
    var r=await api('/api/admin/news/draft',{method:'POST',body:JSON.stringify({items:items})});
    if(r&&r.error)throw new Error(r.error);
    STATE.news.selected=r&&r.items?r.items:items;
    toast('草稿已保存','success');
    loadNewsReview();
    return r;
  }catch(e){
    toast('保存失败: '+e.message,'error');
    throw e;
  }finally{
    if(btn){btn.disabled=false;btn.innerHTML=icon('save')+'保存草稿'}
  }
}

async function publishNews(){
  if(!checkConsistent())return;
  var msg=$('publish-msg');
  if(msg){msg.style.display='block';msg.textContent='正在保存草稿…';msg.className='msg-area';}
  try{
    await saveNewsDraft();
    if(msg)msg.textContent='正在发布新闻…';
    var r=await api('/api/admin/publish/news',{method:'POST'});
    if(r&&r.frameId){
      await loadAdminState();
      if(msg)msg.textContent='发布成功: '+truncate(r.frameId,40);
      toast('新闻已发布: '+truncate(r.frameId,30),'success');
      loadDashboard();
    }else{
      throw new Error(r&&r.error||'发布返回异常');
    }
  }catch(e){
    toast('发布失败: '+e.message,'error');
    if(msg){msg.textContent='发布失败: '+e.message;msg.style.background='#f8e0e0';msg.style.borderColor='#f5b3b3';}
  }
}

function moveNews(idx,dir){
  var items=STATE.news.selected||[];
  var target=idx+dir;
  if(target<0||target>=items.length)return;
  var tmp=items[idx];items[idx]=items[target];items[target]=tmp;
  if(SELECTED_NEWS_IDX===idx)SELECTED_NEWS_IDX=target;
  else if(SELECTED_NEWS_IDX===target)SELECTED_NEWS_IDX=idx;
  loadNewsReview();
}

function removeNews(idx){
  var items=STATE.news.selected||[];
  var item=items[idx];
  if(!item)return;
  items.splice(idx,1);
  if(SELECTED_NEWS_IDX===idx)SELECTED_NEWS_IDX=Math.min(idx,items.length-1);
  else if(SELECTED_NEWS_IDX>idx)SELECTED_NEWS_IDX--;
  if(items.length<6&&STATE.news.candidates){
    var used={};items.forEach(function(it){if(it.url)used[it.url]=true});
    for(var i=0;i<STATE.news.candidates.length;i++){
      var c=STATE.news.candidates[i];
      if(!used[c.url]){items.push(c);break;}
    }
  }
  loadNewsReview();
}

// ═══════════════════════════════════════
// Gallery — 4 views
// ═══════════════════════════════════════

var GALLERY_TAB='learning';

function switchGalleryTab(tab){
  GALLERY_TAB=tab;
  qsa('.gallery-tab').forEach(function(t){t.classList.toggle('active',t.getAttribute('data-tab')===tab)});
  loadGallery();
}

function loadGallery(){
  var el=$('photo-grid');
  if(!el)return;
  el.innerHTML='<div class="loading-state">加载中…</div>';
  var tab=GALLERY_TAB;
  if(tab==='learning'){
    api('/api/admin/library?libraryType=LEARNING').then(function(d){renderGalleryAssets(d&&d.assets||[],'学习库')}).catch(function(e){el.innerHTML='<div class="empty-state">加载失败: '+esc(e.message)+'</div>'});
  }else if(tab==='custom'){
    api('/api/admin/library?libraryType=CUSTOM').then(function(d){renderGalleryAssets(d&&d.assets||[],'自定义库')}).catch(function(e){el.innerHTML='<div class="empty-state">加载失败: '+esc(e.message)+'</div>'});
  }else if(tab==='pending'){
    Promise.all([
      api('/api/admin/library?libraryType=LEARNING').then(function(d){return d&&d.assets||[]}),
      api('/api/admin/library?libraryType=CUSTOM').then(function(d){return d&&d.assets||[]})
    ]).then(function(results){
      var all=[].concat(results[0],results[1]);
      var pending=all.filter(function(a){return a.safetyStatus==='PENDING'||a.safetyStatus==='SUSPICIOUS'||a.relevanceStatus==='UNKNOWN'});
      renderGalleryAssets(pending,'待审核');
    }).catch(function(e){el.innerHTML='<div class="empty-state">加载失败: '+esc(e.message)+'</div>'});
  }else if(tab==='rejected'){
    Promise.all([
      api('/api/admin/library?libraryType=LEARNING').then(function(d){return d&&d.assets||[]}),
      api('/api/admin/library?libraryType=CUSTOM').then(function(d){return d&&d.assets||[]})
    ]).then(function(results){
      var all=[].concat(results[0],results[1]);
      var rejected=all.filter(function(a){return a.safetyStatus==='UNSAFE'||a.lifecycleStatus==='BLOCKED'||a.lifecycleStatus==='TOMBSTONED'});
      renderGalleryAssets(rejected,'已拒绝');
    }).catch(function(e){el.innerHTML='<div class="empty-state">加载失败: '+esc(e.message)+'</div>'});
  }
}

function renderGalleryAssets(assets,label){
  var el=$('photo-grid');
  if(!el)return;
  el.innerHTML='';
  var countEl=$('photo-count');
  if(countEl)countEl.textContent='共 '+assets.length+' 项';
  if(assets.length===0){
    el.innerHTML='<div class="empty-state">'+esc(label)+'为空。</div>';
    return;
  }
  assets.forEach(function(a){
    var item=document.createElement('div');item.className='photo-item';
    var safetyCls='safe';
    if(a.safetyStatus==='PENDING'||a.safetyStatus==='SUSPICIOUS')safetyCls='suspicious';
    else if(a.safetyStatus==='UNSAFE')safetyCls='unsafe';
    else if(a.lifecycleStatus==='BLOCKED'||a.lifecycleStatus==='TOMBSTONED')safetyCls='unsafe';
    var thumbUrl='/api/admin/library/'+a.assetId+'/thumbnail?'+Date.now();
    item.innerHTML='<div class="thumb">'+
      '<img src="'+thumbUrl+'" alt="'+esc(a.assetId||'')+'" loading="lazy" onerror="this.style.display=\'none\';this.parentElement.innerHTML=\''+icon('image','40px','40px')+'\'">'+
      '<span class="safety-overlay badge badge-'+safetyCls+'">'+esc(a.safetyStatus||a.lifecycleStatus||'--')+'</span>'+
      '</div>'+
      '<div class="info">'+
      '<div class="name">'+esc(a.metadata&&a.metadata.title||a.assetId.slice(0,16))+'</div>'+
      '<div class="meta-row"><span>'+(a.width||'--')+'x'+(a.height||'--')+' · '+esc(a.libraryType||'')+'</span></div>'+
      '<div class="meta-row"><span class="mono">'+truncate(a.sha256||a.assetId,20)+'</span></div>'+
      '<div class="actions">'+
      '<button class="btn btn-sm btn-outline" onclick="openEditor(\''+a.assetId+'\')">'+icon('edit')+'编辑</button>'+
      '<button class="btn btn-sm btn-success" onclick="oneShotPublish(\''+a.assetId+'\',\''+esc(a.libraryType||'custom')+'\')">'+icon('publish')+'发布</button>'+
      (a.lifecycleStatus!=='TOMBSTONED'&&a.lifecycleStatus!=='DELETED'?'<button class="btn btn-sm btn-danger" onclick="deleteAssetClick(\''+a.assetId+'\')">'+icon('trash')+'删除</button>':'')+
      '</div></div>';
    el.appendChild(item);
  });
}

function deleteAssetClick(id){
  if(!checkConsistent())return;
  toast('删除功能未启用 (FEATURE_DISABLED)','warning');
}


function oneShotPublish(assetId,libraryType){
  if(!checkConsistent())return;
  api('/api/admin/publish/one-shot',{method:'POST',body:JSON.stringify({contentType:'photo',assetId:assetId,libraryType:libraryType||'custom'})}).then(function(r){
    if(r&&r.frameId){
      loadAdminState().then(function(){
        toast('已发布: '+truncate(r.frameId,30),'success');
        loadDashboard();
      });
    }else toast('发布失败','error');
  }).catch(function(e){toast('发布失败: '+(e.message||e),'error')});
}

function icon(name,w,h){w=w||18;h=h||18;return '<svg class="icon icon-'+name+'" viewBox="0 0 24 24" width="'+w+'" height="'+h+'"><use href="#icon-'+name+'"/></svg>'}

// ═══════════════════════════════════════
// Image Editor
// ═══════════════════════════════════════

function openEditor(id){
  if(!id)return;
  STATE.editor.assetId=id;
  STATE.editor.zoom=1;STATE.editor.panX=0;STATE.editor.panY=0;
  STATE.editor.rotation=0;STATE.editor.flipH=false;STATE.editor.flipV=false;
  STATE.editor.mode='contain';STATE.editor.cropRect=null;
  STATE.editor.isEinkPreview=false;STATE.editor.saved=false;
  STATE.editor.transformHistory=[{zoom:1,panX:0,panY:0,rotation:0,flipH:false,flipV:false}];
  STATE.editor.historyIndex=0;
  switchTab('photo-editor-page');
  var titleEl=$('editor-title');
  if(titleEl)titleEl.textContent='编辑: '+truncate(id,24);
  loadEditorImage();
}

function loadEditorImage(id){
  if(!id)id=STATE.editor.assetId;
  if(!id)return;
  var img=new Image();
  img.crossOrigin='anonymous';
  img.onload=function(){
    STATE.editor.originalImage=img;
    if($('editor-canvas'))renderEditorCanvas();
    if($('editor-eink-canvas'))renderEditorEink();
  };
  img.onerror=function(){toast('图片加载失败','error')};
  img.src='/api/admin/library/'+id+'/full?'+Date.now();
}

function renderEditorCanvas(){
  var canvas=$('editor-canvas');
  var wrap=$('editor-canvas-wrap');
  if(!canvas||!wrap)return;
  var img=STATE.editor.originalImage;
  if(!img){return}
  var rect=wrap.getBoundingClientRect();
  var cw=rect.width||800,ch=rect.height||480;
  canvas.width=cw;canvas.height=ch;
  var ctx=canvas.getContext('2d');
  ctx.fillStyle='#ffffff';
  ctx.fillRect(0,0,cw,ch);
  var s=STATE.editor;
  ctx.save();
  ctx.translate(cw/2,ch/2);
  ctx.scale(s.flipH?-1:1,s.flipV?-1:1);
  ctx.rotate(s.rotation*Math.PI/180);
  var scale=Math.min(cw/img.width,ch/img.height);
  if(s.mode==='cover')scale=Math.max(cw/img.width,ch/img.height);
  var drawW=img.width*scale*s.zoom;
  var drawH=img.height*scale*s.zoom;
  ctx.drawImage(img,-drawW/2+s.panX,-drawH/2+s.panY,drawW,drawH);
  ctx.restore();
  updateEditorModeBadge();
  updateEditorZoomLabel();
}

function renderEditorEink(){
  var canvas=$('editor-eink-canvas');
  var wrap=$('editor-eink-canvas-wrap');
  if(!canvas||!wrap)return;
  var img=STATE.editor.originalImage;
  if(!img)return;
  var rect=wrap.getBoundingClientRect();
  var cw=rect.width||800,ch=rect.height||480;
  canvas.width=cw;canvas.height=ch;
  var ctx=canvas.getContext('2d');
  ctx.fillStyle='#ffffff';
  ctx.fillRect(0,0,cw,ch);
  var s=STATE.editor;
  ctx.save();
  ctx.translate(cw/2,ch/2);
  ctx.scale(s.flipH?-1:1,s.flipV?-1:1);
  ctx.rotate(s.rotation*Math.PI/180);
  var scale=Math.min(cw/img.width,ch/img.height);
  if(s.mode==='cover')scale=Math.max(cw/img.width,ch/img.height);
  var drawW=img.width*scale*s.zoom;
  var drawH=img.height*scale*s.zoom;
  ctx.filter='grayscale(1) contrast(1.2)';
  ctx.drawImage(img,-drawW/2+s.panX,-drawH/2+s.panY,drawW,drawH);
  ctx.filter='none';
  ctx.restore();
}

function updateEditorParam(key,val){
  STATE.editor[key]=parseFloat(val);
  pushEditorHistory();
  renderEditorCanvas();
}

function updateSlider(id,val){
  var label=$(id);
  if(label)label.textContent=parseFloat(val).toFixed(1);
}

function pushEditorHistory(){
  var s=STATE.editor;
  var state={zoom:s.zoom,panX:s.panX,panY:s.panY,rotation:s.rotation,flipH:s.flipH,flipV:s.flipV,mode:s.mode,cropRect:s.cropRect};
  s.transformHistory=s.transformHistory.slice(0,s.historyIndex+1);
  s.transformHistory.push(state);
  s.historyIndex=s.transformHistory.length-1;
}

function editorUndo(){
  var s=STATE.editor;
  if(s.historyIndex<=0)return;
  s.historyIndex--;
  var st=s.transformHistory[s.historyIndex];
  Object.assign(s,st);
  renderEditorCanvas();
}

function editorRedo(){
  var s=STATE.editor;
  if(s.historyIndex>=s.transformHistory.length-1)return;
  s.historyIndex++;
  var st=s.transformHistory[s.historyIndex];
  Object.assign(s,st);
  renderEditorCanvas();
}

function editorZoomIn(){
  STATE.editor.zoom=Math.min(5,STATE.editor.zoom*1.2);
  pushEditorHistory();
  renderEditorCanvas();
}

function editorZoomOut(){
  STATE.editor.zoom=Math.max(0.2,STATE.editor.zoom/1.2);
  pushEditorHistory();
  renderEditorCanvas();
}

function editorRotate(){
  STATE.editor.rotation=(STATE.editor.rotation+90)%360;
  pushEditorHistory();
  renderEditorCanvas();
}

function editorFlipH(){
  STATE.editor.flipH=!STATE.editor.flipH;
  pushEditorHistory();
  renderEditorCanvas();
}

function editorFlipV(){
  STATE.editor.flipV=!STATE.editor.flipV;
  pushEditorHistory();
  renderEditorCanvas();
}

function editorSetMode(mode){
  STATE.editor.mode=mode;
  pushEditorHistory();
  renderEditorCanvas();
}

function editorTogglePreview(){
  STATE.editor.isEinkPreview=!STATE.editor.isEinkPreview;
  var original=$('editor-canvas-area');
  var eink=$('editor-eink-area');
  if(STATE.editor.isEinkPreview){
    if(original)original.style.display='none';
    if(eink){eink.style.display='block';renderEditorEink()}
  }else{
    if(original)original.style.display='block';
    if(eink)eink.style.display='none';
  }
}

function updateEditorModeBadge(){
  var el=$('editor-mode-badge');
  if(el)el.textContent='模式: '+STATE.editor.mode+(STATE.editor.rotation?' R'+STATE.editor.rotation:'')+(STATE.editor.flipH?' FH':'')+(STATE.editor.flipV?' FV':'');
}

function updateEditorZoomLabel(){
  var el=$('editor-zoom-label');
  if(el)el.textContent=Math.round(STATE.editor.zoom*100)+'%';
}

function saveEditor(){
  var id=STATE.editor.assetId;
  if(!id)return;
  var r=STATE.editor;
  api('/api/admin/photos/'+encodeURIComponent(id)+'/save-edit',{
    method:'POST',
    body:JSON.stringify({
      recipe:{
        mode: r.mode||'contain',
        zoom: typeof r.zoom==='number'?r.zoom:1,
        panX: typeof r.panX==='number'?r.panX:(r.pan?r.pan.x:0),
        panY: typeof r.panY==='number'?r.panY:(r.pan?r.pan.y:0),
        rotation: typeof r.rotation==='number'?r.rotation:(r.rotate||0),
        flipH: !!r.flipH||!!r.flipHorizontal,
        flipV: !!r.flipV||!!r.flipVertical,
        brightness: typeof r.brightness==='number'?r.brightness:0,
        contrast: typeof r.contrast==='number'?r.contrast:0,
        saturation: typeof r.saturation==='number'?r.saturation:0,
        gamma: typeof r.gamma==='number'?r.gamma:1,
        sharpen: typeof r.sharpen==='number'?r.sharpen:0,
        blur: typeof r.blur==='number'?r.blur:0,
        cropRect: r.cropRect||null,
      }
    })
  }).then(function(data){
    loadEditorImage(id);
    toast('保存成功','success');
  }).catch(function(err){
    toast('保存失败: '+(err.message||'unknown'),'error');
  });
}

function publishEditorPhoto(){
  if(!checkConsistent())return;
  var id=STATE.editor.assetId;
  if(!id)return;
  api('/api/admin/publish/one-shot',{method:'POST',body:JSON.stringify({contentType:'photo',assetId:id,libraryType:'custom'})}).then(function(r){
    if(r&&r.frameId){
      loadAdminState().then(function(){
        toast('已发布: '+truncate(r.frameId,30),'success');
        loadDashboard();
      });
    }else toast('发布失败','error');
  }).catch(function(e){toast('发布失败: '+(e.message||e),'error')});
}

// Editor mouse drag for pan
var EDITOR_DRAGGING=false,EDITOR_DRAG_START={x:0,y:0};

function initEditorDrag(){
  var wrap=$('editor-canvas-wrap');
  if(!wrap)return;
  wrap.addEventListener('mousedown',function(e){
    if(STATE.editor.mode!=='manual-crop'){
      EDITOR_DRAGGING=true;
      EDITOR_DRAG_START={x:e.clientX-STATE.editor.panX,y:e.clientY-STATE.editor.panY};
      wrap.style.cursor='grabbing';
    }
  });
  document.addEventListener('mousemove',function(e){
    if(!EDITOR_DRAGGING)return;
    STATE.editor.panX=e.clientX-EDITOR_DRAG_START.x;
    STATE.editor.panY=e.clientY-EDITOR_DRAG_START.y;
    renderEditorCanvas();
  });
  document.addEventListener('mouseup',function(){
    if(EDITOR_DRAGGING){
      EDITOR_DRAGGING=false;
      pushEditorHistory();
      var wrap=$('editor-canvas-wrap');
      if(wrap)wrap.style.cursor='grab';
    }
  });
  wrap.style.cursor='grab';
}

// ═══════════════════════════════════════
// Publish History
// ═══════════════════════════════════════

function loadPublishHistory(){
  var el=$('publish-history-list');
  if(!el)return;
  el.innerHTML='<div class="loading-state">加载中…</div>';
  api('/api/admin/publications').then(function(d){
    var history=d&&(d.history||d.publications||d)||[];
    if(!Array.isArray(history))history=[];
    STATE.publishHistory=history;
    el.innerHTML='';
    if(history.length===0){
      el.innerHTML='<div class="empty-state">暂无发布记录。</div>';
      return;
    }
    history.forEach(function(h,i){
      var row=document.createElement('div');
      var isActive=i===0||h.status==='active';
      row.className='publish-row'+(isActive?' active':'');
      row.id='pub-row-'+i;
      var titleText=h.metadata&&h.metadata.title||h.title||(h.snapshotId||'');
      if(titleText&&(titleText==='无标题'||titleText==='--'))titleText=h.snapshotId||'';
      row.innerHTML=
        '<div class="col-time">'+formatTime(h.publishedAt||h.createdAt)+'</div>'+
        '<div class="col-type">'+badge(h.mode||h.type||'--',isActive?'active':'archived')+'</div>'+
        '<div class="col-title" title="'+esc(titleText)+'">'+esc(truncate(titleText,50))+'</div>'+
        '<div class="col-frame" title="'+(h.frameId||'')+'">'+truncate(h.frameId||'--',24)+'</div>'+
        '<div class="col-status">'+(isActive?badge('当前','active'):badge('归档','archived'))+'</div>'+
        '<div class="col-actions"><button class="btn btn-sm btn-outline" onclick="showRestoreConfirm('+i+')">'+icon('history')+'恢复</button></div>'+
        '<div class="restore-inline" id="restore-inline-'+i+'"></div>';
      el.appendChild(row);
    });
  }).catch(function(e){
    var el=$('publish-history-list');
    if(el)el.innerHTML='<div class="empty-state">发布历史加载失败: '+esc(e.message||e)+'</div>';
  });
}

function showRestoreConfirm(idx){
  var entries=STATE.publishHistory||[];
  var entry=entries[idx];
  if(!entry)return;
  var inline=$('restore-inline-'+idx);
  if(!inline)return;
  qsa('.restore-inline').forEach(function(el){el.classList.remove('show')});
  var titleText=entry.metadata&&entry.metadata.title||entry.title||entry.snapshotId||'';
  if(titleText==='无标题'||titleText==='--')titleText=entry.snapshotId||'';
  inline.innerHTML='<div class="restore-info"><strong>版本信息</strong><br>'+
    '类型: '+esc(entry.mode||entry.type||'--')+' | '+
    '时间: '+formatTime(entry.publishedAt||entry.createdAt)+'<br>'+
    'Frame: <span class="mono">'+esc(entry.frameId||'--')+'</span><br>'+
    '内容: '+esc(titleText)+'</div>'+
    '<div class="restore-actions">'+
    '<button class="btn btn-danger btn-sm" onclick="confirmRestore(\''+esc(entry.snapshotId||entry.id||'')+'\','+idx+')">'+icon('check')+'确认恢复到此版本</button>'+
    '<button class="btn btn-outline btn-sm" onclick="closeRestoreInline('+idx+')">取消</button></div>';
  inline.classList.add('show');
}

function closeRestoreInline(idx){
  var inline=$('restore-inline-'+idx);
  if(inline){inline.classList.remove('show');inline.innerHTML=''}
}

function confirmRestore(snapshotId,idx){
  if(!checkConsistent())return;
  if(!snapshotId){toast('无效的版本ID','error');return}
  api('/api/admin/rollback',{method:'POST',body:JSON.stringify({publishId:snapshotId})}).then(function(r){
    if(r&&r.status==='ok'){
      return loadAdminState().then(function(){
        toast('版本已恢复','success');
        closeRestoreInline(idx);
        loadPublishHistory();
        loadDashboard();
      });
    }else{
      toast('恢复失败: '+(r&&r.error||'未知错误'),'error');
    }
  }).catch(function(e){toast('恢复失败: '+(e.message||e),'error')});
}

// ═══════════════════════════════════════
// System Status
// ═══════════════════════════════════════

function loadStatusPage(){
  var st=STATE.adminState;
  if(!st){
    loadAdminState().then(function(){loadStatusPage()});
    return;
  }
  renderConsistencyBanner();
  var active=st.active||{},ov=st.override||{},sch=st.schedule||{},dev=st.device||{},h=st.health||{},pub=st.lastPublication||{},build=st.build||{};
  setText('st-generated',formatTime(st.generatedAt),'--');
  setText('st-contentmode',active.contentMode||'--','--');
  setText('st-opmode',active.operatingMode||'--','--');
  setText('st-snapshotid',active.snapshotId||'--','--');
  var frameIdEl=$('st-frameid');
  if(frameIdEl)frameIdEl.textContent=active.frameId||'--';
  setText('st-sha',active.frameSha256||'--','--');
  setText('st-framelen',active.frameLength?active.frameLength+' bytes':'--','--');
  setText('st-activated',formatTime(active.activatedAt),'--');
  setText('st-assetid',active.assetId||'--','--');
  setText('st-override',ov.type||'none','none');
  setText('st-override-expires',ov.expiresAt?formatTime(ov.expiresAt):'--','--');
  setText('st-schedule-mode',sch.currentMode||'--','--');
  setText('st-nextswitch',sch.nextSwitchAt?formatTime(sch.nextSwitchAt):'--','--');
  setText('st-lastpub-time',pub.publishedAt?formatTime(pub.publishedAt):'--','--');
  setText('st-lastpub-snap',pub.snapshotId||'--','--');
  setText('st-device',dev.connected?'已连接 上次:'+(dev.lastSeen?formatTime(dev.lastSeen):'--'):'未连接','--');
  setText('st-health',h.status||'--','--');
  setText('st-uptime',h.uptime?Math.floor(h.uptime/60)+' 分钟':'<1 分钟','<1 分钟');
  setText('st-build',build.serverVersion||'--','--');
  setText('st-commit',build.commit?build.commit.slice(0,12):'--','--');
  setText('st-branch',build.branch||'--','--');
}

function renderConsistencyBanner(){
  var el=$('consistency-banner');
  if(!el)return;
  if(CONSISTENT){
    el.className='consistency-banner ok';
    el.innerHTML=icon('check','20px','20px')+'<span>系统状态一致</span>';
  }else{
    el.className='consistency-banner error';
    var list='<ul class="errors">';
    INCONSISTENCIES.forEach(function(inc){
      list+='<li>'+esc(inc.code)+': 期望 '+esc(inc.expected)+', 实际 '+esc(inc.actual)+'</li>';
    });
    list+='</ul>';
    el.innerHTML=icon('alert-triangle','20px','20px')+'<div><strong>系统状态不一致 — 发布/恢复/一次性发布已禁用</strong>'+list+'</div>';
  }
}

// ═══════════════════════════════════════
// Override / One-shot
// ═══════════════════════════════════════

function clearOverride(){
  if(!checkConsistent())return;
  api('/api/admin/focus-lock',{method:'DELETE'}).then(function(){
    return loadAdminState();
  }).then(function(){
    toast('已恢复自动调度','success');
    loadDashboard();
  }).catch(function(e){
    api('/api/admin/override',{method:'DELETE'}).then(function(){
      return loadAdminState();
    }).then(function(){
      toast('已恢复自动调度','success');
      loadDashboard();
    }).catch(function(e2){toast('操作失败: '+(e2.message||(e&&e.message)),'error')});
  });
}

function oneShotPublishNews(){
  if(!checkConsistent())return;
  api('/api/admin/publish/one-shot',{method:'POST',body:JSON.stringify({contentType:'news'})}).then(function(r){
    if(r&&r.frameId){
      return loadAdminState().then(function(){
        toast('新闻已一次性发布: '+truncate(r.frameId,30),'success');
        loadDashboard();
      });
    }else throw new Error(r&&r.error||'发布失败');
  }).catch(function(e){toast('发布失败: '+(e.message||e),'error')});
}

// ═══════════════════════════════════════
// Dark mode toggle
// ═══════════════════════════════════════

function toggleDarkMode(){
  document.documentElement.classList.toggle('dark');
  var btn=$('dark-mode-btn');
  if(btn)btn.innerHTML=document.documentElement.classList.contains('dark')?icon('sun'):icon('moon');
}

// ═══════════════════════════════════════
// Init
// ═══════════════════════════════════════

function loadAll(){
  loadAdminState().then(function(){
    loadDashboard();
    loadNewsReview();
    loadGallery();
    loadPublishHistory();
    loadStatusPage();
    updateRefreshTime();
  });
}

// Init sequence
try{
  fetch('/api/admin/access-mode').then(function(r){
    if(!r.ok)throw new Error('access-mode HTTP '+r.status);
    return r.json();
  }).then(function(d){
    ACCESS_MODE=d.mode||'token';
    if(ACCESS_MODE==='token'){
      if($('login-overlay')){
        showLogin();
        LOGIN_CALLBACK=function(){loadAll()};
      }else{
        showErrorBox('access_mode=token 但登录界面缺失');
        show($('app'));
        loadAll();
      }
    }else{
      show($('app'));
      if($('login-overlay'))hide($('login-overlay'));
      loadAll();
    }
  }).catch(function(e){
    ACCESS_MODE='token';
    if($('login-overlay')){
      showLogin();
      LOGIN_CALLBACK=function(){loadAll()};
    }else{
      showErrorBox('access-mode fetch failed: '+(e&&e.message||e));
      show($('app'));
      loadAll();
    }
  });
  initEditorDrag();
}catch(e){
  showErrorBox('init failed: '+(e&&e.message||e));
  show($('app'));
  loadAll();
}
