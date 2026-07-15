var STATE = {};
var ACCESS_MODE = null;
var TOKEN = null;
var LOGIN_CALLBACK = null;
var SELECTED_NEWS_IDX = -1;
var NEWS_BASELINE = null;

function $(id){return document.getElementById(id)}
function show(el){if(!el)return;if(el.id==='app'){el.style.display='grid'}else{el.style.display='block'}}
function hide(el){if(el)style_display(el,'none')}
function style_display(el,val){if(el)el.style.display=val}
function qs(s,p){return(p||document).querySelector(s)}

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
    return r.json().then(function(data){
      if(!r.ok) throw new Error(data.error || data.message || ('HTTP ' + r.status));
      return data;
    }).catch(function(e){
      if(!r.ok) throw e;
      return null;
    });
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
  loadControlMode();loadDashboard();loadNewsReview();loadPhotos();loadPublishHistory();loadStatus();loadHealth();loadContentSyncStatus();
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

function setText(id,text,emptyText){
  var el=$(id);if(!el)return null;
  var val=text;
  if(val===undefined||val===null||val===''||val==='-'||val==='--'){
    val=emptyText||'暂无数据';
  }
  el.textContent=val;
  return el;
}

function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}

function renderQualityRules(item){
  var html='';
  var titleLen=item.titleLen||0;
  var summaryLen=item.summaryLen||0;
  if(titleLen>24){
    html+='<div class="quality-rule error">标题过长: '+titleLen+'/24 字，超出 '+(titleLen-24)+' 字，EPD 上可能被截断</div>';
  }
  if(summaryLen<45){
    html+='<div class="quality-rule warn">摘要过短: '+summaryLen+'/56 字，低于建议下限</div>';
  }
  if(summaryLen>70){
    html+='<div class="quality-rule error">摘要过长: '+summaryLen+'/56 字，超出 '+(summaryLen-56)+' 字，结尾可能被截断</div>';
  }
  if(item.translationStatus==='original'){
    html+='<div class="quality-rule info">未翻译，将显示原文</div>';
  }
  if(item.translationStatus==='missing-key'){
    html+='<div class="quality-rule error">翻译失败: 缺少 API Key</div>';
  }
  if(!html)return '';
  return '<div class="quality-rules">'+html+'</div>';
}

function showConfirm(title,message,onConfirm){
  var overlay=document.createElement('div');
  overlay.className='confirm-overlay';
  overlay.innerHTML='<div class="confirm-box"><h3>'+esc(title)+'</h3><div class="confirm-text">'+esc(message)+'</div><div class="confirm-buttons"><button class="btn btn-outline" id="confirm-cancel-btn">取消</button><button class="btn btn-primary" id="confirm-ok-btn">确认</button></div></div>';
  document.body.appendChild(overlay);
  $('confirm-cancel-btn').onclick=function(){overlay.remove()};
  $('confirm-ok-btn').onclick=function(){overlay.remove();if(onConfirm)onConfirm()};
  overlay.onclick=function(e){if(e.target===overlay)overlay.remove()};
}

function addStatusDetail(el,text,type){
  var existing=el.parentNode.querySelector('.status-detail-text');
  if(existing)existing.remove();
  var detail=document.createElement('div');
  detail.className='status-detail-text '+(type||'info');
  detail.textContent=text;
  el.parentNode.appendChild(detail);
}

// ── Dashboard ──
function loadControlMode() {
  setText('control-mode-info', '加载中…', '加载中…');
  setText('status-mode', '加载中…', '加载中…');
  setText('dash-mode', '加载中…', '加载中…');
  
  api('/api/admin/control-mode').then(function(d) {
    if (!d) return;
    
    var infoHtml = '<div class="control-mode-title">控制模式: ' + esc(d.modeLabel || '未知') + '</div>';
    infoHtml += '<div>' + esc(d.description || '') + '</div>';
    if (d.mode === 'manual' && d.overrideExpiresAt) {
      infoHtml += '<div><small class="muted">到期时间: ' + esc(d.overrideExpiresAt) + '</small></div>';
    } else if (d.mode !== 'manual' && d.slot) {
      infoHtml += '<div><small class="muted">当前 Slot: ' + esc(d.slot) + (d.nextSwitchAt ? ' (下次切换: ' + esc(d.nextSwitchAt) + ')' : '') + '</small></div>';
    }
    
    var box = $('control-mode-info');
    if (box) box.innerHTML = infoHtml;
    
    setText('dash-mode', d.modeLabel || '未知', '未知');
    setText('status-mode', d.modeLabel || '未知', '未知');
  }).catch(function(e) {
    var box = $('control-mode-info');
    if (box) {
      box.innerHTML = '<div class="error">加载失败: ' + esc(e&&e.message||e) + '</div><button class="btn btn-sm btn-outline" style="margin-top:6px" onclick="loadControlMode()">重试</button>';
    }
    setText('dash-mode', '加载失败', '加载失败');
    setText('status-mode', '加载失败', '加载失败');
  });
}

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

