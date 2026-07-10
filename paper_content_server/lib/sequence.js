/**
 * Sort sequence frames by sequenceIndex within their sequenceId groups.
 * Entries without sequenceIndex or sequenceId are returned unsorted at the end.
 */
function sortSequenceFrames(entries) {
  var hasSequence = [];
  var noSequence = [];

  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    var meta = e.metadata || {};
    if (meta.sequenceId && meta.sequenceIndex !== undefined && meta.sequenceIndex !== null) {
      hasSequence.push(e);
    } else {
      noSequence.push(e);
    }
  }

  // Group by sequenceId
  var groups = {};
  for (var j = 0; j < hasSequence.length; j++) {
    var e2 = hasSequence[j];
    var sid = e2.metadata.sequenceId;
    if (!groups[sid]) groups[sid] = [];
    groups[sid].push(e2);
  }

  // Sort each group by sequenceIndex
  var sorted = [];
  var groupKeys = Object.keys(groups);
  for (var k = 0; k < groupKeys.length; k++) {
    var group = groups[groupKeys[k]];
    group.sort(function(a, b) {
      return (a.metadata.sequenceIndex || 0) - (b.metadata.sequenceIndex || 0);
    });
    sorted = sorted.concat(group);
  }

  return sorted.concat(noSequence);
}

module.exports = { sortSequenceFrames };