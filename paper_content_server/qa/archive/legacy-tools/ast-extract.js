const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generator = require('@babel/generator').default;

const serverPath = path.join(__dirname, 'server.js');
const purePath = path.join(__dirname, 'src/app/pure-logic.js');

const code = fs.readFileSync(serverPath, 'utf8');

const ast = parser.parse(code, { sourceType: 'module' });

const fnsToExtract = [
  'getWallTime', 'dateFromWallTime', 'getTimeZoneOffsetMinutes', 'computeNextSwitchAt', 
  'computeNextHalfHourBoundary', 'resolveAllowedImagePath', 'isImageReady', 
  'isImageApproved', 'isStudySelectable', 'getImageKind', 'groupImagesByKindAndTheme', 'groupImagesByTheme',
  'updateLibraryStateForPhoto', 'selectStudyPhoto', 'selectPhotoSnapshot', 'selectNewsItems',
  'sha1', 'formatDateKey', 'formatDateParts',  'themePoolFromIndex', 'themePoolFromKind', 'filterRecentImages',
  'sortByLastShown', 'filterByRotation', 'isRecentlyShown', 'normalizeText', 'categoryForRotation', 'categoryPriority', 'canonicalUrl', 'titleHash'
];

const constantsToExtract = [
  'FRAME_WIDTH', 'FRAME_HEIGHT', 'TIMEZONE', 'NEWS_REFRESH_MINUTES', 'NEWS_MAX_ITEMS', 'NEWS_SHOWN_RECALL_HOURS', 'NEWS_SHOWN_FALLBACK_HOURS', 'NEWS_MIN_ITEMS',
  'SHOT_STORYBOARD_PATTERN', 'PHOTO_THEME_POOL', 'DEFAULT_PANEL', 'PANEL_SIZES'
];

let extractedCode = `const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT_DIR = path.join(__dirname, '../../..');\n\n`;

let toRemove = [];

traverse(ast, {
  FunctionDeclaration(p) {
    if (fnsToExtract.includes(p.node.id.name)) {
      extractedCode += generator(p.node).code + '\n\n';
      toRemove.push(p);
    }
  },
  VariableDeclaration(p) {
    if (p.node.declarations.length === 1 && constantsToExtract.includes(p.node.declarations[0].id.name)) {
      extractedCode += generator(p.node).code + '\n\n';
      // keep constants in server.js but also in pure-logic
    }
  }
});

for (const p of toRemove) {
  p.remove();
}

let newServerCode = generator(ast).code;

const reqStr = `const { ${fnsToExtract.join(', ')} } = require('./src/app/pure-logic.js');\n`;
newServerCode = reqStr + newServerCode;

extractedCode += `module.exports = { ${fnsToExtract.join(', ')}, ${constantsToExtract.join(', ')} };\n`;

if (!fs.existsSync(path.join(__dirname, 'src/app'))) fs.mkdirSync(path.join(__dirname, 'src/app'), { recursive: true });
fs.writeFileSync(purePath, extractedCode);
fs.writeFileSync(serverPath, newServerCode);

console.log('AST Extraction Complete');
