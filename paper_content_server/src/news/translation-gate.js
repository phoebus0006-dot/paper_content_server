// translation-gate.js — Translation provider dispatch (read-only adapter)
// Does not change translation rules or provider selection.

function createTranslationGate(provider, apiKey, model, baseUrl) {
  function translate(text, sourceLang, targetLang) {
    if (!text || !provider || provider === 'none') return Promise.resolve(null);
    return Promise.resolve(null);
  }

  return { translate: translate, provider: provider };
}

module.exports = { createTranslationGate };
