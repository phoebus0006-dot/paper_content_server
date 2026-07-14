var STATE = {};
var ACCESS_MODE = null;
var TOKEN = null;
var LOGIN_CALLBACK = null;
var SELECTED_NEWS_IDX = -1;

function $(id){return document.getElementById(id)}
function show(el){if(el)el.style.display='block'}
function hide(el){if(el)style_display(el,'none')}
function style_display(el,val){if(el)el.style.display=val}
function qs(s,p){return(p||document).querySelector(s)}

// ── Page-level error box (no silent white screen) ──
function showErrorBox(msg){
  var box=$('page-error-box');
  if(!box){
    box=document.createElement('div');
    box.id='page-error-box';
    box.style.cssText='position:fixed;top:10px;left:50%;transform:translateX(-50%);background:#dc3545;color:#fff;padding:12px 20px;border-radius:6px;z-index:10000;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.3);max-width:90vw';
    document.body.appendChild(box);
  }
  box.textContent='后台加载失败: '+msg;
  box.style.display='block';
}
window.addEventListener('error',function(e){
  showErrorBox(e.message||'Unknown error');
});
window.addEventListener('unhandledrejection',function(e){
  var msg=(e.reason&&(e.reason.message||e.reason))||'Promise rejected';
  showErrorBox(String(msg));
});

function api(path,opts){
  opts=opts||{};
  var h={'Content-Type':'application/json'};
  if(TOKEN) h['Authorization']='Bearer '+TOKEN;
  return fetch(path,Object.assign({headers:h},opts)).then(function(r){
    if(r.status===401||r.status===403){
      if(ACCESS_MODE==='token'&&!TOKEN){showLogin();throw new Error('unauthorized')}
    }
    if(r.status===204)return null;
    return r.json().catch(function(){return null});
  });
}

function toast(msg,type){type=type||'info';var t=document.createElement('div');t.className='toast toast-'+type;t.textContent=msg;document.body.appendChild(t);setTimeout(function(){t.remove()},3000)}

function showLogin(){
  if(!$('login-overlay')){
    console.warn('showLogin skipped: login-overlay not present (LAN mode)');
    return;
  }
  hide($('app'));
  show($('login-overlay'));
  if($('login-token'))$('login-token').value='';
  if($('login-error'))$('login-error').style.display='none';
}

function hideLogin(){
  if(!$('login-overlay')){
    console.warn('hideLogin skipped: login-overlay not present (LAN mode)');
    return;
  }
  hide($('login-overlay'));
  show($('app'));
}

// Explicit conditional binding: login-form only exists when ADMIN_ACCESS_MODE==='token'
var loginForm=$('login-form');
if(loginForm){
  loginForm.addEventListener('submit',function(e){
    e.preventDefault();
    var token=$('login-token').value.trim();
    if(!token)return;
    api('/api/admin/dashboard',{headers:{'Authorization':'Bearer '+token}}).then(function(d){
      if(d&&d.status==='ok'){TOKEN=token;hideLogin();if(LOGIN_CALLBACK){LOGIN_CALLBACK();LOGIN_CALLBACK=null}}
      else{$('login-error').textContent='Token 无效';$('login-error').style.display='block'}
    }).catch(function(){toast('认证失败','error')});
  });
}

// Tab switching with page title update
var TAB_TITLES={dashboard:'总览','news-page':'新闻审查','photos-page':'图片库','photo-editor-page':'图片编辑','publish-page':'发布中心','status-page':'运行状态'};
function switchTab(name){
  document.querySelectorAll('.page').forEach(function(p){p.classList.remove('active')});
  var page=$(name);if(page)page.classList.add('active');
  document.querySelectorAll('.sidebar nav a').forEach(function(a){a.classList.remove('active')});
  var link=qs('a[data-tab="'+name+'"]');if(link)link.classList.add('active');
  var titleEl=$('page-title');
  if(titleEl&&TAB_TITLES[name])titleEl.textContent=TAB_TITLES[name];
}

document.querySelectorAll('.sidebar nav a').forEach(function(a){
  a.addEventListener('click',function(e){e.preventDefault();switchTab(a.getAttribute('data-tab'))});
});

function loadAll(){
  loadDashboard();loadNewsReview();loadPhotos();loadPublishHistory();loadStatus();loadHealth();
  updateRefreshTime();
}