function loadContentSyncStatus() {
  api('/api/admin/content-sync/status').then(function(d) {
    if (!d) return;
    
    function formatStatus(s) {
      if (!s) return '未知';
      var html = '';
      if (s.jobRunning) html += '<span class="badge badge-active" style="margin-bottom:4px;display:inline-block">正在运行</span><br>';
      if (s.lastAttemptAt) html += '<div class="small">最近尝试: ' + new Date(s.lastAttemptAt).toLocaleString() + '</div>';
      if (s.lastSuccessAt) html += '<div class="small">最近成功: ' + new Date(s.lastSuccessAt).toLocaleString() + '</div>';
      if (s.lastFailureAt) html += '<div class="small" style="color:var(--danger)">最近失败: ' + new Date(s.lastFailureAt).toLocaleString() + '</div>';
      if (s.lastError) html += '<div class="small" style="color:var(--danger)">错误信息: ' + esc(s.lastError) + '</div>';
      if (s.itemsFetched !== undefined) html += '<div class="small">抓取数量: ' + s.itemsFetched + '</div>';
      if (s.itemsProcessed !== undefined) html += '<div class="small">处理数量: ' + s.itemsProcessed + '</div>';
      if (s.nextRunAt) html += '<div class="small muted">下次自动: ' + new Date(s.nextRunAt).toLocaleTimeString() + '</div>';
      return html || '尚未运行';
    }

    var nBox = $('news-sync-status');
    var pBox = $('photo-sync-status');
    if (nBox) nBox.innerHTML = formatStatus(d.news);
    if (pBox) pBox.innerHTML = formatStatus(d.photos);
    
    // Update button state
    var btnN = $('btn-sync-news');
    var btnP = $('btn-sync-photos');
    if (btnN) btnN.disabled = d.news && d.news.jobRunning;
    if (btnP) btnP.disabled = d.photos && d.photos.jobRunning;
    
  }).catch(function(e) {
    var nBox = $('news-sync-status');
    var pBox = $('photo-sync-status');
    if (nBox) nBox.innerHTML = '<span class="error">加载失败</span>';
    if (pBox) pBox.innerHTML = '<span class="error">加载失败</span>';
  });
}

function triggerNewsSync() {
  $('btn-sync-news').disabled = true;
  api('/api/admin/content-sync/news', { method: 'POST' }).then(function(res) {
    toast('新闻同步已触发后台运行 (Job ID: ' + res.jobId + ')', 'success');
    setTimeout(function() { $('btn-sync-news').disabled = false; loadContentSyncStatus(); }, 3000);
  }).catch(function(e) {
    $('btn-sync-news').disabled = false;
    toast('新闻同步触发失败: ' + (e&&e.message||e), 'error');
  });
}

function triggerPhotoSync() {
  $('btn-sync-photos').disabled = true;
  api('/api/admin/content-sync/photos', { method: 'POST' }).then(function(res) {
    toast('图片同步已触发后台运行 (Job ID: ' + res.jobId + ')', 'success');
    setTimeout(function() { $('btn-sync-photos').disabled = false; loadContentSyncStatus(); }, 3000);
  }).catch(function(e) {
    $('btn-sync-photos').disabled = false;
    toast('图片同步触发失败: ' + (e&&e.message||e), 'error');
  });
}


