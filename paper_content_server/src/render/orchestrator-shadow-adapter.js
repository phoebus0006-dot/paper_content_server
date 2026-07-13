// orchestrator-shadow-adapter.js — Orchestrator shadow pipeline (new renderers)
//
// This is the NEW rendering approach used as the production side in the
// meaningful render shadow. It delegates to the high-level layout renderers
// (analysis-card-renderer + comparison-pair-renderer + sequence-2x2-renderer),
// which rasterize real text via text-rasterizer and images via
// image-rasterizer, then encode a real EPF1 frame. This is a genuinely
// different implementation from the legacy shadow adapter (color blocks only,
// no text).
//
// Input:  (normalizedContent, profileId, clock)
// Output: { frame, frameId, layoutType }  (frame is a real EPF1 Buffer)
var { createAnalysisCardRenderer } = require('./analysis-card-renderer');
var { createComparisonPairRenderer } = require('./comparison-pair-renderer');
var { createSequence2x2Renderer } = require('./sequence-2x2-renderer');

// Layout selection mirrors the legacy shadow adapter so both sides agree on
// the layout type for the same input. The order matches compose-services.js
// renderWithLayouts: analysis -> comparison -> sequence.
function detectLayoutType(content) {
  if (!content) return null;
  if (content.title && (content.dataPoints || content.items)) return 'analysis_card';
  if (Array.isArray(content.items) && content.items.length >= 4) return 'sequence_2x2';
  if (Array.isArray(content.items) && content.items.length >= 2) return 'comparison_pair';
  return null;
}

function createOrchestratorShadowAdapter() {
  var analysisRenderer = createAnalysisCardRenderer();
  var comparisonRenderer = createComparisonPairRenderer();
  var sequenceRenderer = createSequence2x2Renderer();

  function selectRenderer(layoutType) {
    if (layoutType === 'analysis_card') return analysisRenderer;
    if (layoutType === 'comparison_pair') return comparisonRenderer;
    if (layoutType === 'sequence_2x2') return sequenceRenderer;
    return null;
  }

  return {
    // Identifies the module so tests can verify legacy and orchestrator come
    // from genuinely different modules (IMPLEMENTATIONS_DIFFERENT).
    name: 'orchestrator-shadow-adapter',
    source: 'orchestrator-shadow-adapter.js',
    render: function (normalizedContent, profileId, clock) {
      var layoutType = detectLayoutType(normalizedContent);
      if (!layoutType) return Promise.resolve(null);
      var renderer = selectRenderer(layoutType);
      if (!renderer) return Promise.resolve(null);
      return renderer.render(normalizedContent, profileId, clock).then(function (result) {
        if (!result) return null;
        // Normalize the renderer output to the shadow contract:
        // { frame, frameId, layoutType }.
        return {
          frame: result.frame,
          frameId: result.frameId,
          layoutType: layoutType,
        };
      });
    },
  };
}

module.exports = {
  createOrchestratorShadowAdapter: createOrchestratorShadowAdapter,
  detectLayoutType: detectLayoutType,
};
