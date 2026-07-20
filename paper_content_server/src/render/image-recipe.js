const fs = require('fs');
const sharp = require('sharp');
const epaperImageFrame = require('../epaper/image-frame');

const FRAME_WIDTH = 800;
const FRAME_HEIGHT = 480;
const DITHERING_ENABLED = true;

function isImageReady(entry) {
  if (!entry || !entry.id || !entry.theme) return false;
  if (!entry.processedPngPath || !fs.existsSync(entry.processedPngPath)) return false;
  if (entry.width !== FRAME_WIDTH || entry.height !== FRAME_HEIGHT) return false;
  return true;
}

function imageToFrameBuffer(raw, width, height, channels) {
  return epaperImageFrame.imageToFrameBuffer(raw, width, height, channels, DITHERING_ENABLED);
}

async function renderSvgToEinkFrame(svgStr) {
  const { data, info } = await sharp(Buffer.from(svgStr))
    .resize(FRAME_WIDTH, FRAME_HEIGHT, { fit: 'fill' })
    .flatten({ background: '#ffffff' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return imageToFrameBuffer(data, info.width, info.height, info.channels);
}

async function renderImageToEinkFrame(imagePath) {
  const { data, info } = await sharp(imagePath)
    .resize(FRAME_WIDTH, FRAME_HEIGHT, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return imageToFrameBuffer(data, info.width, info.height, info.channels);
}

async function renderSvgToPngBuffer(svgStr) {
  return await sharp(Buffer.from(svgStr))
    .resize(FRAME_WIDTH, FRAME_HEIGHT, { fit: 'fill' })
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer();
}

async function renderImageToPngBuffer(imagePath) {
  return await sharp(imagePath)
    .resize(FRAME_WIDTH, FRAME_HEIGHT, { fit: 'fill' })
    .png()
    .toBuffer();
}

module.exports = {
  isImageReady,
  imageToFrameBuffer,
  renderSvgToEinkFrame,
  renderImageToEinkFrame,
  renderSvgToPngBuffer,
  renderImageToPngBuffer,
};
