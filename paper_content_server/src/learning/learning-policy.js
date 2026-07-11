// learning-policy.js — Policy rules for learning candidates
function createPolicy(config) {
  config = config || {};
  var allowedLicenses = config.allowedLicenses || ['CC0','CC-BY','CC-BY-SA','PUBLIC_DOMAIN'];
  function isAllowed(candidate) {
    if (candidate.rightsStatus === 'RESTRICTED') return false;
    if (candidate.license && allowedLicenses.indexOf(candidate.license) < 0) return false;
    return true;
  }
  return { isAllowed: isAllowed, allowedLicenses: allowedLicenses };
}
module.exports = { createPolicy: createPolicy };