function refreshAll(){
  loadAll();
  toast('已刷新','info');
}

function updateRefreshTime(){
  var el=$('last-refresh');
  if(el)el.textContent='最后刷新: '+new Date().toLocaleTimeString('zh-CN');
}

// Safe text setter — replaces '-' with meaningful empty state text
function setText(id,text,emptyText){
  var el=$(id);if(!el)return null;
  var val=text;
  if(val===undefined||val===null||val===''||val==='-'||val==='--'){
    val=emptyText||'暂无数据';
  }
  el.textContent=val;
  return el;
}

// ── Dashboard ──
function loadDashboard(){
  api('/api/admin/dashboard').then(function(d){
    if(!d)return;
    setText('dash-mode',d.currentMode,'未设置');
    setText('dash-slot',d.currentSlot,'未生成');
    setText('dash-frameid',d.frameId?(d.frameId.slice(0,50)+'...'):'未生成','未生成');
    setText('dash-nextswitch',d.nextSwitchLocal,'未调度');
    setText('dash-news',d.newsItemCount!==undefined?String(d.newsItemCount):'未加载','未加载');
    setText('dash-cache',d.frameCacheEntries!==undefined?String(d.frameCacheEntries):'0','0');
    setText('dash-uptime',d.uptimeSeconds?Math.floor(d.uptimeSeconds/60)+' 分钟':'<1 分钟','<1 分钟');
    setText('dash-override',d.manualOverride||'auto','auto');
    setText('dash-override-expires',d.overrideExpiresAt,'未设置');
    setText('dash-lastpublish',d.lastPublishedAt||'未发布','未发布');
    STATE.dashboard=d;
  }).catch(function(e){showErrorBox('dashboard load failed: '+(e&&e.message||e))});
}

// ── News Review ──
function loadNewsReview(){
  api('/api/admin/news').then(function(d){
    if(!d)return;
    var el=$('news-list');
    if(!el)return;
    el.innerHTML='';
    var items=(d.selected||[]);
    if(items.length===0){
      el.innerHTML='<div class="empty-state">暂无新闻数据。请检查新闻源配置或刷新。</div>';
      return;
    }
    items.forEach(function(item,i){
      var card=document.createElement('div');
      card.className='news-card'+(i===SELECTED_NEWS_IDX?' selected':'');
      var lenOk=item.titleLen<=24;var sumOk=item.summaryLen>=45&&item.summaryLen<=70;
      var statusBadge='<span class="badge '+(item.translationStatus==='translated'?'badge-status-translated':item.translationStatus==='original'?'badge-status-original':item.translationStatus==='missing-key'?'badge-status-missing-key':item.translationStatus==='failed'?'badge-status-failed':'badge-status-stub')+'">'+(item.translationStatus||'unknown')+'</span>';
      card.innerHTML='<div class="meta">'+
        '<span class="badge badge-category">'+(item.category||'综合')+'</span>'+
        statusBadge+
        '<span class="small muted">'+(item.source||'')+'</span>'+
        '<span class="small muted">'+(item.titleLen||0)+'字 / '+(item.summaryLen||0)+'字</span>'+
        (lenOk?'':'<span class="small" style="color:#dc3545">标题超长</span>')+
        (sumOk?'':'<span class="small" style="color:#dc3545">摘要异常</span>')+
        '</div>'+
        '<div class="news-title-row">'+esc(item.title||'无标题')+'</div>'+
        '<div class="news-summary-row">'+esc(item.summary||'无摘要')+'</div>'+
        '<div class="actions">'+
        '<button class="btn btn-sm btn-outline" onclick="event.stopPropagation();moveNews('+i+',-1)">⬆ 上移</button>'+
        '<button class="btn btn-sm btn-outline" onclick="event.stopPropagation();moveNews('+i+',1)">⬇ 下移</button>'+
        '<button class="btn btn-sm btn-danger" onclick="event.stopPropagation();removeNews('+i+')">移除</button>'+
        '<a href="'+(item.url||'#')+'" target="_blank" class="btn btn-sm btn-outline" onclick="event.stopPropagation()">原文</a>'+
        '</div>';
      card.onclick=function(){selectNews(i);};
      el.appendChild(card);
    });
    STATE.news=d;
    if(SELECTED_NEWS_IDX>=0&&SELECTED_NEWS_IDX<items.length){
      renderNewsDetail(items[SELECTED_NEWS_IDX]);
    }
  }).catch(function(e){
    var el=$('news-list');
    if(el)el.innerHTML='<div class="empty-state">新闻加载失败: '+esc(e.message||e)+'</div>';
  });
}

