# 需求追踪矩阵

| Requirement | Target Module | Automated Test | Production Verification | ESP32/User Verification | Status |
|---|---|---|---|---|---|
| MQTT immediate refresh | mqtt/ | mqtt contract | broker + HTTP smoke | required | Planned |
| 60s polling fallback | firmware + mqtt/ | broker offline test | broker unavailable smoke | required | Existing/Verify |
| Night image hold | schedule/ | schedule contract | state slot check | optional | Existing/Verify |
| AUTO | operating-mode | mode contract | live state | required | Planned |
| ONE_SHOT expiry | operating-mode | boundary test | live publish | required | Planned |
| FOCUS_LOCK | operating-mode | lock test | admin live | required | Planned |
| Learning auto fetch | library/learning | adapter test | live candidate smoke | visual review | Planned |
| Learning rights gate | library/learning | rights test | candidate audit | review | Planned |
| Learning relevance gate | library/learning | relevance test | production audit | visual review | Planned |
| Learning rotation | library/learning | rotation contract | multi-slot test | visual review | Planned |
| Custom upload | library/custom | upload integration | NAS upload smoke | required | Planned |
| Learning source selection | library/shared | selector contract | state test | required | Planned |
| Custom source selection | library/shared | selector contract | state test | required | Planned |
| No cross-library fallback | library/shared | isolation test | live smoke | required | Planned |
| Strict NSFW delete | safety/ | deletion contract | file/reference audit | required | Planned |
| Single render | render/ | renderer test | preview smoke | required | Planned |
| Analysis card | render/ | renderer test | preview smoke | required | Planned |
| Comparison pair | render/ | pair integrity test | preview smoke | required | Planned |
| 2x2 sequence | render/ | ordering test | preview smoke | required | Planned |
| 6 unique news | news/ | news contract | /api/news.json | required | Planned |
| Translation fidelity | news/translation | fidelity test | original-final audit | user sample review | Planned |
| Title one line | render/news-layout | layout contract | debug layout | required | Planned |
| Summary 2-3 lines | render/news-layout | layout contract | debug layout | required | Planned |
| Last-good | news/last-good | fallback contract | feed failure smoke | optional | Planned |
| EPF1 | epaper/ | frame contract | frame smoke | required | Existing/Verify |
| State-frame coherence | snapshot/ | coherence contract | HTTP smoke | required | Existing/Verify |
