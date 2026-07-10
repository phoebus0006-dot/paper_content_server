# Domain Model

## OperatingMode
```
AUTO                — Follow schedule
ONE_SHOT_OVERRIDE   — Manual content, revert at next HH:00/HH:30
FOCUS_LOCK          — Manual content locked, schedule paused
```

## Publication
```
{
  id: string,
  mode: OperatingMode,
  snapshotId: string,
  frameId: string,
  contentHash: string,
  contentType: 'news' | 'photo',
  publishedAt: ISO8601,
  expiresAt: ISO8601 | null,
  rolledBackAt: ISO8601 | null,
  rolledBackTo: string | null
}
```

## Snapshot
```
{
  snapshotId: string,
  frameId: string,
  mode: 'news' | 'photo',
  slotKey: string,
  contentHash: string,
  createdAt: ISO8601,
  validUntil: ISO8601 | null
}
```

## RawArticle (pre-translation)
```
{
  articleId: string,
  feedId: string,
  source: string,
  language: string,
  canonicalUrl: string,
  originalTitle: string,
  originalSummary: string,
  publishedAt: ISO8601,
  category: string
}
```

## TranslatedArticle
```
{
  ...RawArticle,
  literalTitleZh: string,
  literalSummaryZh: string,
  translationProvider: string,
  translationModel: string,
  promptVersion: string,
  translationStatus: 'original' | 'translated' | 'cached' | 'failed' | 'disabled',
  verification: TranslationVerification
}
```

## DisplayArticle
```
{
  ...TranslatedArticle,
  finalTitle: string,
  finalSummary: string,
  layout: CardLayout,
  qualityStatus: 'pass' | 'soft_pass' | 'reject',
  productionEligible: boolean
}
```

## LibraryAsset
```
{
  assetId: string,
  libraryType: 'learning' | 'custom',
  kind: 'film_still' | 'storyboard' | 'sequence_frame',
  sourceType: string,
  sourceName: string,
  sourceUrl: string,
  author: string,
  license: string,
  rightsStatus: string,
  theme: string,
  lessonTags: string[],
  analysisNote: string,
  studySetId: string | null,
  pairRole: 'storyboard' | 'final_shot' | null,
  sequenceId: string | null,
  sequenceIndex: number | null,
  safetyStatus: 'safe' | 'unsafe' | 'suspicious' | 'uncertain',
  relevanceStatus: 'pass' | 'reject' | 'uncertain' | null,
  contentHash: string,
  processedPngPath: string,
  epfPath: string
}
```

## SafetyTombstone
```
{
  contentHash: string,
  decision: 'safe' | 'suspicious' | 'unsafe' | 'uncertain',
  reasonCode: string,
  deletedAt: ISO8601,
  imageBytesRemoved: true
}
```

## Sequence
```
{
  sequenceId: string,
  frames: [{ assetId: string, index: number }],
  source: string,
  createdAt: ISO8601
}
```

## StudySet
```
{
  studySetId: string,
  title: string,
  pairs: [{ storyboardAssetId: string, finalShotAssetId: string }],
  sequences: [Sequence]
}
```
