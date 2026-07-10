# Test Strategy

## Test Levels

| Level | Location | Purpose |
|-------|----------|---------|
| Unit | test/unit/ | Isolated function tests |
| Integration | test/integration/ | Module interaction with real I/O |
| Contract | test/contracts/ | Frozen production behavior |
| Production Smoke | Manual/Docker | Live deployment health check |
| ESP32 Real Device | Physical | Hardware + firmware verification |

## Test Runner

Standard: `node --test` (Node.js built-in)
Legacy scripts in `scripts/` kept as wrappers during migration.

**npm scripts:**
- `npm test` — Run all tests
- `npm run test:unit`
- `npm run test:integration`
- `npm run test:contract`
- `npm run test:all`

## Rules

- Tests must call production functions, not reimplement them.
- No `test(true)`, `ok(true)`, `every(() => true)`, or `return true`.
- No toy SVGs substituting for production renderer output.
- No JavaScript simulations substituting for ESP32 runtime tests.
- Mocks allowed: external HTTP transport, time, filesystem root.
- Mocks prohibited: production pipeline, selector, layout, renderer, frame encoder.
- ESP32 runtime tests require physical device with serial logs.
