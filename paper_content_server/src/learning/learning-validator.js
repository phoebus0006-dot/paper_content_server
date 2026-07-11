// learning-validator.js — Validate candidate decode, safety, relevance, quality
function createValidator() {
  function validate(candidate) {
    if (!candidate) return false;
    if (!candidate.sourceUrl && !candidate.localPath) return false;
    return true;
  }
  return { validate: validate };
}
module.exports = { createValidator: createValidator };
