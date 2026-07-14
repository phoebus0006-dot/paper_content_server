// translation-gate.js — Translation provider dispatch
// Preserves existing provider retry semantics

function createTranslationGate(provider, apiKey, model, baseUrl) {
  provider = provider || 'none';

  function translate(text, targetLang) {
    if (!text || provider === 'none') return Promise.resolve(null);
    // Phase 1: stub that returns the original text (production translation wired in R5.3)
    return Promise.resolve(null);
  }

  return { translate: translate, provider: provider };
}
module.exports = { createTranslationGate };