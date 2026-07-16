const fs = require('fs');
let code = fs.readFileSync('public/admin/admin.css', 'utf8');

code = code.replace(
  /\.news-card-title\{font-weight:600;font-size:16px;margin-bottom:6px;color:#1a1a1a;line-height:1\.4;/g,
  '.news-card-title{font-weight:600;font-size:14px;margin-bottom:6px;color:#1a1a1a;line-height:1.3;'
);

code = code.replace(
  /\.news-card-summary\{font-size:14px;color:#444;line-height:1\.5;/g,
  '.news-card-summary{font-size:12px;color:#444;line-height:1.4;'
);

code = code.replace(
  /\.news-card\{border:1px solid #e0e0e5;border-radius:8px;padding:12px;/g,
  '.news-card{border:1px solid #e0e0e5;border-radius:8px;padding:8px;'
);

fs.writeFileSync('public/admin/admin.css', code);
console.log('patched public/admin/admin.css');
