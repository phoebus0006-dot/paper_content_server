var STATE = {};
var ACCESS_MODE = null;
var TOKEN = null;
var LOGIN_CALLBACK = null;
var SELECTED_NEWS_IDX = -1;
var NEWS_BASELINE = null;
var _editorPreviewTimer = null;
// 每个 imgId 独立的序号计数器。之前用单一全局 _editorPreviewSeq，
// loadEditorPreview 连续调两次 loadPreviewImage（editor-preview + editor-eink-preview），
// 第二次 ++seq 会让第一次的 mySeq 永远过时，editor-preview 永不更新。
var _editorPreviewSeqs = {};

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
    var ok = r.ok;
    if(r.status===401||r.status===403){
      // TOKEN 模式下任何 401/403 都应清除 token 并提示重新登录（之前只清除 !TOKEN 的情况，
      // 即从未设置过 token，导致 token 过期/失效时后续所有请求都失败但用户不被引导重新登录）
      if(ACCESS_MODE==='token'){
        TOKEN=null;
        showLogin();
        throw new Error('unauthorized')
      }
    }
    if(r.status===204)return null;
    return r.json().then(function(data){
      if(!ok) throw new Error(data.error || data.message || ('HTTP ' + r.status));
      return data;
    }).catch(function(e){
      if(!ok) throw e && e.message ? e : new Error('HTTP ' + r.status);
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
// URL 安全校验：esc 只转义 HTML 实体，不拦 javascript:/data: 等 scheme。
// 新闻 url 来自 RSS，若源被污染可注入 javascript:alert(...) 存储型 XSS。
function safeUrl(u){
  u=String(u==null?'':u).trim();
  if(/^https?:\/\//i.test(u) || /^mailto:/i.test(u)) return u;
  return '#';
}

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

// 通用轮询：每 2 秒拉一次 content-sync/status，直到 jobRunning=false 或超时 60 秒。
// 之前固定 3 秒后恢复按钮：同步作业可能要 10+ 秒，用户在作业结束前再点会触发 409，
// 且看不到"抓到几条新内容"——这正是用户报告"显示后台拉取但实际没新内容"的原因。
function pollSyncStatus(kind, btn, onDone) {
  var start = Date.now();
  function tick() {
    api('/api/admin/content-sync/status').then(function(d) {
      var s = d && d[kind];
      if (s && s.jobRunning && Date.now()-start < 60000) {
        setTimeout(tick, 2000);
      } else {
        if (btn) btn.disabled = false;
        loadContentSyncStatus();
        if (onDone) onDone(s);
      }
    }).catch(function() {
      if (btn) btn.disabled = false;
    });
  }
  setTimeout(tick, 1500);
}

function triggerNewsSync() {
  $('btn-sync-news').disabled = true;
  api('/api/admin/content-sync/news', { method: 'POST' }).then(function(res) {
    toast('新闻同步已触发后台运行 (Job ID: ' + res.jobId + ')，正在拉取…', 'info');
    pollSyncStatus('news', $('btn-sync-news'), function(s){
      if (s && s.lastError) {
        toast('新闻同步失败: ' + s.lastError, 'error');
      } else if (s) {
        toast('新闻同步完成：抓取 ' + (s.itemsFetched||0) + ' 条，新增 ' + (s.itemsAdded||0) + ' 条', 'success');
        loadNewsReview(); // 拉到新内容后刷新审查页
      }
    });
  }).catch(function(e) {
    $('btn-sync-news').disabled = false;
    toast('新闻同步触发失败: ' + (e&&e.message||e), 'error');
  });
}

function triggerPhotoSync() {
  $('btn-sync-photos').disabled = true;
  api('/api/admin/content-sync/photos', { method: 'POST' }).then(function(res) {
    toast('图片同步已触发后台运行 (Job ID: ' + res.jobId + ')，正在拉取…', 'info');
    pollSyncStatus('photos', $('btn-sync-photos'), function(s){
      if (s && s.lastError) {
        toast('图片同步失败: ' + s.lastError, 'error');
      } else if (s) {
        toast('图片同步完成：处理 ' + (s.itemsProcessed||0) + ' 张，新增 ' + ((s.newIds&&s.newIds.length)||0) + ' 张', 'success');
        loadPhotos(); // 拉到新图片后刷新图片库
      }
    });
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
      '<a href="'+esc(safeUrl(item.url))+'" target="_blank" class="btn btn-sm btn-outline" onclick="event.stopPropagation()">原文</a>'+
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
  var items=(STATE.news&&STATE.news.selected)||[];
  // 切换前先把当前 input 的编辑值回写到 items[SELECTED_NEWS_IDX]，
  // 否则 innerHTML 替换后 input DOM 被销毁，未保存的编辑静默丢失。
  if(SELECTED_NEWS_IDX>=0 && SELECTED_NEWS_IDX<items.length){
    var curTitleInp=qs('.news-title');
    var curSumInp=qs('.news-summary');
    if(curTitleInp && items[SELECTED_NEWS_IDX]) items[SELECTED_NEWS_IDX].title=curTitleInp.value;
    if(curSumInp && items[SELECTED_NEWS_IDX]) items[SELECTED_NEWS_IDX].summary=curSumInp.value;
  }
  SELECTED_NEWS_IDX=idx;
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
    '<div class="detail-field"><div class="detail-label">原文链接</div><div class="detail-value"><a href="'+esc(safeUrl(item.url))+'" target="_blank">'+esc(item.url||'无链接')+'</a></div></div>'+
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
  // 页面只有一个 .news-title / .news-summary input（在详情面板，对应 SELECTED_NEWS_IDX）。
  // 旧代码用 querySelectorAll 按索引回写，长度永远是 1，所有编辑都被写入 items[0]，
  // 破坏第 0 条数据且编辑内容丢失。
  var titleInput=qs('.news-title');
  var summaryInput=qs('.news-summary');
  if(titleInput && SELECTED_NEWS_IDX>=0 && items[SELECTED_NEWS_IDX]){
    items[SELECTED_NEWS_IDX].title=titleInput.value;
  }
  if(summaryInput && SELECTED_NEWS_IDX>=0 && items[SELECTED_NEWS_IDX]){
    items[SELECTED_NEWS_IDX].summary=summaryInput.value;
  }
  var changed=false;
  if(NEWS_BASELINE){
    // 变更检测：长度不等即变更；循环上界用 max(items, baseline) 长度，
    // 避免删除最后一条时循环只到 items.length 漏检末尾删除。
    if(items.length!==NEWS_BASELINE.length){
      changed=true;
    }else{
      for(var i=0;i<items.length;i++){
        var base=NEWS_BASELINE[i];
        var cur=items[i];
        if(base&&cur&&(base.title!==cur.title||base.summary!==cur.summary||base.url!==cur.url)){
          changed=true;
          break;
        }
      }
    }
  }else{
    changed=true;
  }
  if(!changed){
    toast('无变更，无需保存','info');
    return null;
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
    // 不在这里 toast，由调用方（publishNews）统一反馈，避免双 toast
    throw e;
  } finally {
    if(btn){btn.disabled=false;btn.textContent='💾 保存草稿';}
  }
}

async function publishNews(){
  var msg=$('publish-msg');
  try {
    if(msg){msg.textContent='正在保存草稿...';msg.style.display='block';msg.style.background='';msg.style.borderColor='';}
    await saveNewsDraft();
    var items=(STATE.news&&STATE.news.selected)||[];
    showConfirm('发布新闻','确认发布当前 '+items.length+' 条新闻到电子纸？',async function(){
      if(msg){msg.textContent='正在发布新闻页...';msg.style.display='block';}
      try {
        var r = await api('/api/admin/publish/news',{method:'POST'});
        if(r&&r.frameId){toast('已发布: '+r.frameId.slice(0,20)+'...','success');loadDashboard();loadPublishHistory();if(msg){msg.textContent='发布成功: '+r.frameId.slice(0,40);msg.style.background='';msg.style.borderColor='';}}
        else{toast('发布失败','error');if(msg){msg.textContent='发布失败';msg.style.background='#f8e0e0';msg.style.borderColor='#f5b3b3';}}
      } catch(e) { toast('发布失败: '+e.message,'error'); if(msg){msg.textContent='发布失败: '+e.message;msg.style.background='#f8e0e0';msg.style.borderColor='#f5b3b3';} }
    });
  } catch(e) {
    // saveNewsDraft 失败（如 400 校验错误）时给用户明确反馈，不再静默吞错
    toast('发布取消：草稿保存失败 - '+(e&&e.message||e),'error');
    if(msg){msg.textContent='发布失败：'+(e&&e.message||e);msg.style.background='#f8e0e0';msg.style.borderColor='#f5b3b3';msg.style.display='block';}
  }
}

function moveNews(idx,dir){
  var items=(STATE.news&&STATE.news.selected)||[];
  // 切换/移动前必须回写当前编辑的标题/摘要到 items，否则 renderNewsList 重渲染
  // 会销毁 input DOM，用户在详情面板改的内容静默丢失。
  if(SELECTED_NEWS_IDX>=0 && SELECTED_NEWS_IDX<items.length){
    var tIn=qs('.news-title'), sIn=qs('.news-summary');
    if(tIn && items[SELECTED_NEWS_IDX]) items[SELECTED_NEWS_IDX].title=tIn.value;
    if(sIn && items[SELECTED_NEWS_IDX]) items[SELECTED_NEWS_IDX].summary=sIn.value;
  }
  var target=idx+dir;
  if(target<0||target>=items.length)return;
  var tmp=items[idx];items[idx]=items[target];items[target]=tmp;
  if(SELECTED_NEWS_IDX===idx)SELECTED_NEWS_IDX=target;
  else if(SELECTED_NEWS_IDX===target)SELECTED_NEWS_IDX=idx;
  renderNewsList(items);
}

function removeNews(idx){
  var items=(STATE.news&&STATE.news.selected)||[];
  // 同 moveNews：showConfirm 是异步的，confirm 回调执行前 input 可能已被重渲染，
  // 必须在弹确认框前先把当前编辑回写。
  if(SELECTED_NEWS_IDX>=0 && SELECTED_NEWS_IDX<items.length){
    var tIn=qs('.news-title'), sIn=qs('.news-summary');
    if(tIn && items[SELECTED_NEWS_IDX]) items[SELECTED_NEWS_IDX].title=tIn.value;
    if(sIn && items[SELECTED_NEWS_IDX]) items[SELECTED_NEWS_IDX].summary=sIn.value;
  }
  var item=items[idx];
  if(!item)return;
  // 服务器要求草稿必须正好 6 条。如果当前已是最小可用数（candidates 不足补位），
  // 禁止继续删除，否则保存草稿会被 400 拒绝，发布链路断裂。
  var candidatesAvail=0;
  if(STATE.news&&STATE.news.candidates){
    var used={};items.forEach(function(it){if(it.url)used[it.url]=true});
    STATE.news.candidates.forEach(function(c){if(c.url&&!used[c.url])candidatesAvail++});
  }
  if(items.length-1<6 && candidatesAvail===0){
    toast('已达最小条数（6 条），无候选可补位，无法继续删除','error');
    return;
  }
  showConfirm('确认移除','确认删除新闻: "'+item.title+'"?',function(){
    items.splice(idx,1);
    if(SELECTED_NEWS_IDX===idx)SELECTED_NEWS_IDX=-1;
    else if(SELECTED_NEWS_IDX>idx)SELECTED_NEWS_IDX--;
    if(items.length<6&&STATE.news.candidates){
      var used2={};items.forEach(function(it){if(it.url)used2[it.url]=true});
      for(var i=0;i<STATE.news.candidates.length;i++){
        var c=STATE.news.candidates[i];
        if(!used2[c.url]){items.push(c);break;}
      }
    }
    renderNewsList(items);
    // 立即落盘，否则删除只存在于浏览器内存：用户切到发布中心点"发布新闻"，
    // /api/admin/news 优先读 admin_news_draft.json（旧草稿，被删的那条还在），
    // 用户看到"删了的新闻还能发布"——这正是用户报告的现象。
    // 强制把 NEWS_BASELINE 设为 null 让 saveNewsDraft 的变更检测判定 changed=true，
    // 因为 splice 后若 candidates 补位，items.length 可能仍为 6，与 baseline 相同，
    // 但 url 已变化，必须落盘。
    NEWS_BASELINE = null;
    saveNewsDraft().catch(function(e){
      toast('删除已应用但草稿保存失败: '+(e&&e.message||e)+'。请手动点"💾 保存草稿"重试。','error');
    });
  });
}

// ── Photos ──
function loadPhotos(){
  api('/api/admin/photos').then(function(d){
    if(!d||!d.photos)return;
    var el=$('photo-grid');
    if(!el)return;
    // 释放旧缩略图的 Blob URL，避免每次刷新都泄漏 N 个 Blob（之前 innerHTML='' 直接销毁 img 节点，
    // 但 blob: URL 没被 revokeObjectURL，全部留在浏览器 Blob URL store 直到页面关闭）。
    el.querySelectorAll('img').forEach(function(img){
      if(img.src && img.src.indexOf('blob:')===0) URL.revokeObjectURL(img.src);
    });
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
      // TOKEN 模式下 <img src> 无法带 Authorization 头，缩略图会 403。
      // 改为 fetch + createObjectURL 渲染。
      var thumbUrl='/api/admin/photos/'+encodeURIComponent(p.id)+'/thumbnail?'+Date.now();
      item.innerHTML='<div class="thumb"><img alt="'+esc(p.title||'')+'" loading="lazy" onerror="this.parentElement.classList.add(\'broken\');this.style.display=\'none\'"></div>'+
        '<div class="info">'+
        '<div class="name">'+esc(p.title||p.id.slice(0,12))+'</div>'+
        '<div class="meta-row"><span>'+esc(p.source||'未知')+' · '+(p.width||0)+'x'+(p.height||0)+'</span>'+safetyBadge+'</div>'+
        '<div class="actions">'+
        '<button class="btn btn-sm btn-outline" onclick="openEditor(\''+p.id+'\')">编辑</button>'+
        '<button class="btn btn-sm btn-primary" onclick="publishPhoto(\''+p.id+'\')">发布</button>'+
        '<button class="btn btn-sm btn-danger" onclick="deletePhoto(\''+p.id+'\')">删除</button>'+
        '</div></div>';
      el.appendChild(item);
      // 异步加载缩略图（带 Authorization 头）
      (function(imgEl,url){
        var h={};
        if(TOKEN)h['Authorization']='Bearer '+TOKEN;
        fetch(url,{headers:h}).then(function(r){
          if(!r.ok)return;
          return r.blob();
        }).then(function(b){
          if(b && imgEl){
            // 释放上一次的 Blob URL，避免每次刷新都泄漏所有缩略图的 Blob
            if(imgEl.src && imgEl.src.indexOf('blob:')===0){URL.revokeObjectURL(imgEl.src)}
            imgEl.src=URL.createObjectURL(b);
          }
        }).catch(function(){});
      })(item.querySelector('img'),thumbUrl);
    });
  }).catch(function(e){
    var el=$('photo-grid');
    if(el)el.innerHTML='<div class="empty-state">图片加载失败: '+esc(e.message||e)+'</div>';
  });
}

// checkUploadEnabled 已删除：旧实现用 POST /api/admin/photos/upload 探测，
// 既不带 Authorization 头（TOKEN 模式 403），又会把空 body 当上传尝试
// （污染 image_index.json）。uploadAvailable 字段已由 GET /api/admin/photos
// 响应体返回（server.js 中硬编码为 true），loadPhotos 会处理 false 分支。
function checkUploadEnabled(){}

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
    if(r&&r.frameId){toast('已发布: '+r.frameId.slice(0,20)+'...','success');loadDashboard();loadPublishHistory()}
    else toast('发布失败','error');
  }).catch(function(e){toast('发布失败: '+(e.message||e),'error')});
}