function selectNews(idx){
  SELECTED_NEWS_IDX=idx;
  var items=(STATE.news&&STATE.news.selected)||[];
  // Update visual selection
  document.querySelectorAll('#news-list .news-card').forEach(function(c,i){
    if(i===idx)c.classList.add('selected');
    else c.classList.remove('selected');
  });
  if(idx>=0&&idx<items.length){
    renderNewsDetail(items[idx]);
  }
}

function renderNewsDetail(item){
  var el=$('news-detail');
  if(!el||!item)return;
  var statusBadge='<span class="badge '+(item.translationStatus==='translated'?'badge-status-translated':item.translationStatus==='original'?'badge-status-original':item.translationStatus==='missing-key'?'badge-status-missing-key':item.translationStatus==='failed'?'badge-status-failed':'badge-status-stub')+'">'+(item.translationStatus||'unknown')+'</span>';
  el.innerHTML=
    '<div class="detail-field"><div class="detail-label">分类</div><div class="detail-value"><span class="badge badge-category">'+esc(item.category||'综合')+'</span> '+statusBadge+'</div></div>'+
    '<div class="detail-field"><div class="detail-label">显示标题</div><div class="detail-value">'+esc(item.title||'无标题')+'</div></div>'+
    '<div class="detail-field"><div class="detail-label">显示摘要</div><div class="detail-value">'+esc(item.summary||'无摘要')+'</div></div>'+
    '<div class="detail-field"><div class="detail-label">来源</div><div class="detail-value">'+esc(item.source||'未知')+'</div></div>'+
    '<div class="detail-field"><div class="detail-label">发布时间</div><div class="detail-value">'+esc(item.publishedAt||'未知')+'</div></div>'+
    '<div class="detail-field"><div class="detail-label">原文链接</div><div class="detail-value"><a href="'+esc(item.url||'#')+'" target="_blank">'+esc(item.url||'无链接')+'</a></div></div>'+
    '<div class="detail-field"><div class="detail-label">字数</div><div class="detail-value">标题 '+(item.titleLen||0)+' 字 / 摘要 '+(item.summaryLen||0)+' 字</div></div>';
}

async function saveNewsDraft(){
  var items=(STATE.news&&STATE.news.selected)||[];
  var titles=document.querySelectorAll('.news-title');
  var summaries=document.querySelectorAll('.news-summary');
  titles.forEach(function(inp,i){if(items[i])items[i].title=inp.value});
  summaries.forEach(function(inp,i){if(items[i])items[i].summary=inp.value});
  var r = await api('/api/admin/news/draft',{method:'POST',body:JSON.stringify({items:items})});
  if(r && r.error) throw new Error(r.error);
  toast('草稿已保存','success');
  return r;
}

async function publishNews(){
  try {
    var msg=$('publish-msg');
    if(msg){msg.textContent='正在发布新闻页...';msg.style.display='block';}
    await saveNewsDraft();
    var r = await api('/api/admin/publish/news',{method:'POST'});
    if(r&&r.frameId){toast('已发布: '+r.frameId.slice(0,20)+'...','success');loadDashboard();if(msg){msg.textContent='发布成功: '+r.frameId.slice(0,40);}}
    else{toast('发布失败','error');if(msg){msg.textContent='发布失败';msg.style.background='#f8e0e0';msg.style.borderColor='#f5b3b3';}}
  } catch(e) { toast('发布失败: '+e.message,'error'); }
}

function moveNews(idx,dir){
  var items=(STATE.news&&STATE.news.selected)||[];
  var target=idx+dir;
  if(target<0||target>=items.length)return;
  var tmp=items[idx];items[idx]=items[target];items[target]=tmp;
  if(SELECTED_NEWS_IDX===idx)SELECTED_NEWS_IDX=target;
  else if(SELECTED_NEWS_IDX===target)SELECTED_NEWS_IDX=idx;
  loadNewsReview();
}

