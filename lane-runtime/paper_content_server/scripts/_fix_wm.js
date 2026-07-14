const fs = require('fs');
const src = fs.readFileSync(__dirname + '/fetch-images.js', 'utf8');

// Find the problematic Wikimedia section
const idx = src.indexOf('const wmTitle');
if (idx < 0) { console.log('ERROR: wmTitle not found'); process.exit(1); }

// Find the beginning of the line (previous line's newline)
const lineStart = src.lastIndexOf('\n', idx) + 1;
// Find the end of the candidates.push block - look for url/title pattern
const segment = src.slice(idx);
const pushStart = segment.indexOf('candidates.push({');
if (pushStart < 0) { console.log('push not found'); process.exit(1); }
const pushSeg = segment.slice(pushStart);
const titleLineEnd = pushSeg.indexOf('\n', pushSeg.indexOf('title:'));
if (titleLineEnd < 0) { console.log('title eol not found'); process.exit(1); }
const blockEnd = lineStart + pushStart + titleLineEnd + 1;

const replacement = `        const wmTitle = page.title?.replace(/^File:/, '').replace(/_/g, ' ') || query.q;
        if (isLowQualityTitle(wmTitle, imageinfo.url)) continue;
        candidates.push({
          url: imageinfo.url,
          title: wmTitle,`;

const newSrc = src.slice(0, idx - 8) + replacement + src.slice(blockEnd);
if (newSrc === src) { console.log('ERROR: no change - same content'); process.exit(1); }

fs.writeFileSync(__dirname + '/fetch-images.js', newSrc);
console.log('OK - wmTitle fixed');
