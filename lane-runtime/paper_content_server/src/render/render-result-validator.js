// render-result-validator.js — Uses R2 validateFrameBuffer for complete validation
var path = require('path');
var { validateFrameBuffer } = require(path.join(__dirname, '..', 'epaper', 'frame-validator'));

function validate(result) {
  if (!result || !result.frame) return { ok: false, errors: ['No frame'] };
  var v = validateFrameBuffer(result.frame);
  return { ok: v.ok, errors: v.errors, header: v.header, invalidCodeCount: v.invalidCodeCount, code4Count: v.code4Count };
}
module.exports = { validate: validate };
