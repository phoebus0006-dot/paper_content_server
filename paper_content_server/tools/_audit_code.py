import re, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER_PATH = os.path.join(ROOT, 'server.js')

with open(SERVER_PATH, 'r', encoding='utf-8') as f:
    lines = f.readlines()
    content = ''.join(lines)

print('=== BASIC METRICS ===')
print('Total lines: ' + str(len(lines)))
print('Total chars: ' + str(len(content)))

# Function definitions
funcs = re.findall(r'^(async\s+)?function\s+(\w+)\s*\(', content, re.MULTILINE)
print('\n=== TOP-LEVEL FUNCTIONS ===')
for pre, name in funcs:
    print('  ' + (pre or '').strip() + ' ' + name + '()')

# Module-level mutable state (let/var outside functions)
# Find all const/let/var at module level (not inside functions)
module_vars = []
for i, line in enumerate(lines):
    stripped = line.strip()
    if re.match(r'^(?:const|let|var)\s+(\w+)\s*=', stripped) and not stripped.startswith('//'):
        module_vars.append((i+1, stripped))
print('\n=== MODULE-LEVEL DECLARATIONS ===')
for ln, line in module_vars:
    print('  L' + str(ln) + ': ' + line[:100])

# The runtime object
print('\n=== RUNTIME OBJECT KEYS ===')
# Find the runtime object definition
rt_match = re.search(r'(?:const|let|var)\s+runtime\s*=\s*\{([^}]+)\}', content)
if rt_match:
    for key in re.findall(r'(\w+)\s*:', rt_match.group(1)):
        print('  runtime.' + key)

# Environment variables
env_vars = set(re.findall(r"process\.env\.(\w+)", content))
print('\n=== ENVIRONMENT VARIABLES ===')
for e in sorted(env_vars):
    print('  ' + e)

# JSON state files
state_files = set()
for m in re.finditer(r"['\"]([\w/]+\.json)['\"]", content):
    path = m.group(1)
    if 'node_modules' not in path:
        state_files.add(path)
print('\n=== JSON STATE FILES ===')
for f in sorted(state_files):
    print('  ' + f)

# API routes
routes = set()
for m in re.finditer(r"parsed\.pathname\s*===?\s*['\"](/[^'\"]+)['\"]", content):
    routes.add(m.group(1))
print('\n=== API ROUTES ===')
for r in sorted(routes):
    print('  ' + r)

# Test scripts
test_dir = os.path.join(ROOT, 'scripts')
test_files = sorted([f for f in os.listdir(test_dir) if f.endswith('.js') and not f.startswith('_')])
print('\n=== TEST SCRIPTS ===')
for f in test_files:
    print('  ' + f)

print('\n=== JSON WRITE LOCATIONS ===')
for i, line in enumerate(lines):
    if 'writeJson' in line or 'writeFileSync' in line:
        print('  L' + str(i+1) + ': ' + line.strip()[:120])
