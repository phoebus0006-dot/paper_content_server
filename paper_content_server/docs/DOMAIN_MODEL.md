# 领域模型

## 1. OperatingMode

```text
AUTO
ONE_SHOT_OVERRIDE
FOCUS_LOCK
```

## 2. Publication

```json
{
  "publicationId": "string",
  "contentType": "news|photo|analysis|comparison|sequence",
  "frameId": "string",
  "contentHash": "string",
  "activationMode": "schedule|one_shot|focus_lock",
  "createdAt": "ISO-8601",
  "expiresAt": "ISO-8601|null"
}
```

## 3. Snapshot

```json
{
  "snapshotId": "string",
  "frameId": "string",
  "mode": "news|photo|analysis|comparison|sequence",
  "contentRef": "string",
  "contentHash": "string",
  "createdAt": "ISO-8601",
  "validUntil": "ISO-8601|null"
}
```

## 4. RawArticle

```json
{
  "articleId": "string",
  "feedId": "string",
  "source": "string",
  "language": "string",
  "canonicalUrl": "string",
  "originalTitle": "string",
  "originalSummary": "string",
  "publishedAt": "string"
}
```

## 5. TranslatedArticle

```json
{
  "literalTitleZh": "string",
  "literalSummaryZh": "string",
  "provider": "string",
  "model": "string",
  "promptVersion": "string",
  "verification": {
    "faithful": true,
    "subjectPreserved": true,
    "actionPreserved": true,
    "negationPreserved": true,
    "numbersPreserved": true,
    "entitiesPreserved": true,
    "unsupportedClaims": [],
    "missingFacts": [],
    "issues": []
  }
}
```

## 6. DisplayArticle

```json
{
  "finalTitle": "string",
  "finalSummary": "string",
  "layout": {
    "titleLines": 1,
    "summaryLines": 2,
    "overflow": false
  },
  "qualityStatus": "pass",
  "productionEligible": true
}
```

## 7. LibraryAsset

```json
{
  "assetId": "string",
  "libraryType": "learning|custom",
  "kind": "film_still|storyboard|sequence_frame",
  "sourceType": "string",
  "sourceUrl": "string|null",
  "rights": {
    "author": "string|null",
    "license": "string|null",
    "licenseUrl": "string|null",
    "usageTerms": "string|null"
  },
  "theme": "string|null",
  "lessonTags": [],
  "analysisNote": "string",
  "studySetId": "string|null",
  "pairRole": "storyboard|final_shot|null",
  "sequenceId": "string|null",
  "sequenceIndex": "number|null",
  "safetyStatus": "safe|suspicious|unsafe|uncertain",
  "relevanceStatus": "pass|reject|uncertain",
  "technicalQualityStatus": "pass|reject|unknown",
  "productionEligible": false,
  "eligibilityReason": [],
  "contentHash": "string"
}
```

## 8. Learning Library Eligibility

必须同时：

```text
libraryType=learning
safetyStatus=safe
relevanceStatus=pass
technicalQualityStatus=pass
productionEligible=true
```

## 9. Custom Library Eligibility

必须：

```text
libraryType=custom
safetyStatus=safe
productionEligible=true
within explicit selected scope
```

## 10. SafetyTombstone

```json
{
  "assetId": "string",
  "contentHash": "string",
  "source": "string",
  "decision": "unsafe|suspicious|uncertain",
  "reasonCode": "string",
  "deletedAt": "ISO-8601"
}
```

不得保留图片字节。
