const assert = require('assert');

const { parseFeedXml } = require('../server');

const fixtures = [
  {
    name: 'NYT',
    feed: {
      id: 'nyt-world',
      source: 'NYT',
      country: 'United States',
      category: 'world',
      language: 'en',
      url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
      weight: 10,
    },
    xml: `
      <rss><channel>
        <item>
          <title>NYT World headline</title>
          <description><![CDATA[NYT world summary]]></description>
          <content:encoded><![CDATA[<p>NYT full content</p>]]></content:encoded>
          <link>https://example.com/nyt-world</link>
          <pubDate>Tue, 08 Jul 2026 01:00:00 GMT</pubDate>
        </item>
      </channel></rss>
    `,
  },
  {
    name: 'France24',
    feed: {
      id: 'france24-en',
      source: 'France 24',
      country: 'France',
      category: 'international',
      language: 'en',
      url: 'https://www.france24.com/en/rss',
      weight: 9,
    },
    xml: `
      <rss><channel>
        <item>
          <title>France 24 headline</title>
          <description>France 24 summary</description>
          <media:content url="https://example.com/image.jpg" medium="image" />
          <link href="https://example.com/france24-story" />
          <pubDate>Tue, 08 Jul 2026 02:00:00 GMT</pubDate>
        </item>
      </channel></rss>
    `,
  },
  {
    name: 'LeMonde',
    feed: {
      id: 'lemonde-economie',
      source: 'Le Monde',
      country: 'France',
      category: 'economy',
      language: 'fr',
      url: 'https://www.lemonde.fr/economie/rss_full.xml',
      weight: 10,
    },
    xml: `
      <rss><channel>
        <item>
          <title><![CDATA[Le Monde titre]]></title>
          <description><![CDATA[Le Monde résumé]]></description>
          <content:encoded><![CDATA[<div>Le Monde contenu complet</div>]]></content:encoded>
          <link>https://example.com/lemonde</link>
          <pubDate>Tue, 08 Jul 2026 03:00:00 GMT</pubDate>
        </item>
      </channel></rss>
    `,
  },
  {
    name: 'NPR',
    feed: {
      id: 'npr-world',
      source: 'NPR',
      country: 'United States',
      category: 'world',
      language: 'en',
      url: 'https://feeds.npr.org/1004/rss.xml',
      weight: 9,
    },
    xml: `
      <rss><channel>
        <item>
          <title>NPR headline</title>
          <description>NPR summary</description>
          <link>https://example.com/npr-story</link>
          <pubDate>Tue, 08 Jul 2026 04:00:00 GMT</pubDate>
        </item>
      </channel></rss>
    `,
  },
];

const failures = [];

for (const fixture of fixtures) {
  const items = parseFeedXml(fixture.xml, fixture.feed);
  const first = items[0];
  try {
    assert.ok(first, `${fixture.name}: no items parsed`);
    assert.ok(String(first.title || '').trim(), `${fixture.name}: title is empty`);
    assert.ok(String(first.summary || '').trim(), `${fixture.name}: summary is empty`);
    console.log(`${fixture.name}: ok title=${JSON.stringify(first.title)} summary=${JSON.stringify(first.summary)}`);
  } catch (error) {
    failures.push(error.message);
    console.error(`${fixture.name}: ${error.message}`);
  }
}

if (failures.length) {
  process.exitCode = 1;
  throw new Error(failures.join('; '));
}

console.log('RSS self-test passed');