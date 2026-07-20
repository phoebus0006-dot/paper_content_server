const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'qa', 'tests', 'integration');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));

for (const file of files) {
  const p = path.join(dir, file);
  let content = fs.readFileSync(p, 'utf8');
  
  // Prepend node:test require
  content = `const test = require('node:test');\nconst assert = require('node:assert');\n` + content;
  
  // Replace t(n, ok, d)
  content = content.replace(/function t\(n, ok, d\) \{[^}]+\}/, `
function t(n, ok, d) {
  assert.ok(ok, n + (d ? ': ' + d : ''));
  if (ok) pass++; else { ec = 1; fail++; }
}`);

  // Replace main().catch... with test wrapper
  content = content.replace(/main\(\)\.catch\(function\s*\(e\)\s*\{\s*console\.log\([^}]+\}\);/g, '');
  
  content += `\ntest('${file}', async () => { await main(); });\n`;

  fs.writeFileSync(p, content);
}
console.log('Patched integration tests.');
