const fs = require('fs');
let code = fs.readFileSync('public/admin/admin.js', 'utf8');

code = code.replace(
  /'<div class="detail-field"><div class="detail-label">显示标题<\/div><div class="detail-value"><input class="news-title" value="'\+esc\(item\.title\|\|''\)\+'" style="width:100%"><\/div><\/div>'\+/,
  `'<div class="detail-field"><div class="detail-label">显示标题</div><div class="detail-value"><input class="news-title" value="'+esc(item.displayTitle||item.zhTitle||item.title||'')+'" style="width:100%"></div></div>'+`
);

code = code.replace(
  /'<div class="detail-field"><div class="detail-label">显示摘要<\/div><div class="detail-value"><textarea class="news-summary" rows="3" style="width:100%">'\+esc\(item\.summary\|\|''\)\+'<\/textarea><\/div><\/div>'\+/,
  `'<div class="detail-field"><div class="detail-label">显示摘要</div><div class="detail-value"><textarea class="news-summary" rows="3" style="width:100%">'+esc(item.displaySummary||item.zhSummary||item.summary||'')+'</textarea></div></div>'+`
);

fs.writeFileSync('public/admin/admin.js', code);
console.log('patched public/admin/admin.js');