// ── News Review ──
function loadNewsReview(){
  var el=$('news-list');
  if(!el)return;
  el.innerHTML='<div class="empty-state">加载中...</div>';
  api('/api/admin/news').then(function(d){
    if(!d)return;
    STATE.news=d;
    var items=(d.selected||[]);
    NEWS_BASELINE=JSON.parse(JSON.stringify(items));
    renderNewsList(items);
  }).catch(function(e){
    var el=$('news-list');
    if(el)el.innerHTML='<div class="empty-state">新闻加载失败: '+esc(e.message||e)+'</div>';
  });
}

function renderNewsList(items) {
  var el=$('news-list');
  if(!el)return;
  el.innerHTML='';
  if(items.length===0){
    el.innerHTML='<div class="empty-state">暂无新闻数据。请检查新闻源配置或刷新。</div>';
    return;
  }
  items.forEach(function(item,i){
    var card=document.createElement('div');
    card.className='news-card'+(i===SELECTED_NEWS_IDX?' selected':'');
    var statusBadge='<span class="badge '+(item.translationStatus==='translated'?'badge-status-translated':item.translationStatus==='original'?'badge-status-original':item.translationStatus==='missing-key'?'badge-status-missing-key':item.translationStatus==='failed'?'badge-status-failed':'badge-status-stub')+'">'+(item.translationStatus||'unknown')+'</span>';
    var isFirst=(i===0);
    var isLast=(i===items.length-1);
    var upDisabled=isFirst?' disabled class="btn btn-sm btn-outline btn-disabled"':' class="btn btn-sm btn-outline"';
    var downDisabled=isLast?' disabled class="btn btn-sm btn-outline btn-disabled"':' class="btn btn-sm btn-outline"';
    var qualityHtml=renderQualityRules(item);
    card.innerHTML='<div class="meta">'+
      '<span class="badge badge-category">'+(item.category||'综合')+'</span>'+
      statusBadge+
      '<span class="small muted">'+(item.source||'')+'</span>'+
      '<span class="small muted">'+(item.titleLen||0)+'字 / '+(item.summaryLen||0)+'字</span>'+
      '</div>'+
      qualityHtml+
      '<div class="news-title-row">'+esc(item.title||'无标题')+'</div>'+
      '<div class="news-summary-row">'+esc(item.summary||'无摘要')+'</div>'+
      '<div class="actions">'+
      '<button'+upDisabled+' onclick="event.stopPropagation();moveNews('+i+',-1)">⬆ 上移</button>'+
      '<button'+downDisabled+' onclick="event.stopPropagation();moveNews('+i+',1)">⬇ 下移</button>'+
      '<button class="btn btn-sm btn-danger" onclick="event.stopPropagation();removeNews('+i+')">移除</button>'+
      '<a href="'+(item.url||'#')+'" target="_blank" class="btn btn-sm btn-outline" onclick="event.stopPropagation()">原文</a>'+
      '</div>';
    card.onclick=function(){selectNews(i);};
    el.appendChild(card);
  });
  if(SELECTED_NEWS_IDX>=0&&SELECTED_NEWS_IDX<items.length){
    renderNewsDetail(items[SELECTED_NEWS_IDX]);
  } else {
    var detail = $('news-detail');
    if (detail) detail.innerHTML = '<div class="empty-state">请选择左侧新闻进行编辑</div>';
  }
}

function selectNews(idx){
  SELECTED_NEWS_IDX=idx;
  var items=(STATE.news&&STATE.news.selected)||[];
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
  var qualityHtml=renderQualityRules(item);
  var origTitle=item.originalTitle||null;
  var origSummary=item.originalSummary||null;
  var hasOrig=!!(origTitle||origSummary);
  var origContent='';
  if(hasOrig){
    origContent='<div><strong>标题:</strong> '+esc(origTitle)+'</div><div><strong>摘要:</strong> '+esc(origSummary)+'</div>';
  }else{
    origContent='<em>(原文未提供)</em>';
  }
  var originalSection='<div class="detail-field"><div class="detail-label">原文</div><div class="detail-value"><div class="news-original-content" style="display:none">'+origContent+'</div><button class="btn btn-sm btn-outline news-original-toggle" onclick="toggleOriginal()">显示原文</button></div></div>';
  el.innerHTML=
    '<div class="detail-field"><div class="detail-label">分类</div><div class="detail-value"><span class="badge badge-category">'+esc(item.category||'综合')+'</span> '+statusBadge+'</div></div>'+
    qualityHtml+
    '<div class="detail-field"><div class="detail-label">显示标题</div><div class="detail-value"><input class="news-title" value="'+esc(item.title||'')+'" style="width:100%"></div></div>'+
    '<div class="detail-field"><div class="detail-label">显示摘要</div><div class="detail-value"><textarea class="news-summary" rows="3" style="width:100%">'+esc(item.summary||'')+'</textarea></div></div>'+
    originalSection+
    '<div class="detail-field"><div class="detail-label">来源</div><div class="detail-value">'+esc(item.source||'未知')+'</div></div>'+
    '<div class="detail-field"><div class="detail-label">发布时间</div><div class="detail-value">'+esc(item.publishedAt||'未知')+'</div></div>'+
    '<div class="detail-field"><div class="detail-label">原文链接</div><div class="detail-value"><a href="'+esc(item.url||'#')+'" target="_blank">'+esc(item.url||'无链接')+'</a></div></div>'+
    '<div class="detail-field"><div class="detail-label">字数</div><div class="detail-value">标题 '+(item.titleLen||0)+' 字 / 摘要 '+(item.summaryLen||0)+' 字</div></div>';
}

