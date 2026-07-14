const sharp = require('sharp');

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="white"/></svg>';

sharp(Buffer.from(svg))
  .resize(4, 4, { fit: 'fill' })
  .flatten({ background: '#ffffff' })
  .raw()
  .toBuffer({ resolveWithObject: true })
  .then(({ data, info }) => {
    console.log('sharp raw info:', JSON.stringify(info));
    console.log('data length:', data.length);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
