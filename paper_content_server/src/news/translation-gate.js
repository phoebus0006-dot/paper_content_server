// translation-gate.js — Translation provider dispatch
// Preserves existing provider retry semantics

function createTranslationGate(provider, apiKey, model, baseUrl) {
  provider = provider || 'none';
  var warned = false;
  var logger = { warn: function(m) { if (typeof console !== 'undefined' && !warned) { console.warn('[translation-gate] ' + m); warned = true; } } };

  function translate(text, targetLang) {
    if (!text || provider === 'none') return Promise.resolve(null);
    // 当前实现是 stub：未集成任何真实 provider（openai/google/deepl）。
    // 之前静默返回 null，运维无法从日志感知翻译失效。现在加 warn（只打一次）。
    logger.warn('translation provider "' + provider + '" not implemented (stub returns null); news will fall back to original text');
    return Promise.resolve(null);
  }

  return { translate: translate, provider: provider };
}
module.exports = { createTranslationGate };