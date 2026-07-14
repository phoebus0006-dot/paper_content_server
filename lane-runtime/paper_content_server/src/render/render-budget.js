// render-budget.js — Render time/memory budget tracking
function createBudget() {
  var start = Date.now();
  return { elapsed: function() { return Date.now() - start; }, check: function(maxMs) { return Date.now() - start <= maxMs; } };
}
module.exports = { createBudget: createBudget };
