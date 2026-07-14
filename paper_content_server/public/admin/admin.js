var STATE = {};
var ACCESS_MODE = null;
var TOKEN = null;
var LOGIN_CALLBACK = null;

function $(id){return document.getElementById(id)}
function show(el){if(el)el.style.display='block'}
function hide(el){if(el)el.style.display='none'}
function qs(s,p){return(p||document).querySelector(s)}

// ── Page-level error box (no silent white screen) ──
function showErrorBox(msg){
  var box=$('page-error-box');
  if(!box){
    box=document.createElement('div');
    box.id='page-error-box';
    box.style.cssText='position:fixed;top:10px;left:50%;transform:translateX(-50%);background:#cc0000;color:#fff;padding:12px 20px;border-radius:6px;z-index:10000;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.3);max-width:90vw';
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
  // Login UI is optional — server strips it when ADMIN_ACCESS_MODE==='lan'
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
// (server strips the entire login-overlay block in LAN mode — see serveAdminFile in server.js)
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

function switchTab(name){
  document.querySelectorAll('.page').forEach(function(p){p.classList.remove('active')});
  var page=$(name);if(page)page.classList.add('active');
  document.querySelectorAll('.sidebar nav a').forEach(function(a){a.classList.remove('active')});
  var link=qs('a[data-tab="'+name+'"]');if(link)link.classList.add('active');
}

document.querySelectorAll('.sidebar nav a').forEach(function(a){
  a.addEventListener('click',function(e){e.preventDefault();switchTab(a.getAttribute('data-tab'))});
});

function loadAll(){loadDashboard();loadNewsReview();loadPhotos();loadPublishHistory();loadStatus()}

// Safe text setter — no-op when element is missing (HTML may omit optional display fields)
function setText(id,text){var el=$(id);if(el)el.textContent=text;return el}

// ── Dashboard ──
function loadDashboard(){
  api('/api/admin/dashboard').then(function(d){
    if(!d)return;
    setText('dash-mode',d.currentMode||'-');
    setText('dash-slot',d.currentSlot||'-');
    setText('dash-frameid',(d.frameId||'').slice(0,40)+'...');
    setText('dash-nextswitch',d.nextSwitchLocal||'-');
    setText('dash-news',d.newsItemCount||'-');
    setText('dash-cache',d.frameCacheEntries||'-');
    setText('dash-uptime',d.uptimeSeconds?Math.floor(d.uptimeSeconds/60)+' 分钟':'<1 分钟');
    setText('dash-override',d.manualOverride||'auto');
    setText('dash-override-expires',d.overrideExpiresAt||'-');
    setText('dash-lastpublish',d.lastPublishedAt||'-');
    STATE.dashboard=d;
    // Update frame preview
    if($('dash-frame-preview'))$('dash-frame-preview').src='/debug/news-review-6.png?'+Date.now();
  }).catch(function(e){showErrorBox('dashboard load failed: '+(e&&e.message||e))});
}

// ── News Review ──
function loadNewsReview(){
  api('/api/admin/news').then(function(d){
    if(!d)return;
    var el=$('news-list');el.innerHTML='';
    (d.selected||[]).forEach(function(item,i){
      var card=document.createElement('div');card.className='news-card';
      var lenOk=item.titleLen<=24;var sumOk=item.summaryLen>=45&&item.summaryLen<=70;
      card.innerHTML='<div class="meta"><span class="badge" style="background:'+(item.bg||'#333')+';color:#fff">'+(item.category||'综合')+'</span><span style="font-size:12px;color:#888">'+item.source+'</span><span style="font-size:11px;color:#aaa">'+item.titleLen+'字 / '+item.summaryLen+'字</span>'+(lenOk?'':'<span style="color:#cc0000;font-size:11px">标题超长</span>')+(sumOk?'':'<span style="color:#cc0000;font-size:11px">摘要过短</span>')+'</div>'+
        '<label>标题</label><input type="text" class="news-title" value="'+esc(item.title)+'" data-idx="'+i+'">'+
        '<label>摘要</label><textarea class="news-summary" data-idx="'+i+'">'+esc(item.summary)+'</textarea>'+
        '<div class="actions">'+
        '<button class="btn btn-sm btn-outline" onclick="moveNews('+i+',-1)">上移</button>'+
        '<button class="btn btn-sm btn-outline" onclick="moveNews('+i+',1)">下移</button>'+
        '<button class="btn btn-sm btn-danger" onclick="removeNews('+i+')">移除</button>'+
        '<a href="'+(item.url||'#')+'" target="_blank" class="btn btn-sm btn-outline">原文</a>'+
        '</div>';
      el.appendChild(card);
    });
    STATE.news=d;
  });
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
    await saveNewsDraft();
    var r = await api('/api/admin/publish/news',{method:'POST'});
    if(r&&r.frameId){toast('已发布: '+r.frameId.slice(0,20)+'...','success');loadDashboard()}
    else toast('发布失败','error');
  } catch(e) { toast('发布失败: '+e.message,'error'); }
}

function moveNews(idx,dir){
  var items=(STATE.news&&STATE.news.selected)||[];
  var target=idx+dir;
  if(target<0||target>=items.length)return;
  var tmp=items[idx];items[idx]=items[target];items[target]=tmp;
  loadNewsReview();
}

function removeNews(idx){
  var items=(STATE.news&&STATE.news.selected)||[];
  items.splice(idx,1);
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
    var el=$('photo-grid');el.innerHTML='';
    d.photos.forEach(function(p){
      var item=document.createElement('div');item.className='photo-item';
      item.innerHTML='<img src="/api/admin/photos/'+p.id+'/thumbnail?'+Date.now()+'" alt="'+esc(p.title)+'" loading="lazy">'+
        '<div class="info"><div class="name">'+esc(p.title||p.id.slice(0,12))+'</div>'+
        '<div>'+p.source+' · '+p.width+'x'+p.height+'</div>'+
        '<div class="actions" style="margin-top:4px">'+
        '<button class="btn btn-sm btn-outline" onclick="openEditor(\''+p.id+'\')">编辑</button>'+
        '<button class="btn btn-sm btn-outline" onclick="publishPhoto(\''+p.id+'\')">发布</button>'+
        '<button class="btn btn-sm btn-danger" onclick="deletePhoto(\''+p.id+'\')">删除</button>'+
        '</div></div>';
      el.appendChild(item);
    });
  });
}

