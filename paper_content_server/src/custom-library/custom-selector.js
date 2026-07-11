// custom-selector.js — Select custom assets
function createCustomSelector(assetRepository) {
  function selectCandidates() { return assetRepository.list({ libraryType: 'CUSTOM', safetyStatus: 'SAFE', lifecycleStatus: 'SELECTABLE' }); }
  return { selectCandidates: selectCandidates };
}
module.exports = { createCustomSelector: createCustomSelector };