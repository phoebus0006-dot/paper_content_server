#!/bin/bash
set -e
echo "---BACKUP---"
docker exec paper-content-staging cp /app/data/image_index.json /app/data/image_index.json.before-cleanup.$(date +%s)
echo "---CLEAN---"
docker exec paper-content-staging python3 - <<'PYEOF'
import json
INDEX_FILE = "/app/data/image_index.json"
with open(INDEX_FILE, "r", encoding="utf-8") as f:
    items = json.load(f)
REMOVE_IDS = {"c7a7d3bc2f605fb97c4f6996287b3b4e212f8038", "ff717e65ebe3afe94d930b7619d64bde5ed4277e", "9b15f27efc2e40e0ad4a5e18db750959132e6840", "ad478211f7d863e781269c6f254718a15c1e91c7"}
REMOVE_TITLES_LOWER = {"hyatt regency embarcadero atrium, san francisco, us.jpg", "male/femboy leafeon ai anime feet pics [feetgen.com collection]", "portrait studio rental", "kasberger opening"}
kept = []
removed = []
for item in items:
    item_id = item.get("id", "")
    title = item.get("title", "")
    title_lower = title.lower().strip()
    if item_id in REMOVE_IDS or title_lower in REMOVE_TITLES_LOWER:
        removed.append({"id": item_id[:12], "title": title, "source": item.get("source",""), "status": item.get("safetyStatus","")})
    else:
        kept.append(item)
with open(INDEX_FILE, "w", encoding="utf-8") as f:
    json.dump(kept, f, ensure_ascii=False, indent=2)
print("removed_count=" + str(len(removed)))
print("kept_count=" + str(len(kept)))
print("---REMOVED---")
for r in removed:
    print("  - id=" + r["id"] + " title=" + r["title"] + " source=" + r["source"] + " status=" + r["status"])
print("---KEPT---")
for k in kept:
    print("  + id=" + k.get("id","")[:12] + " title=" + k.get("title","") + " source=" + k.get("source","") + " status=" + k.get("safetyStatus",""))
PYEOF
echo "---DONE---"