// Explicit conditional binding: photo-upload-form is required but guard against future HTML changes
var photoForm=$('photo-upload-form');
if(photoForm){
  photoForm.addEventListener('submit',function(e){
    e.preventDefault();
    var fd=new FormData();fd.append('photo',$('photo-file').files[0]);
    fetch('/api/admin/photos/upload',{method:'POST',headers:{},body:fd}).then(function(r){
      if(r.ok){toast('上传成功','success');$('photo-file').value='';loadPhotos()}
      else{toast('上传失败:'+r.status,'error')}
    }).catch(function(e){toast('上传错误: '+e.message,'error')});
  });
}

function deletePhoto(id){
  if(!confirm('确认删除?'))return;
  api('/api/admin/photos/'+id,{method:'DELETE'}).then(function(){toast('已删除','info');loadPhotos()}).catch(function(e){toast('删除失败','error')});
}

function publishPhoto(id){
  api('/api/admin/publish/photo',{method:'POST',body:JSON.stringify({photoId:id})}).then(function(r){
    if(r&&r.frameId){toast('已发布: '+r.frameId.slice(0,20)+'...','success');loadDashboard()}
    else toast('发布失败','error');
  }).catch(function(e){toast('发布失败: '+e.message,'error')});
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
  $('editor-preview').src='/api/admin/photo-preview'+params+'&t='+Date.now();
  $('editor-eink-preview').src='/api/admin/photo-eink-preview'+params+'&t='+Date.now();
  // Load palette
  api('/api/admin/photo-palette'+params).then(function(d){
    if(!d)return;
    var el=$('editor-palette');el.innerHTML='';
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
      var err=document.createElement('div');err.style.color='#c00';err.style.fontWeight='700';
      err.textContent='警告: 发现 code4 x '+d.unsupportedCode4;
      el.appendChild(err);
    }
  });
  // Optional wrapper element — guard against future HTML changes
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
  }).catch(function(e){toast('保存失败','error')});
}

// ── Publish History ──
function loadPublishHistory(){
  api('/api/admin/publish-history').then(function(d){
    if(!d||!d.history)return;
    var el=$('publish-history-list');el.innerHTML='';
    d.history.forEach(function(h){
      var div=document.createElement('div');div.className='news-card';
      div.innerHTML='<div><strong>'+h.type+'</strong> '+h.frameId.slice(0,30)+'... <span style="color:#888;font-size:12px">'+h.publishedAt.slice(0,19)+'</span></div>'+
        '<div style="font-size:12px;color:#888">状态: '+h.status+' 过期: '+(h.expiresAt||'-')+'</div>'+
        '<div class="actions"><button class="btn btn-sm btn-outline" onclick="rollback(\''+h.id+'\')">回滚到此版本</button></div>';
      el.appendChild(div);
    });
  });
}

function rollback(id){
  if(!confirm('确认回滚到该版本?'))return;
  api('/api/admin/rollback',{method:'POST',body:JSON.stringify({publishId:id})}).then(function(r){
    if(r&&r.frameId){toast('已回滚: '+r.frameId.slice(0,20)+'...','success');loadDashboard();loadPublishHistory()}
    else toast('回滚失败','error');
  }).catch(function(e){toast('回滚失败: '+e.message,'error')});
}

// ── Override ──
function clearOverride(){
  api('/api/admin/override',{method:'DELETE'}).then(function(){
    toast('已恢复自动调度','success');loadDashboard()
  }).catch(function(e){toast('操作失败','error')});
}

// ── Status ──
function loadStatus(){
  api('/api/health.json').then(function(d){
    if(!d)return;
    setText('status-uptime',d.uptimeSeconds?Math.floor(d.uptimeSeconds/60)+' 分钟':'<1 分钟');
    setText('status-mode',d.currentMode||'-');
    setText('status-slot',d.currentSlot||'-');
    setText('status-frameid',(d.frameId||'').slice(0,40)+'...');
    setText('status-news',d.newsItemCount||'-');
    setText('status-cache',d.frameCacheEntries||'-');
    setText('status-render',d.frameRenderCount||'-');
    setText('status-state-req',d.stateRequestCount||'-');
    setText('status-frame-req',d.frameRequestCount||'-');
    setText('status-news-refresh',d.newsRefreshCount||'-');
    setText('status-news-fail',d.newsRefreshFailureCount||'-');
  });
}

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}

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
      // Inconsistent state: mode=token but login UI missing from HTML
      showErrorBox('access_mode=token 但登录界面缺失');
      show($('app'));
      loadAll();
    }
  }else{
    // LAN mode: login-overlay stripped by server — just show the app
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
