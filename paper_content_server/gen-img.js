const sharp = require('sharp');
const fs = require('fs');

fs.writeFileSync('half.svg', '<svg width="100" height="100"><rect width="50" height="100" fill="black"/></svg>');

sharp({
  create: { width: 100, height: 100, channels: 3, background: 'white' }
})
.composite([{ input: 'half.svg', blend: 'over' }])
.jpeg()
.toFile('test/content-pipeline/test.jpg');