function toggleOriginal(){
  var area=qs('.news-original-content');
  var btn=qs('.news-original-toggle');
  if(!area||!btn)return;
  if(area.style.display==='none'){
    area.style.display='block';
    btn.textContent='隐藏原文';
  }else{
    area.style.display='none';
    btn.textContent='显示原文';
  }
}

async function saveNewsDraft(){
  var items=(STATE.news&&STATE.news.selected)||[];
  var titles=document.querySelectorAll('.news-title');
  var summaries=document.querySelectorAll('.news-summary');
  titles.forEach(function(inp,i){if(items[i])items[i].title=inp.value});
  summaries.forEach(function(inp,i){if(items[i])items[i].summary=inp.value});
  var changed=false;
  if(NEWS_BASELINE){
    for(var i=0;i<items.length;i++){
      var base=NEWS_BASELINE[i];
      var cur=items[i];
      if(base&&cur&&(base.title!==cur.title||base.summary!==cur.summary)){
        changed=true;
        break;
      }
    }
  }else{
    changed=true;
  }
  if(!changed){
    toast('无变更，无需保存','info');
    return;
  }
  var btn=qs('#news-page .panel-actions .btn-primary');
  if(btn){btn.disabled=true;btn.textContent='保存中...';}
  try {
    var r = await api('/api/admin/news/draft',{method:'POST',body:JSON.stringify({items:items})});
    if(r && r.error) throw new Error(r.error);
    toast('草稿已保存','success');
    NEWS_BASELINE=JSON.parse(JSON.stringify(items));
    return r;
  } catch(e) {
    toast('保存失败: '+e.message,'error');
    throw e;
  } finally {
    if(btn){btn.disabled=false;btn.textContent='💾 保存草稿';}
  }
}

async function publishNews(){
  try {
    var msg=$('publish-msg');
    if(msg){msg.textContent='正在保存草稿...';msg.style.display='block';}
    await saveNewsDraft();
    var items=(STATE.news&&STATE.news.selected)||[];
    showConfirm('发布新闻','确认发布当前 '+items.length+' 条新闻到电子纸？',async function(){
      if(msg){msg.textContent='正在发布新闻页...';msg.style.display='block';}
      try {
        var r = await api('/api/admin/publish/news',{method:'POST'});
        if(r&&r.frameId){toast('已发布: '+r.frameId.slice(0,20)+'...','success');loadDashboard();if(msg){msg.textContent='发布成功: '+r.frameId.slice(0,40);}}
        else{toast('发布失败','error');if(msg){msg.textContent='发布失败';msg.style.background='#f8e0e0';msg.style.borderColor='#f5b3b3';}}
      } catch(e) { toast('发布失败: '+e.message,'error'); if(msg){msg.textContent='发布失败';msg.style.background='#f8e0e0';msg.style.borderColor='#f5b3b3';} }
    });
  } catch(e) {
    if(msg){msg.textContent='';msg.style.display='none';}
  }
}

