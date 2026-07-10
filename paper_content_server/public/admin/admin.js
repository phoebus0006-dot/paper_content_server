var TOKEN = null;
var STATE = {};

function $(id){return document.getElementById(id)}
function show(el){el.style.display='block'}
function hide(el){el.style.display='none'}
function qs(s,p){return(p||document).querySelector(s)}

function api(path,opts){
  opts=opts||{};
  var h={'Content-Type':'application/json'};
  if(TOKEN) h['Authorization']='Bearer '+TOKEN;
  return fetch(path,Object.assign({headers:h},opts)).then(function(r){
    if(r.status===401||r.status===403){showLogin();throw new Error('unauthorized')}
    if(r.status===204)return null;
    return r.json().catch(function(){return null});
  });
}

function toast(msg,type){type=type||'info';var t=document.createElement('div');t.className='toast toast-'+type;t.textContent=msg;document.body.appendChild(t);setTimeout(function(){t.remove()},3000)}

function showLogin(){
  hide($('app'));
  show($('login-overlay'));
  $('login-token').value='';
  $('login-error').style.display='none';
}

function hideLogin(){hide($('login-overlay'));show($('app'))}

$('login-form').addEventListener('submit',function(e){
  e.preventDefault();
  var token=$('login-token').value.trim();
  if(!token)return;
  api('/api/admin/dashboard',{headers:{'Authorization':'Bearer '+token}}).then(function(d){
    if(d&&d.status==='ok'){TOKEN=token;hideLogin();loadAll()}
    else{$('login-error').textContent='Token 无效';$('login-error').style.display='block'}
  }).catch(function(){toast('认证失败','error')});
});

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

// ── Dashboard ──
function loadDashboard(){
  api('/api/admin/dashboard').then(function(d){
    if(!d)return;
    $('dash-mode').textContent=d.currentMode||'-';
    $('dash-slot').textContent=d.currentSlot||'-';
    $('dash-frameid').textContent=(d.frameId||'').slice(0,40)+'...';
    $('dash-nextswitch').textContent=d.nextSwitchLocal||'-';
    $('dash-news').textContent=d.newsItemCount||'-';
    $('dash-cache').textContent=d.frameCacheEntries||'-';
    $('dash-uptime').textContent=d.uptimeSeconds?Math.floor(d.uptimeSeconds/60)+' 分钟':'<1 分钟';
    $('dash-override').textContent=d.manualOverride||'auto';
    $('dash-override-expires').textContent=d.overrideExpiresAt||'-';
    $('dash-lastpublish').textContent=d.lastPublishedAt||'-';
    STATE.dashboard=d;
    // Update frame preview
    if($('dash-frame-preview'))$('dash-frame-preview').src='/debug/news-review-6.png?'+Date.now();
  });
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

function saveNewsDraft(){
  var items=(STATE.news&&STATE.news.selected)||[];
  var titles=document.querySelectorAll('.news-title');
  var summaries=document.querySelectorAll('.news-summary');
  titles.forEach(function(inp,i){if(items[i])items[i].title=inp.value});
  summaries.forEach(function(inp,i){if(items[i])items[i].summary=inp.value});
  api('/api/admin/news/draft',{method:'POST',body:JSON.stringify({items:items})}).then(function(r){
    toast('草稿已保存','success');
  }).catch(function(e){toast('保存失败: '+e.message,'error')});
}

function publishNews(){
  saveNewsDraft();
  api('/api/admin/publish/news',{method:'POST'}).then(function(r){
    if(r&&r.frameId){toast('已发布: '+r.frameId.slice(0,20)+'...','success');loadDashboard()}
    else toast('发布失败','error');
  }).catch(function(e){toast('发布失败: '+e.message,'error')});
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

$('photo-upload-form').addEventListener('submit',function(e){
  e.preventDefault();
  var fd=new FormData();fd.append('photo',$('photo-file').files[0]);
  fetch('/api/admin/photos/upload',{method:'POST',headers:{'Authorization':'Bearer '+TOKEN},body:fd}).then(function(r){
    if(r.ok){toast('上传成功','success');$('photo-file').value='';loadPhotos()}
    else{toast('上传失败:'+r.status,'error')}
  }).catch(function(e){toast('上传错误: '+e.message,'error')});
});

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
  $('editor-preview-eink').style.display='block';
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
    $('status-uptime').textContent=d.uptimeSeconds?Math.floor(d.uptimeSeconds/60)+' 分钟':'<1 分钟';
    $('status-mode').textContent=d.currentMode||'-';
    $('status-slot').textContent=d.currentSlot||'-';
    $('status-frameid').textContent=(d.frameId||'').slice(0,40)+'...';
    $('status-news').textContent=d.newsItemCount||'-';
    $('status-cache').textContent=d.frameCacheEntries||'-';
    $('status-render').textContent=d.frameRenderCount||'-';
    $('status-state-req').textContent=d.stateRequestCount||'-';
    $('status-frame-req').textContent=d.frameRequestCount||'-';
    $('status-news-refresh').textContent=d.newsRefreshCount||'-';
    $('status-news-fail').textContent=d.newsRefreshFailureCount||'-';
  });
}

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}

// Init
if(!TOKEN)showLogin();
