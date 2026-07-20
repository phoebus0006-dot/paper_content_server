#!/usr/bin/env node
var path = require('path');
var ROOT = path.join(__dirname, '..', '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var epaperImageFrame = require(path.join(ROOT, 'src', 'epaper', 'image-frame'));
var epaperFrameValidator = require(path.join(ROOT, 'src', 'epaper', 'frame-validator'));
var serverMod = require(path.join(ROOT, 'server.js'));
var sharp = require('sharp');

async function run() {
  // Generate golden frame using the real production render path
  var now = new Date('2026-07-09T12:00:00Z');
  var content = {
    items: [
      { zhTitle: '测试新闻标题一', zhSummary: '这是第一条测试新闻的摘要内容。', sourceUrl: 'http://a.com/1', source: 'Test', category: 'politics', publishedAt: now.toISOString(), translationStatus: 'original' },
      { zhTitle: '测试新闻标题二', zhSummary: '这是第二条测试新闻的摘要说明。', sourceUrl: 'http://b.com/2', source: 'Test', category: 'economy', publishedAt: now.toISOString(), translationStatus: 'original' },
      { zhTitle: '测试新闻标题三', zhSummary: '这是第三条测试新闻的详细信息。', sourceUrl: 'http://c.com/3', source: 'Test', category: 'tech', publishedAt: now.toISOString(), translationStatus: 'original' },
      { zhTitle: '测试新闻标题四', zhSummary: '这是第四条测试新闻的内容摘要。', sourceUrl: 'http://d.com/4', source: 'Test', category: 'culture', publishedAt: now.toISOString(), translationStatus: 'original' },
      { zhTitle: '测试新闻标题五', zhSummary: '这是第五条测试新闻的简短描述。', sourceUrl: 'http://e.com/5', source: 'Test', category: 'general', publishedAt: now.toISOString(), translationStatus: 'original' },
      { zhTitle: '测试新闻标题六', zhSummary: '这是第六条测试新闻的完整摘要。', sourceUrl: 'http://f.com/6', source: 'Test', category: 'general', publishedAt: now.toISOString(), translationStatus: 'original' },
    ],
    frameId: 'golden:test',
    title: 'TEST',
  };

  try {
    var svg = serverMod.renderNewsSvg(content, now);
    var raw = await sharp(svg)
      .resize(800, 480, { fit: 'fill' })
      .flatten({ background: '#ffffff' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    var frameImage = epaperImageFrame.imageToFrameBuffer(raw.data, raw.info.width, raw.info.height, raw.info.channels, false);
    var frame = epaperImageFrame.buildFrameBuffer(frameImage);

    t('GOLDEN_FRAME_LENGTH', frame.length === 192010, 'len=' + frame.length);
    t('GOLDEN_HAS_EPF1_MAGIC', frame.slice(0, 4).toString() === 'EPF1', frame.slice(0, 4).toString());
    t('GOLDEN_CODE4', frame[9] === 1, 'code4=' + frame[9]);

    // Validate frame buffer
    var validation = epaperFrameValidator.validateFrameBuffer(frame);
    t('GOLDEN_VALIDATION_OK', validation.ok, validation.errors ? validation.errors.join('; ') : '');

    // SHA256 for golden reference
    var crypto = require('crypto');
    var sha256 = crypto.createHash('sha256').update(frame).digest('hex');
    t('GOLDEN_SHA256_LENGTH', sha256.length === 64, sha256.length);
    console.log('Golden SHA256: ' + sha256);
  } catch(e) {
    t('GOLDEN_RENDER', false, e.message);
  }

  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}
run().catch(function(e) { console.log('CRASH: ' + e.message); process.exit(1); });