function moveNews(idx,dir){
  var items=(STATE.news&&STATE.news.selected)||[];
  var target=idx+dir;
  if(target<0||target>=items.length)return;
  var tmp=items[idx];items[idx]=items[target];items[target]=tmp;
  if(SELECTED_NEWS_IDX===idx)SELECTED_NEWS_IDX=target;
  else if(SELECTED_NEWS_IDX===target)SELECTED_NEWS_IDX=idx;
  renderNewsList(items);
}

function removeNews(idx){
  var items=(STATE.news&&STATE.news.selected)||[];
  var item=items[idx];
  if(!item)return;
  showConfirm('确认移除','确认删除新闻: "'+item.title+'"?',function(){
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
    renderNewsList(items);
  });
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
    // Handle upload availability from server response
    if(d.uploadAvailable===false){
      var form=$('photo-upload-form');
      if(form){
        var btn=form.querySelector('button[type="submit"]');
        if(btn){btn.disabled=true;btn.classList.add('btn-disabled');}
        var existing=form.parentNode.querySelector('.disabled-upload');
        if(!existing){
          var msg=document.createElement('div');
          msg.className='disabled-upload';
          msg.innerHTML='<div class="disabled-upload-title">上传暂不可用</div><div>'+(d.uploadDisabledReason||'安全分类器未就绪，暂不可上传')+'</div>';
          form.parentNode.insertBefore(msg,form.nextSibling);
        }
      }
    }
    if(photos.length===0){
      el.innerHTML='<div class="empty-state">图片库为空。</div>';
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

function checkUploadEnabled(){
  fetch('/api/admin/photos/upload',{method:'POST'}).then(function(r){
    if(r.status===503){
      var btn=qs('#photo-upload-form button[type="submit"]');
      if(btn){btn.disabled=true;btn.classList.add('btn-disabled');}
      var form=$('photo-upload-form');
      if(form){
        var existing=form.parentNode.querySelector('.disabled-upload');
        if(!existing){
          var msg=document.createElement('div');
          msg.className='disabled-upload';
          msg.innerHTML='<div class="disabled-upload-title">上传暂不可用</div><div>安全分类器未就绪，暂不可上传</div>';
          form.parentNode.insertBefore(msg,form.nextSibling);
        }
      }
    }
  }).catch(function(){});
}

var photoForm=$('photo-upload-form');
if(photoForm){
  photoForm.addEventListener('submit',function(e){
    e.preventDefault();
    var fileInput=$('photo-file');
    if(!fileInput||!fileInput.files[0]){toast('请选择文件','error');return;}
    var btn=qs('#photo-upload-form button[type="submit"]');
    if(btn){btn.disabled=true;btn.textContent='上传中...';}
    var file = fileInput.files[0];
    var h={'X-File-Name': encodeURIComponent(file.name), 'Content-Type': file.type || 'application/octet-stream'};
    if(TOKEN) h['Authorization']='Bearer '+TOKEN;
    fetch('/api/admin/photos/upload',{method:'POST',headers:h,body:file}).then(function(r){
      if(r.ok){toast('上传成功','success');fileInput.value='';loadPhotos()}
      else{
        r.json().then(function(body){
          toast('上传失败: HTTP '+r.status+' — '+(body.error||'未知错误'),'error');
        }).catch(function(){
          toast('上传失败: HTTP '+r.status,'error');
        });
      }
    }).catch(function(e){toast('上传错误: '+e.message,'error')}).finally(function(){
      if(btn){btn.disabled=false;btn.textContent='📤 上传';}
    });
  });
}

function deletePhoto(id){
  showConfirm('删除图片','确认删除该图片？此操作不可撤销。',function(){
    api('/api/admin/photos/'+id,{method:'DELETE'}).then(function(){toast('已删除','info');loadPhotos()}).catch(function(e){toast('删除失败: '+(e.message||e),'error')});
  });
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
  var editorHeader=$('photo-editor-page').querySelector('h2');
  if(editorHeader){
    var closeBtn=editorHeader.parentNode.querySelector('.editor-close-btn');
    if(!closeBtn){
      closeBtn=document.createElement('button');
      closeBtn.className='btn btn-sm btn-outline editor-close-btn';
      closeBtn.textContent='← 返回图片库';
      closeBtn.onclick=function(){switchTab('photos-page')};
      editorHeader.parentNode.insertBefore(closeBtn,editorHeader.nextSibling);
    }
  }
}

function loadEditorPreview(){
  var id=EDITOR_STATE.id;
  var recipe=EDITOR_STATE.recipe;
  var params='?id='+id+'&b='+recipe.brightness+'&c='+recipe.contrast+'&s='+recipe.saturation+'&g='+recipe.gamma+'&r='+recipe.rotate+'&fh='+(recipe.flipH?1:0)+'&fv='+(recipe.flipV?1:0)+'&sh='+recipe.sharpen+'&bl='+recipe.blur;
  loadPreviewImage('/api/admin/photo-preview'+params+'&t='+Date.now(),'editor-preview','editor-preview-fallback');
  loadPreviewImage('/api/admin/photo-eink-preview'+params+'&t='+Date.now(),'editor-eink-preview','editor-eink-fallback');
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

function loadPreviewImage(url,imgId,fallbackId){
  var img=$(imgId);
  if(!img)return;
  fetch(url).then(function(r){
    if(!r.ok){
      img.style.display='none';
      var fb=$(fallbackId);
      if(!fb){
        fb=document.createElement('div');
        fb.id=fallbackId;
        fb.className='empty-state';
        fb.textContent='图片预览服务未就绪';
        img.parentNode.insertBefore(fb,img.nextSibling);
      }else{
        fb.style.display='block';
      }
    }else{
      var fb=$(fallbackId);
      if(fb)fb.style.display='none';
      img.style.display='';
      r.blob().then(function(b){img.src=URL.createObjectURL(b)});
    }
  }).catch(function(){
    img.style.display='none';
    var fb=$(fallbackId);
    if(!fb){
      fb=document.createElement('div');
      fb.id=fallbackId;
      fb.className='empty-state';
      fb.textContent='图片预览服务未就绪';
      img.parentNode.insertBefore(fb,img.nextSibling);
    }else{
      fb.style.display='block';
    }
  });
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
    STATE.publishHistory=history;
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
        '<div class="col-actions"><button class="btn btn-sm btn-outline" onclick="rollback(\''+esc(h.id||'')+'\')">恢复此版本</button></div>';
      el.appendChild(row);
    });
  }).catch(function(e){
    var el=$('publish-history-list');
    if(el)el.innerHTML='<div class="empty-state">发布历史加载失败: '+esc(e.message||e)+'</div>';
  });
}

