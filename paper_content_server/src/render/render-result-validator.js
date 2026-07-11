// render-result-validator.js — Validate render result frame integrity
var C = { TOTAL_BYTES: 192010, MAGIC: 'EPF1', WIDTH: 800, HEIGHT: 480, PANEL: 49, VERSION: 1 };
function validate(result) {
  if (!result || !result.frame) return { ok: false, errors: ['No frame'] };
  var errors = [];
  if (result.frame.length !== C.TOTAL_BYTES) errors.push('Length: ' + result.frame.length + ' != ' + C.TOTAL_BYTES);
  var magic = result.frame.slice(0, 4).toString('ascii');
  if (magic !== C.MAGIC) errors.push('Magic: ' + magic);
  return { ok: errors.length === 0, errors: errors };
}
module.exports = { validate: validate };
