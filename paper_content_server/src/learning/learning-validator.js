// learning-validator.js — Full validation gates with reason codes
function createValidator() {
  function validate(candidate) {
    var errors = [], codes = [];
    if (!candidate) return { ok: false, errors: ['Null candidate'], reasonCodes: ['NULL'] };
    if (!candidate.sourceUrl && !candidate.localPath) { errors.push('Missing source'); codes.push('NO_SOURCE'); }
    if (candidate.rightsStatus === 'RESTRICTED') { errors.push('Rights restricted'); codes.push('RIGHTS_REJECTED'); }
    if (candidate.rightsStatus !== undefined && candidate.rightsStatus !== 'APPROVED') { errors.push('Rights: ' + candidate.rightsStatus); codes.push('RIGHTS_REJECTED'); }
    if (candidate.safetyStatus === 'UNSAFE') { errors.push('Safety UNSAFE'); codes.push('SAFETY_REJECTED'); }
    if (candidate.relevanceStatus === 'IRRELEVANT') { errors.push('Irrelevant'); codes.push('RELEVANCE_REJECTED'); }
    if (candidate.qualityStatus === 'REJECTED') { errors.push('Quality rejected'); codes.push('QUALITY_REJECTED'); }
    return { ok: errors.length === 0, errors: errors, reasonCodes: codes };
  }
  return { validate: validate };
}
module.exports = { createValidator: createValidator };