// ── Photo Editor ──
var EDITOR_STATE={};

function openEditor(id){
  switchTab('photo-editor-page');
  EDITOR_STATE.id=id;
  // 默认 recipe;如果图片有已保存的 recipe,后续异步覆盖
  EDITOR_STATE.recipe={brightness:1,contrast:1,saturation:1,gamma:1,rotate:0,flipH:false,flipV:false,sharpen:0,blur:0};
  resetEditorControls();
  loadEditorPreview();
  api('/api/admin/photos/'+id).then(function(d){
    if(!d)return;
    $('editor-title').textContent=d.title||id.slice(0,12);
    // 加载已保存的 recipe(来自 saveEdit),否则用户每次打开编辑器都丢失之前的调整
    if(d.recipe){
      EDITOR_STATE.recipe=Object.assign({},EDITOR_STATE.recipe,d.recipe);
      resetEditorControls();
      loadEditorPreview();
    }
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

// 把 UI 控件(滑块/复选框/下拉)同步到 EDITOR_STATE.recipe,避免打开新图片时控件位置和 recipe 不同步
function resetEditorControls(){
  var r=EDITOR_STATE.recipe;
  var setRange=function(key,id){
    var el=$(id);
    if(el){el.value=r[key]}
    var val=$('val-'+key);
    if(val){val.textContent=Number(r[key]).toFixed(1)}
  };
  setRange('brightness','editor-brightness');
  setRange('contrast','editor-contrast');
  setRange('saturation','editor-saturation');
  setRange('gamma','editor-gamma');
  setRange('sharpen','editor-sharpen');
  setRange('blur','editor-blur');
  var rotEl=$('editor-rotate');
  if(rotEl){rotEl.value=String(r.rotate)}
  var fhEl=$('editor-flipH');
  if(fhEl){fhEl.checked=!!r.flipH}
  var fvEl=$('editor-flipV');
  if(fvEl){fvEl.checked=!!r.flipV}
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
  var einkWrapper=$('editor-eink-preview');
  if(einkWrapper && einkWrapper.parentNode)einkWrapper.parentNode.style.display='block';
}

function loadPreviewImage(url,imgId,fallbackId){
  var img=$(imgId);
  if(!img)return;
  // 竞态防护：每个 imgId 独立序号，回调中校验是否仍是最新请求，
  // 否则旧响应可能覆盖新请求结果（用户看到的预览与滑块位置不一致）。
  // 注意：editor-preview 和 editor-eink-preview 是两个独立 img，必须用各自序号，
  // 否则第二次调用会让第一次的回调永远过时，editor-preview 永不更新。
  _editorPreviewSeqs[imgId]=(_editorPreviewSeqs[imgId]||0)+1;
  var mySeq=_editorPreviewSeqs[imgId];
  // TOKEN 模式下图片端点要求 Authorization 头，裸 fetch 会 403。
  // 用带 Authorization 头的 fetch + createObjectURL 渲染。
  var headers={};
  if(TOKEN)headers['Authorization']='Bearer '+TOKEN;
  fetch(url,{headers:headers}).then(function(r){
    if(mySeq!==_editorPreviewSeqs[imgId])return; // 已被新请求取代
    if(!r.ok){
      img.style.display='none';
      var fb=$(fallbackId);
      if(!fb){
        fb=document.createElement('div');
        fb.id=fallbackId;
        fb.className='empty-state';
        fb.textContent='图片预览服务未就绪 (HTTP '+r.status+')';
        img.parentNode.insertBefore(fb,img.nextSibling);
      }else{
        fb.style.display='block';
      }
    }else{
      var fb=$(fallbackId);
      if(fb)fb.style.display='none';
      img.style.display='';
      r.blob().then(function(b){
        if(mySeq!==_editorPreviewSeqs[imgId])return;
        // 释放上一次的 Blob URL，避免内存泄漏（每次预览都创建新 Blob）
        if(img.src && img.src.indexOf('blob:')===0){URL.revokeObjectURL(img.src)}
        img.src=URL.createObjectURL(b);
      });
    }
  }).catch(function(){
    if(mySeq!==_editorPreviewSeqs[imgId])return;
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

// 编辑器预览防抖：滑块拖动时每像素触发 oninput，无防抖会堆积请求 + 服务端 sharp 高 CPU。
// _editorPreviewTimer / _editorPreviewSeq 在文件顶部声明以避免 hoisting 引用问题。
function updateEditorParam(key,val){
  // flipH/flipV 是 boolean,其他是 number
  if(key==='flipH'||key==='flipV'){
    EDITOR_STATE.recipe[key]=!!val;
  } else {
    EDITOR_STATE.recipe[key]=parseFloat(val);
    // 更新数值显示
    var valEl=$('val-'+key);
    if(valEl){valEl.textContent=parseFloat(val).toFixed(1)}
  }
  if(_editorPreviewTimer)clearTimeout(_editorPreviewTimer);
  _editorPreviewTimer=setTimeout(loadEditorPreview,250);
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
      // 之前用 h.id（历史条目 ID，非 snapshotId），列名是 snapshotId 但显示别的。
      var snapshotId=h.snapshotId||h.id||'--';
      row.innerHTML=
        '<div class="col-time">'+esc((h.publishedAt||'').slice(0,19))+'</div>'+
        '<div class="col-type">'+esc(h.type||'--')+'</div>'+
        '<div class="col-snap">'+esc(snapshotId)+'</div>'+
        '<div class="col-frame">'+esc(frameIdShort)+'</div>'+
        '<div class="col-status">'+(isActive?'<span class="badge badge-active">active</span>':'<span class="badge badge-archived">'+esc(h.status||'archived')+'</span>')+'</div>'+
        '<div class="col-actions"><button class="btn btn-sm btn-outline" onclick="rollback(\''+esc(h.snapshotId||h.id||'')+'\')">恢复此版本</button></div>';
      el.appendChild(row);
    });
  }).catch(function(e){
    var el=$('publish-history-list');
    if(el)el.innerHTML='<div class="empty-state">发布历史加载失败: '+esc(e.message||e)+'</div>';
  });
}

var ROLLBACK_TARGET_ID = null;
// 记录预览返回的 canRollback，confirmRollback 发请求前检查。
// 之前即便预览已显示"此版本已被标记为不可恢复"，确认按钮仍可点击，
// 发请求后 server 抛 "Snapshot is not restorable" → 400 → 用户看到"直接报错"。
var ROLLBACK_TARGET_CAN_ROLLBACK = true;

function rollback(id){
  ROLLBACK_TARGET_ID = id;
  ROLLBACK_TARGET_CAN_ROLLBACK = true;
  var el=$('rollback-preview-content');
  if(el){
    el.innerHTML='<div class="empty-state">正在加载预览...</div>';
  }
  show($('rollback-preview'));

  api('/api/admin/publish-history/' + encodeURIComponent(id) + '/preview').then(function(d){
    if(!d || !el) return;
    ROLLBACK_TARGET_CAN_ROLLBACK = (d.canRollback !== false);

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
        // TOKEN 模式下裸 <img src> 会 403，先放空 img 容器再异步 fetch+blob
        html += '<img id="rollback-preview-thumb" style="max-width:100%;max-height:200px;object-fit:contain;" alt="预览">';
      }
      html += '</div>';
    }

    if(d.canRollback === false) {
      html += '<div class="error" style="margin-top:10px;">此版本已被标记为不可恢复，可能文件已损坏或丢失。无法恢复。</div>';
    }

    el.innerHTML = html;
    // 异步加载缩略图（带 Authorization 头）
    if (d.type === 'photo' && d.preview && d.preview.thumbnailUrl) {
      var rbThumb = $('rollback-preview-thumb');
      if (rbThumb) {
        var h = {};
        if (TOKEN) h['Authorization'] = 'Bearer ' + TOKEN;
        fetch(d.preview.thumbnailUrl, { headers: h }).then(function(r) {
          if (!r.ok) return;
          return r.blob();
        }).then(function(b) {
          if (b && rbThumb) rbThumb.src = URL.createObjectURL(b);
        }).catch(function() {});
      }
    }
  }).catch(function(e){
    if(el) el.innerHTML = '<div class="error">无法加载预览: ' + esc(e.message||e) + '</div>';
  });
}