function removeNews(idx){
  var items=(STATE.news&&STATE.news.selected)||[];
  items.splice(idx,1);
  if(SELECTED_NEWS_IDX===idx)SELECTED_NEWS_IDX=-1;
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

// ── Photos ──
function loadPhotos(){
  api('/api/admin/photos').then(function(d){
    if(!d||!d.photos)return;
    var el=$('photo-grid');
    if(!el)return;
    el.innerHTML='';
    var photos=d.photos||[];
    var countEl=$('photo-count');
    if(countEl)countEl.textContent='共 '+photos.length+' 张';
    if(photos.length===0){
      el.innerHTML='<div class="empty-state">图片库为空。请上传图片。</div>';
      return;
    }
    photos.forEach(function(p){
      var item=document.createElement('div');item.className='photo-item';
      var safetyBadge='<span class="badge '+(p.safetyStatus==='approved'?'badge-safety-approved':p.safetyStatus==='pending'?'badge-safety-pending':p.safetyStatus==='rejected'?'badge-safety-rejected':'badge-safety-pending')+'">'+(p.safetyStatus||'unknown')+'</span>';
      var thumbUrl='/api/admin/photos/'+p.id+'/thumbnail?'+Date.now();
      item.innerHTML='<div class="thumb"><img src="'+thumbUrl+'" alt="'+esc(p.title||'')+'" loading="lazy" onerror="this.parentElement.classList.add(\'broken\');this.style.display=\'none\'"></div>'+
        '<div class="info">'+
        '<div class="name">'+esc(p.title||p.id.slice(0,12))+'</div>'+
        '<div class="meta-row"><span>'+esc(p.source||'未知')+' · '+(p.width||0)+'x'+(p.height||0)+'</span>'+safetyBadge+'</div>'+
        '<div class="actions">'+
        '<button class="btn btn-sm btn-outline" onclick="openEditor(\''+p.id+'\')">编辑</button>'+
        '<button class="btn btn-sm btn-primary" onclick="publishPhoto(\''+p.id+'\')">发布</button>'+
        '<button class="btn btn-sm btn-danger" onclick="deletePhoto(\''+p.id+'\')">删除</button>'+
        '</div></div>';
      el.appendChild(item);
    });
  }).catch(function(e){
    var el=$('photo-grid');
    if(el)el.innerHTML='<div class="empty-state">图片加载失败: '+esc(e.message||e)+'</div>';
  });
}

// Explicit conditional binding: photo-upload-form is required
var photoForm=$('photo-upload-form');
if(photoForm){
  photoForm.addEventListener('submit',function(e){
    e.preventDefault();
    var fileInput=$('photo-file');
    if(!fileInput||!fileInput.files[0]){toast('请选择文件','error');return;}
    var fd=new FormData();fd.append('photo',fileInput.files[0]);
    fetch('/api/admin/photos/upload',{method:'POST',headers:{},body:fd}).then(function(r){
      if(r.ok){toast('上传成功','success');fileInput.value='';loadPhotos()}
      else{toast('上传失败: HTTP '+r.status,'error')}
    }).catch(function(e){toast('上传错误: '+e.message,'error')});
  });
}

function deletePhoto(id){
  if(!confirm('确认删除该图片?'))return;
  api('/api/admin/photos/'+id,{method:'DELETE'}).then(function(){toast('已删除','info');loadPhotos()}).catch(function(e){toast('删除失败: '+(e.message||e),'error')});
}

function publishPhoto(id){
  api('/api/admin/publish/photo',{method:'POST',body:JSON.stringify({photoId:id})}).then(function(r){
    if(r&&r.frameId){toast('已发布: '+r.frameId.slice(0,20)+'...','success');loadDashboard()}
    else toast('发布失败','error');
  }).catch(function(e){toast('发布失败: '+(e.message||e),'error')});
}

// ── Photo Editor ──
var EDITOR_STATE={};

function openEditor(id){
  switchTab('photo-editor-page');
  EDITOR_STATE.id=id;
  EDITOR_STATE.recipe={brightness:1,contrast:1,saturation:1,gamma:1,rotate:0,flipH:false,flipV:false,sharpen:0,blur:0};
  loadEditorPreview();
  api('/api/admin/photos/'+id).then(function(d){
    if(d){$('editor-title').textContent=d.title||id.slice(0,12)}
  });
}

function loadEditorPreview(){
  var id=EDITOR_STATE.id;
  var recipe=EDITOR_STATE.recipe;
  var params='?id='+id+'&b='+recipe.brightness+'&c='+recipe.contrast+'&s='+recipe.saturation+'&g='+recipe.gamma+'&r='+recipe.rotate+'&fh='+(recipe.flipH?1:0)+'&fv='+(recipe.flipV?1:0)+'&sh='+recipe.sharpen+'&bl='+recipe.blur;
  if($('editor-preview'))$('editor-preview').src='/api/admin/photo-preview'+params+'&t='+Date.now();
  if($('editor-eink-preview'))$('editor-eink-preview').src='/api/admin/photo-eink-preview'+params+'&t='+Date.now();
  api('/api/admin/photo-palette'+params).then(function(d){
    if(!d)return;
    var el=$('editor-palette');if(!el)return;
    el.innerHTML='';
    var colors={0:'#000',1:'#fff',2:'#ff0',3:'#f00',5:'#00f',6:'#0f0'};
    var labels={0:'黑',1:'白',2:'黄',3:'红',5:'蓝',6:'绿'};
    d.palette.forEach(function(p){
      if(p.pixelCount>0){
        var item=document.createElement('div');item.className='palette-item';
        item.innerHTML='<span class="palette-swatch" style="background:'+(colors[p.code]||'#ccc')+'"></span> '+(labels[p.code]||p.code)+': '+p.pixelCount;
        el.appendChild(item);
      }
    });
    if(d.unsupportedCode4>0){
      var err=document.createElement('div');err.style.color='#dc3545';err.style.fontWeight='700';
      err.textContent='警告: 发现 code4 x '+d.unsupportedCode4;
      el.appendChild(err);
    }
  });
  var einkWrapper=$('editor-preview-eink');
  if(einkWrapper)einkWrapper.style.display='block';
}

function updateEditorParam(key,val){
  EDITOR_STATE.recipe[key]=parseFloat(val);
  loadEditorPreview();
}

function saveEdit(){
  api('/api/admin/photos/'+EDITOR_STATE.id+'/save-edit',{method:'POST',body:JSON.stringify({recipe:EDITOR_STATE.recipe})}).then(function(){
    toast('编辑已保存','success');
  }).catch(function(e){toast('保存失败: '+(e.message||e),'error')});
}

// ── Publish History ──
function loadPublishHistory(){
  api('/api/admin/publish-history').then(function(d){
    if(!d||!d.history)return;
    var el=$('publish-history-list');
    if(!el)return;
    el.innerHTML='';
    var history=d.history||[];
    if(history.length===0){
      el.innerHTML='<div class="empty-state">暂无发布记录。</div>';
      return;
    }
    history.forEach(function(h,i){
      var row=document.createElement('div');
      var isActive=(h.status==='active')||(i===0&&!h.status);
      row.className='publish-row'+(isActive?' active':'');
      var frameIdShort=h.frameId?(h.frameId.slice(0,30)+'...'):'--';
      var snapshotId=h.id||h.snapshotId||'--';
      row.innerHTML=
        '<div class="col-time">'+esc((h.publishedAt||'').slice(0,19))+'</div>'+
        '<div class="col-type">'+esc(h.type||'--')+'</div>'+
        '<div class="col-snap">'+esc(snapshotId)+'</div>'+
        '<div class="col-frame">'+esc(frameIdShort)+'</div>'+
        '<div class="col-status">'+(isActive?'<span class="badge badge-active">active</span>':'<span class="badge badge-archived">'+esc(h.status||'archived')+'</span>')+'</div>'+
        '<div class="col-actions"><button class="btn btn-sm btn-outline" onclick="rollback(\''+esc(h.id||'')+'\')">回滚</button></div>';
      el.appendChild(row);
    });
  }).catch(function(e){
    var el=$('publish-history-list');
    if(el)el.innerHTML='<div class="empty-state">发布历史加载失败: '+esc(e.message||e)+'</div>';
  });
}

function rollback(id){
  if(!confirm('确认回滚到该版本?'))return;
  api('/api/admin/rollback',{method:'POST',body:JSON.stringify({publishId:id})}).then(function(r){
    if(r&&r.frameId){toast('已回滚: '+r.frameId.slice(0,20)+'...','success');loadDashboard();loadPublishHistory()}
    else toast('回滚失败','error');
  }).catch(function(e){toast('回滚失败: '+(e.message||e),'error')});
}

// ── Override ──
function clearOverride(){
  api('/api/admin/override',{method:'DELETE'}).then(function(){
    toast('已恢复自动调度','success');loadDashboard()
  }).catch(function(e){toast('操作失败: '+(e.message||e),'error')});
}

// ── Health checks ──
function loadHealth(){
  fetch('/health/live').then(function(r){return r.json().catch(function(){return{}})}).then(function(d){
    setText('health-live',d.status||(d.ok?'ok':'未知'),'未知');
  }).catch(function(){setText('health-live','ERROR','ERROR')});
  fetch('/health/ready').then(function(r){return r.json().catch(function(){return{}})}).then(function(d){
    setText('health-ready',d.status||(d.ok?'ok':'未知'),'未知');
  }).catch(function(){setText('health-ready','ERROR','ERROR')});
}

// ── Status ──
function loadStatus(){
  api('/api/health.json').then(function(d){
    if(!d)return;
    setText('status-uptime',d.uptimeSeconds?Math.floor(d.uptimeSeconds/60)+' 分钟':'<1 分钟','<1 分钟');
    setText('status-mode',d.currentMode,'未设置');
    setText('status-slot',d.currentSlot,'未生成');
    setText('status-frameid',d.frameId?(d.frameId.slice(0,40)+'...'):'未生成','未生成');
    setText('status-framelen',d.frameLength?String(d.frameLength):'暂无','暂无');
    setText('status-sha',d.frameSha256?(d.frameSha256.slice(0,24)+'...'):'暂无','暂无');
    setText('status-news',d.newsItemCount!==undefined?String(d.newsItemCount):'暂无','暂无');
    setText('status-photos',d.photoCount!==undefined?String(d.photoCount):'暂无','暂无');
    setText('status-cache',d.frameCacheEntries!==undefined?String(d.frameCacheEntries):'0','0');
    setText('status-render',d.frameRenderCount!==undefined?String(d.frameRenderCount):'0','0');
    setText('status-state-req',d.stateRequestCount!==undefined?String(d.stateRequestCount):'暂无','暂无');
    setText('status-frame-req',d.frameRequestCount!==undefined?String(d.frameRequestCount):'暂无','暂无');
    setText('status-news-refresh',d.newsRefreshCount!==undefined?String(d.newsRefreshCount):'暂无','暂无');
    setText('status-news-fail',d.newsRefreshFailureCount!==undefined?String(d.newsRefreshFailureCount):'0','0');
    setText('status-mqtt',d.mqttEnabled?'enabled':'disabled','disabled');
    setText('status-translation',d.translationProvider||'none','none');
    setText('status-recent-error',d.recentError||'无错误','无错误');
    setText('status-last-refresh',d.lastNewsRefreshAt||'暂无','暂无');
    // Update sidebar SHA
    var shaEl=$('sidebar-sha');
    if(shaEl&&d.buildSha){shaEl.textContent='SHA: '+d.buildSha.slice(0,12);}
  }).catch(function(e){
    ['status-uptime','status-mode','status-slot','status-frameid','status-news','status-cache'].forEach(function(id){
      setText(id,'加载失败','加载失败');
    });
  });
}

function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}

// Init — wrapped in try/catch to prevent silent white screen
try{
fetch('/api/admin/access-mode').then(function(r){
  if(!r.ok)throw new Error('access-mode HTTP '+r.status);
  return r.json();
}).then(function(d){
  ACCESS_MODE=d.mode||'token';
  if(ACCESS_MODE==='token'){
    if($('login-overlay')){
      showLogin();
      LOGIN_CALLBACK=loadAll;
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
    LOGIN_CALLBACK=loadAll;
  }else{
    showErrorBox('access-mode fetch failed: '+(e&&e.message||e));
    show($('app'));
    loadAll();
  }
});
}catch(e){
  showErrorBox('init failed: '+(e&&e.message||e));
  show($('app'));
  loadAll();
}
