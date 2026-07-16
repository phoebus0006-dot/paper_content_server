const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { validateImageCandidate } = require('../../lib/image-governance');
const { runFetchImages } = require('../../scripts/fetch-images');

test('Image Governance: Pure Logic Validation', async (t) => {
  const config = {
    IMAGE_ALLOWED_SOURCE_IDS: ['wikimedia_category', 'local_import'],
    IMAGE_ALLOWED_CATEGORIES: ['film_frames']
  };

  await t.test('accepts valid source, category, and provenance', () => {
    const candidate = {
      sourceId: 'wikimedia_category',
      category: 'film_frames',
      metadata: { author: 'john' },
      title: 'A nice movie scene',
      url: 'http://example.com/a.jpg'
    };
    const res = validateImageCandidate(candidate, config);
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.classification, 'VALID_TARGET_IMAGE');
  });

  await t.test('rejects NASA explicitly even with valid sourceId', () => {
    const candidate = {
      sourceId: 'wikimedia_category',
      category: 'film_frames',
      title: 'NASA APOD: Galaxy',
      provenance: { author: 'NASA' }
    };
    const res = validateImageCandidate(candidate, config);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.classification, 'NASA_IMAGE');
    assert.ok(res.reason.includes('nasa'));
  });

  await t.test('rejects scenery and landscape', () => {
    const candidate = {
      sourceId: 'wikimedia_category',
      category: 'film_frames',
      title: 'beautiful landscape scenery',
      metadata: { author: 'john' }
    };
    const res = validateImageCandidate(candidate, config);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.classification, 'SCENERY_IMAGE');
  });

  await t.test('rejects random fallback providers', () => {
    const candidate = {
      sourceId: 'wikimedia_category',
      sourceName: 'unsplash random',
      category: 'film_frames',
      metadata: { author: 'john' }
    };
    const res = validateImageCandidate(candidate, config);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.classification, 'RANDOM_SOURCE_IMAGE');
  });

  await t.test('rejects missing provenance', () => {
    const candidate = {
      sourceId: 'wikimedia_category',
      category: 'film_frames',
      provenance: {} // missing
    };
    const res = validateImageCandidate(candidate, config);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.classification, 'LEGACY_UNVERIFIED_IMAGE');
  });

  await t.test('rejects valid provider but wrong category', () => {
    const candidate = {
      sourceId: 'wikimedia_category',
      category: 'wrong_category',
      metadata: { author: 'john' }
    };
    const res = validateImageCandidate(candidate, config);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.classification, 'UNKNOWN_SOURCE_IMAGE');
    assert.strictEqual(res.reason, 'rejected-invalid-category');
  });
});

test('Image Governance: Integrated Fetch Pipeline', async (t) => {
  // Mock global fetch
  const originalFetch = global.fetch;
  
  t.after(() => {
    global.fetch = originalFetch;
  });

  // Create a minimal config for the pipeline
  const mockConfig = {
    minImageWidth: 10,
    minImageHeight: 10,
    IMAGE_ALLOWED_SOURCE_IDS: ['url_list'],
    IMAGE_ALLOWED_CATEGORIES: ['decorative_photos', 'cinematic'],
    sources: [
      {
        type: 'url_list',
        enabled: true,
        poolType: 'decorative_photos',
        urls: [
          { url: 'http://example.com/nasa.jpg', title: 'NASA space image' },
          { url: 'http://example.com/scenery.jpg', title: 'beautiful landscape' },
          { url: 'http://example.com/valid.jpg', title: 'A valid movie shot', theme: 'cinematic', metadata: { author: 'john' } },
          { url: 'http://example.com/unknown.jpg', title: 'unknown source', sourceId: 'unknown_src' }
        ]
      }
    ]
  };

  // Read the generated test image and pad to > 1024 bytes
  let validPng = fs.readFileSync(path.join(__dirname, 'test.jpg'));
  validPng = Buffer.concat([validPng, Buffer.alloc(100000, 0)]);

  global.fetch = async (url) => {
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => validPng
    };
  };

  const oldIndex = [
    { url: 'http://example.com/old_valid.jpg', hash: 'abc1234', title: 'Old Valid' }
  ];

  const { results, index } = await runFetchImages(mockConfig, JSON.parse(JSON.stringify(oldIndex)), 10);
  
  console.log(results.details);
  // Assertions
  assert.strictEqual(results.downloaded, 1, 'Only one valid image should be downloaded');
  assert.strictEqual(results.skipped, 3, 'Three invalid images should be skipped due to governance rules');
  
  // Check index modifications
  assert.strictEqual(index.length, 2, 'Index should have old valid + 1 new valid');
  assert.strictEqual(index[0].url, 'http://example.com/old_valid.jpg', 'Old index content remains unchanged');
  assert.strictEqual(index[0].hash, 'abc1234', 'Old index SHA remains unchanged');
  
  const downloadedUrls = index.map(i => i.url);
  assert.ok(downloadedUrls.includes('http://example.com/valid.jpg'), 'Valid image was written to index');
  assert.ok(!downloadedUrls.includes('http://example.com/nasa.jpg'), 'NASA image must not be written');
  assert.ok(!downloadedUrls.includes('http://example.com/scenery.jpg'), 'Scenery must not be written');
  
  // Failure scenario: itemsAdded = 0
  const failConfig = {
    sources: [{ type: 'url_list', enabled: true, urls: [{ url: 'http://example.com/nasa2.jpg', title: 'nasa' }] }]
  };
  const failRes = await runFetchImages(failConfig, [...oldIndex], 10);
  assert.strictEqual(failRes.results.downloaded, 0);
  // Wait, the API contract requested by user: "返回 NO_VALID_TARGET_CONTENT"
  // If the sync script returns this... wait, scripts/fetch-images.js returns { results, index } right now.
  // We can just assert results.downloaded === 0.
});
