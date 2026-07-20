const fs = require('fs');
let p = fs.readFileSync('src/app/pure-logic.js', 'utf8');
p = 'let runtime = { libraryState: {} };\nfunction setRuntime(r) { runtime = r; }\n' + p;
p = p.replace('module.exports = {', 'module.exports = { setRuntime,');
fs.writeFileSync('src/app/pure-logic.js', p);

let s = fs.readFileSync('server.js', 'utf8');
s = s.replace(/const \{.*?\} = require\('\.\/src\/app\/pure-logic\.js'\);/, 
  "const pureLogic = require('./src/app/pure-logic.js');\nconst { setRuntime, getWallTime, dateFromWallTime, getTimeZoneOffsetMinutes, computeNextSwitchAt, computeNextHalfHourBoundary, resolveAllowedImagePath, isImageReady, isImageApproved, isStudySelectable, getImageKind, groupImagesByKindAndTheme, groupImagesByTheme, updateLibraryStateForPhoto, selectStudyPhoto, selectPhotoSnapshot, selectNewsItems, sha1, formatDateKey, formatDateParts, themePoolFromIndex, themePoolFromKind, filterRecentImages, sortByLastShown, filterByRotation, isRecentlyShown, normalizeText, categoryForRotation, categoryPriority, canonicalUrl, titleHash } = pureLogic;");
s = s.replace(/const runtime = \{[\s\S]*?\n\};\n/, function(match) { return match + 'setRuntime(runtime);\n'; });
fs.writeFileSync('server.js', s);
