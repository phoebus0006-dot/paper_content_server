const fs = require('fs');
const p = 'deploy_staging.sh';
if (fs.existsSync(p)) {
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes('ssh -q -o BatchMode=yes')) {
    s = s.replace(/set -euo pipefail\n/, 'set -euo pipefail\n\nif ! ssh -q -o BatchMode=yes -o ConnectTimeout=5 staging_user@staging_host exit; then\n  echo "SSH connection failed"\n  exit 1\nfi\n\n');
    fs.writeFileSync(p, s);
  }
}
