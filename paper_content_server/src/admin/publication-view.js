// publication-view.js — Publication response builder
function buildPublicationView(pub) {
  if (!pub) return null;
  if (pub.integrityError) return { snapshotId: pub.snapshotId, error: pub.error, integrityError: true };
  return { snapshotId: pub.snapshotId, frameId: pub.frameId, contentType: pub.contentType, createdAt: pub.createdAt, frameLength: pub.frameLength, frameSha256: pub.frameSha256 };
}
function buildPublicationList(publications) {
  return (publications || []).map(buildPublicationView);
}
module.exports = { buildPublicationView: buildPublicationView, buildPublicationList: buildPublicationList };
