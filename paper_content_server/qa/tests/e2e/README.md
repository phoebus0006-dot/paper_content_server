# E2E Tests

E2E tests require:
1. A running server instance (real server.js with R1 bootstrap)
2. Playwright browser automation
3. Isolated data directory

Setup:
```
# Start test server
DATA_DIR=./qa/runtime/$(uuidgen)/data node server.js --port 0
```

Test targets:
- 1280x800, 1440x900, 1920x1080 resolutions
- Real HTTP requests to server endpoints
- Playwright page screenshots and DOM assertions

Coming in next iteration.