var ROLLBACK_TARGET_ID = null;

function rollback(id){
  ROLLBACK_TARGET_ID = id;
  var el=$('rollback-preview-content');
  if(el){
    el.innerHTML='<div class="empty-state">正在加载预览...</div>';
  }
  show($('rollback-preview'));
  
  api('/api/admin/publish-history/' + encodeURIComponent(id) + '/preview').then(function(d){
    if(!d || !el) return;
    
    var html = '<div style="line-height:1.6;font-size:14px;margin-bottom:12px;">' +
      '<div><strong>发布类型:</strong> ' + esc(d.type||'--') + '</div>' +
      '<div><strong>发布时间:</strong> ' + esc(((d.publishedAt||'').slice(0,19)||'--')) + '</div>' +
      '<div><strong>Frame ID:</strong> ' + esc(d.frameId||'--') + '</div>' +
      '</div>';
      
    if(d.type === 'news' && d.preview && d.preview.items) {
      html += '<div style="margin-top:12px;max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:4px;padding:8px;">';
      html += '<div style="font-weight:bold;margin-bottom:8px;">包含的新闻 (' + d.preview.items.length + '条):</div>';
      d.preview.items.forEach(function(item, idx) {
        html += '<div style="margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (idx+1) + '. ' + esc(item.title||'无标题') + '</div>';
      });
      html += '</div>';
    } else if (d.type === 'photo' && d.preview) {
      html += '<div style="margin-top:12px;border:1px solid var(--border);border-radius:4px;padding:8px;text-align:center;">';
      html += '<div style="font-weight:bold;margin-bottom:8px;text-align:left;">图片: ' + esc(d.preview.title||'未知') + '</div>';
      if (d.preview.thumbnailUrl) {
        html += '<img src="' + esc(d.preview.thumbnailUrl) + '" style="max-width:100%;max-height:200px;object-fit:contain;">';
      }
      html += '</div>';
    }
    
    if(!d.canRollback) {
      html += '<div class="error" style="margin-top:10px;">此版本已被标记为不可恢复，可能文件已损坏或丢失。</div>';
    }
    
    el.innerHTML = html;
  }).catch(function(e){
    if(el) el.innerHTML = '<div class="error">无法加载预览: ' + esc(e.message||e) + '</div>';
  });
}

