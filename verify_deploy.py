import urllib.request, json
base = 'http://192.168.1.49:18080'
tests = [
    ('/health/live', ['status']),
    ('/health/ready', ['status']),
    ('/api/health.json', ['status','uptimeSeconds','currentMode','frameId','newsItemCount','photoCount']),
    ('/api/admin/dashboard', ['status','currentMode','newsItemCount','manualOverride','lastPublishedAt']),
    ('/api/admin/news', ['selected']),
    ('/api/admin/photos', ['photos']),
    ('/api/admin/publish-history', ['history']),
]
for path, keys in tests:
    try:
        r = urllib.request.urlopen(base + path)
        body = r.read().decode()
        d = json.loads(body)
        missing = [k for k in keys if k not in d]
        if missing:
            print(f'FAIL {path}: missing keys {missing}')
        else:
            print(f'PASS {path}: {200} ' + ' '.join(f'{k}={str(d[k])[:40]}' for k in keys[:3]))
    except Exception as e:
        print(f'FAIL {path}: {e}')
print('---')
r = urllib.request.urlopen(base + '/api/admin/news')
news = json.loads(r.read())
print(f'News count: {len(news.get("selected",[]))}')
if news.get('selected'):
    n = news['selected'][0]
    print(f'First news: title="{n.get("title","?")[:40]}" summary="{n.get("summary","?")[:40]}" source={n.get("source")} translationStatus={n.get("translationStatus")}')
r = urllib.request.urlopen(base + '/api/admin/publish-history')
hist = json.loads(r.read())
print(f'History count: {len(hist.get("history",[]))}')
for h in hist.get('history', [])[:3]:
    print(f'  {h.get("publishedAt","")[:19]} type={h.get("type")} status={h.get("status")}')
print('DONE')
