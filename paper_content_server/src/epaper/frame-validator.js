// frame-validator.js — Legacy wrapper delegating to authoritative epf1-contract.js
var epf1Contract = require('../publication/epf1-contract');

function validateFrameBuffer(buffer) {
  return epf1Contract.validateEpf1Frame(buffer);
}

module.exports = {
  validateFrameBuffer: validateFrameBuffer,
};
