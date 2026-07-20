const fs = require('fs');
const path = require('path');
const file = process.argv[2];
const reason = process.argv[3];
const scopeFile = path.join(__dirname, '../../audit/change-scope.json');
const scope = JSON.parse(fs.readFileSync(scopeFile, 'utf8'));
if (!scope.find(s => s.path === file)) {
  scope.push({
    path: file,
    issueIds: ["PUB-01", "PUB-02", "MODE-01", "IMG-01", "IMG-02", "NEWS-01", "UI-01"],
    functions: ["all"],
    reason: reason,
    reproduction: "audit/problem-reproductions.json"
  });
  fs.writeFileSync(scopeFile, JSON.stringify(scope, null, 2));
}