function confirmRollback(){
  if(!ROLLBACK_TARGET_ID) return;
  api('/api/admin/rollback',{method:'POST',body:JSON.stringify({publishId:ROLLBACK_TARGET_ID})}).then(function(r){
    if(r&&r.status==='ok'||(r&&r.frameId)){
      toast('已回滚','success');
      hide($('rollback-preview'));
      ROLLBACK_TARGET_ID = null;
      loadAll();
    } else {
      toast('回滚失败','error');
    }
  }).catch(function(e){
    toast('回滚失败: '+(e.message||e),'error');
  });
}

function closeRollbackPreview(){
  hide($('rollback-preview'));
  ROLLBACK_TARGET_ID = null;
}

// ── Override ──
function clearOverride(){
  showConfirm('退出手动覆盖','确认退出手动覆盖，恢复自动排程？清除当前手动覆盖或焦点锁定后，后续内容由时间 SLOT 调度器自动选择。',function(){
    api('/api/admin/override',{method:'DELETE'}).then(function(){
      toast('已恢复自动调度','success');loadAll()
    }).catch(function(e){toast('操作失败: '+(e.message||e),'error')});
  });
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
    var flEl=setText('status-framelen',d.frameLength!==undefined?String(d.frameLength):'暂无','暂无');
    if(flEl&&(d.frameLength===undefined||d.frameLength===null)){
      flEl.dataset.emptyReason='接口未返回该字段';
      addStatusDetail(flEl,'接口未返回该字段','info');
    }
    var shaEl=setText('status-sha',d.frameSha256?(d.frameSha256.slice(0,24)+'...'):'暂无','暂无');
    if(shaEl&&(d.frameSha256===undefined||d.frameSha256===null)){
      shaEl.dataset.emptyReason='尚未生成 frame';
      addStatusDetail(shaEl,'尚未生成 frame','info');
    }
    setText('status-news',d.newsItemCount!==undefined?String(d.newsItemCount):'暂无','暂无');
    setText('status-photos',d.photoCount!==undefined?String(d.photoCount):'暂无','暂无');
    setText('status-cache',d.frameCacheEntries!==undefined?String(d.frameCacheEntries):'0','0');
    setText('status-render',d.frameRenderCount!==undefined?String(d.frameRenderCount):'0','0');
    setText('status-state-req',d.stateRequestCount!==undefined?String(d.stateRequestCount):'暂无','暂无');
    setText('status-frame-req',d.frameRequestCount!==undefined?String(d.frameRequestCount):'暂无','暂无');
    setText('status-news-refresh',d.newsRefreshCount!==undefined?String(d.newsRefreshCount):'暂无','暂无');
    setText('status-news-fail',d.newsRefreshFailureCount!==undefined?String(d.newsRefreshFailureCount):'0','0');
    var mqttEl=setText('status-mqtt',d.mqttEnabled?'enabled':'disabled','disabled');
    if(mqttEl&&!d.mqttEnabled){
      mqttEl.dataset.emptyReason='已禁用，设备使用 60 秒 HTTP 轮询';
      addStatusDetail(mqttEl,'已禁用，设备使用 60 秒 HTTP 轮询','warning');
    }
    var transEl=setText('status-translation',d.translationProvider||'none','none');
    if(transEl&&(!d.translationProvider||d.translationProvider==='none')){
      transEl.dataset.emptyReason='未配置翻译服务，当前使用缓存译文或原文';
      addStatusDetail(transEl,'未配置翻译服务，当前使用缓存译文或原文','info');
    }
    setText('status-recent-error',d.recentError||'无错误','无错误');
    setText('status-last-refresh',d.lastNewsRefreshAt||'暂无','暂无');
    var shaEl=$('sidebar-sha');
    if(shaEl&&d.buildSha){shaEl.textContent='SHA: '+d.buildSha.slice(0,12);}
  }).catch(function(e){
    ['status-uptime','status-mode','status-slot','status-frameid','status-news','status-cache'].forEach(function(id){
      setText(id,'加载失败','加载失败');
    });
  });
}

