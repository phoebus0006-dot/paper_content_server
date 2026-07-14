#!/bin/bash
set -e
echo "---BACKUP---"
docker exec paper-content-staging cp /app/data/image_index.json /app/data/image_index.json.before-cleanup.$(date +%s)
echo "---CLEAN---"
docker exec paper-content-staging node -e '
const fs = require("fs");
const INDEX_FILE = "/app/data/image_index.json";
const items = JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
const REMOVE_IDS = new Set(["c7a7d3bc2f605fb97c4f6996287b3b4e212f8038", "ff717e65ebe3afe94d930b7619d64bde5ed4277e", "9b15f27efc2e40e0ad4a5e18db750959132e6840", "ad478211f7d863e781269c6f254718a15c1e91c7"]);
const REMOVE_TITLES = new Set(["hyatt regency embarcadero atrium, san francisco, us.jpg", "male/femboy leafeon ai anime feet pics [feetgen.com collection]", "portrait studio rental", "kasberger opening"]);
const kept = [];
const removed = [];
for (const item of items) {
  const id = item.id || "";
  const title = (item.title || "").toLowerCase().trim();
  if (REMOVE_IDS.has(id) || REMOVE_TITLES.has(title)) {
    removed.push({id: id.slice(0,12), title: item.title, source: item.source||"", status: item.safetyStatus||""});
  } else {
    kept.push(item);
  }
}
fs.writeFileSync(INDEX_FILE, JSON.stringify(kept, null, 2), "utf8");
console.log("removed_count=" + removed.length);
console.log("kept_count=" + kept.length);
console.log("---REMOVED---");
removed.forEach(r => console.log("  - id=" + r.id + " title=" + r.title + " source=" + r.source + " status=" + r.status));
console.log("---KEPT---");
kept.forEach(k => console.log("  + id=" + (k.id||"").slice(0,12) + " title=" + (k.title||"") + " source=" + (k.source||"") + " status=" + (k.safetyStatus||"")));
'
echo "---DONE---"