function confirmRollback(){
  if(!ROLLBACK_TARGET_ID) return;
  // 预览已判定不可恢复时直接拦截，不发请求——避免 server 抛 "Snapshot is not restorable"
  // 导致 400 错误，用户看到"恢复直接报错"。
  if(ROLLBACK_TARGET_CAN_ROLLBACK === false){
    toast('此版本已被标记为不可恢复，无法回滚','error');
    return;
  }
  // 直接发送 snapshotId（与 server 契约对齐）。之前发 publishId 依赖 server 端
  // publicationHistory.list()+filter 查找 snapshotId——若 history.json 损坏或
  // publicationHistory 未初始化，server 返回 400 "snapshotId required" → "直接报错"。
  // 按钮已改为传 h.snapshotId（见 loadPublishHistory），此处直接转发。
  // server 端 publishId lookup 仍保留作 fallback 兼容旧前端缓存。
  api('/api/admin/rollback',{method:'POST',body:JSON.stringify({snapshotId:ROLLBACK_TARGET_ID})}).then(function(r){
    if(r&&r.status==='ok'||(r&&r.frameId)){
      toast('已回滚','success');
      hide($('rollback-preview'));
      ROLLBACK_TARGET_ID = null;
      ROLLBACK_TARGET_CAN_ROLLBACK = true;
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
    var flEl=setText('status-framelen',d.frameLength!==undefined&&d.frameLength!==null?String(d.frameLength):'暂无','暂无');
    var shaEl=setText('status-sha',d.frameSha256?(d.frameSha256.slice(0,24)+'...'):'暂无','暂无');
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
    // recentError 是 {at,route,message} 对象或 null，直接 textContent 会显示 [object Object]
    var errText='无错误';
    if(d.recentError&&typeof d.recentError==='object'){
      errText=(d.recentError.route||'unknown')+': '+(d.recentError.message||'');
    }
    setText('status-recent-error',errText,'无错误');
    // lastNewsRefreshAt 是 Date.now() 数值（ms 时间戳），需格式化
    var refreshText='暂无';
    if(d.lastNewsRefreshAt){
      if(typeof d.lastNewsRefreshAt==='number'){
        refreshText=new Date(d.lastNewsRefreshAt).toLocaleString('zh-CN');
      }else{
        refreshText=String(d.lastNewsRefreshAt);
      }
    }
    setText('status-last-refresh',refreshText,'暂无');
    var sidebarShaEl=$('sidebar-sha');
    if(sidebarShaEl&&d.buildSha){sidebarShaEl.textContent='SHA: '+d.buildSha.slice(0,12);}
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
    // 同 loadPhotos：撤销旧 Blob URL 避免泄漏
    if (el) el.querySelectorAll('img').forEach(function(img){
      if(img.src && img.src.indexOf('blob:')===0) URL.revokeObjectURL(img.src);
    });
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
      // encodeURIComponent 防止 ID 中特殊字符破坏 URL；
      // TOKEN 模式下裸 <img src> 会 403，必须用 fetch+createObjectURL
      var thumbUrl = '/api/admin/photos/' + encodeURIComponent(p.id) + '/thumbnail?' + Date.now();
      item.innerHTML = '<div class="thumb"><img alt="' + esc(p.title || '') + '" loading="lazy" onerror="this.parentElement.classList.add(\'broken\');this.style.display=\'none\'"></div>' +
        '<div class="info">' +
        '<div class="name">' + esc(p.title || p.id.slice(0,12)) + '</div>' +
        '<div class="meta-row"><span>' + esc(p.source || '未知') + ' · ' + (p.width || 0) + 'x' + (p.height || 0) + '</span></div></div>';
      if (el) el.appendChild(item);
      (function(imgEl,url){
        var h={};
        if(TOKEN)h['Authorization']='Bearer '+TOKEN;
        fetch(url,{headers:h}).then(function(r){
          if(!r.ok)return;
          return r.blob();
        }).then(function(b){
          if(b && imgEl)imgEl.src=URL.createObjectURL(b);
        }).catch(function(){});
      })(item.querySelector('img'),thumbUrl);
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

  // 先把当前内存里的编辑落盘，避免"审查页删了/改了、发布中心还显示旧草稿"。
  // 之前直接读 admin_news_draft.json，若用户在审查页改了没点保存，发布中心看到的是旧内容。
  saveNewsDraft().catch(function(){}).then(function(){
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