// ── Selectors (V2) ──
var selectedPhotoIdForPublish = null;

function showPhotoSelector() {
  selectedPhotoIdForPublish = null;
  var btn = $('btn-confirm-photo-publish');
  if (btn) btn.disabled = true;
  var el = $('photo-selector-grid');
  if (el) el.innerHTML = '<div class="empty-state">加载中…</div>';
  show($('photo-selector-modal'));

  api('/api/admin/photos').then(function(d) {
    if (!d || !d.photos) return;
    if (el) el.innerHTML = '';
    var photos = d.photos || [];
    if (photos.length === 0) {
      if (el) el.innerHTML = '<div class="empty-state">图片库为空。</div>';
      return;
    }
    photos.forEach(function(p) {
      var item = document.createElement('div');
      item.className = 'photo-item';
      item.style.cursor = 'pointer';
      item.onclick = function() {
        document.querySelectorAll('#photo-selector-grid .photo-item').forEach(function(node) {
          node.style.borderColor = '#eef0f3';
          node.style.background = '#fff';
        });
        item.style.borderColor = '#4a9eff';
        item.style.background = '#f0f7ff';
        selectedPhotoIdForPublish = p.id;
        if (btn) btn.disabled = false;
      };
      var thumbUrl = '/api/admin/photos/' + p.id + '/thumbnail?' + Date.now();
      item.innerHTML = '<div class="thumb"><img src="' + thumbUrl + '" alt="' + esc(p.title || '') + '" loading="lazy" onerror="this.parentElement.classList.add(\'broken\');this.style.display=\'none\'"></div>' +
        '<div class="info">' +
        '<div class="name">' + esc(p.title || p.id.slice(0,12)) + '</div>' +
        '<div class="meta-row"><span>' + esc(p.source || '未知') + ' · ' + (p.width || 0) + 'x' + (p.height || 0) + '</span></div></div>';
      if (el) el.appendChild(item);
    });
  }).catch(function(e) {
    if (el) el.innerHTML = '<div class="empty-state">图片加载失败: ' + esc(e.message || e) + '</div>';
  });
}

function hidePhotoSelector() {
  hide($('photo-selector-modal'));
}

function confirmPhotoPublish() {
  if (!selectedPhotoIdForPublish) return;
  hidePhotoSelector();
  publishPhoto(selectedPhotoIdForPublish);
}

function showNewsSelector() {
  var el = $('news-selector-content');
  var btn = $('btn-confirm-news-publish');
  if (el) el.innerHTML = '<div class="empty-state">加载中…</div>';
  if (btn) btn.disabled = true;
  show($('news-selector-modal'));

  api('/api/admin/news').then(function(d) {
    if (!d || !d.news || d.news.length === 0) {
      if (el) el.innerHTML = '<div class="empty-state">当前草稿箱没有新闻。请先在“新闻审查”中获取或编写新闻。</div>';
      return;
    }
    var html = '<ul style="padding-left: 20px;">';
    d.news.forEach(function(n) {
      html += '<li style="margin-bottom:8px"><strong>' + esc(n.title) + '</strong><br><span class="muted small">' + esc(n.summary || '').substring(0,60) + '...</span></li>';
    });
    html += '</ul>';
    if (el) el.innerHTML = html;
    if (btn) btn.disabled = false;
  }).catch(function(e) {
    if (el) el.innerHTML = '<div class="empty-state">新闻加载失败: ' + esc(e.message || e) + '</div>';
  });
}

function hideNewsSelector() {
  hide($('news-selector-modal'));
}

function confirmNewsPublish() {
  hideNewsSelector();
  publishNews();
}

// ── Init ──
try{
  (function(){
    var publishBtn=qs('button[onclick="publishNews()"]');
    if(publishBtn&&!publishBtn.parentNode.querySelector('.publish-helper')){
      var helper=document.createElement('span');
      helper.className='muted small publish-helper';
      helper.style.marginLeft='8px';
      helper.textContent='保存当前草稿并立即发布到电子纸';
      publishBtn.parentNode.insertBefore(helper,publishBtn.nextSibling);
    }
  })();
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
    loadAll();checkUploadEnabled();
  }
});
}catch(e){
  showErrorBox('init failed: '+(e&&e.message||e));
  show($('app'));
  loadAll();
}
