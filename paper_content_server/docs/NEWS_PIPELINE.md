# News Pipeline

## Process Flow

```
Feed URLs
  ↓
Fetch (HTTP with timeout)
  ↓
Parse (RSS XML / JSON Feed)
  ↓
Normalize (text, strip HTML)
  ↓
Canonicalize (URLs)
  ↓
Pre-Dedup (URL, GUID, title similarity)
  ↓
Translate (faithful literal translation)
  ↓
Fidelity Verification (subject, action, numbers, entities, negation)
  ↓
Chinese Display Editing (concise e-paper version)
  ↓
Layout Fit (1-line title, 2-3 line summary)
  ↓
Final Dedup (URL, article ID, final Chinese title)
  ↓
Quality Gate (semantic completeness, formatting)
  ↓
Select 6 (category round-robin, max 2 per source)
  ↓
Last-Good Update (only if 6 valid, no duplicates, no placeholders)
  ↓
Snapshot + Render
```

## Rules

- Source quota (max 2 per source) applies **after** final dedup.
- Translation pipeline: faithful → verify → edit → layout.
- LLM must not produce the final display text directly.
- Every translated article must pass fidelity verification.
- Last-good is overwritten only by a fully valid 6-item set.
- Cold start with no last-good: show system status page.

## Dedup Layers

| Stage | Checks |
|-------|--------|
| Pre-Dedup | canonical URL, source GUID, normalized title similarity |
| Final Dedup | canonical URL, article identity, normalized original title, normalized final Chinese title |
