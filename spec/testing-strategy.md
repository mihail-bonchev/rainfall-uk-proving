# Testing Strategy — Rainfall Explorer

## Overview

Three testing layers, each with a distinct role and toolchain.

| Layer | Tool | Environment | When to use |
|---|---|---|---|
| Unit | Vitest | Node (jsdom) | Pure functions, services, utilities, hooks |
| Behaviour (component) | Vitest + React Testing Library + MSW | jsdom | User-visible component behaviour, loading/error states |
| Gherkin BDD (E2E) | playwright-bdd + Playwright | Real Chromium | Feature scenarios written in Given/When/Then |
| Plain E2E | Playwright | Real Chromium | Ad-hoc integration checks outside Gherkin |

---

## Commands

```bash
cd frontend

npm run test           # Vitest watch mode (unit + behaviour)
npm run test:run       # Vitest single-pass — use in CI
npm run test:coverage  # v8 coverage; fails if <80% on any metric
npm run test:ui        # Vitest visual browser UI
npm run test:bdd       # Regenerate specs from .feature files + run Gherkin scenarios
npm run test:e2e       # All Playwright projects (BDD + plain specs)
npm run test:e2e:ui    # Playwright interactive UI
```

---

## File Structure

```
frontend/
├── src/
│   ├── lib/
│   │   └── utils.test.ts              ← colocated unit tests
│   ├── services/db/
│   │   └── dbInit.test.ts             ← colocated unit tests
│   ├── App.test.tsx                   ← behaviour tests
│   └── test/
│       ├── setup.ts                   ← global: jest-dom, fake-indexeddb, MSW
│       ├── utils.tsx                  ← renderWithProviders() helper
│       └── msw/
│           ├── handlers.ts            ← EA API mock responses
│           └── server.ts              ← MSW node server
├── e2e/
│   ├── app.spec.ts                    ← plain Playwright specs
│   ├── features/
│   │   ├── app-shell.feature          ← Gherkin scenarios
│   │   └── map-viewport.feature
│   └── steps/
│       └── app-steps.ts              ← Given/When/Then step definitions
├── vitest.config.ts
└── playwright.config.ts
```

---

## Layer 1 — Unit Tests (Vitest)

**Purpose:** Test logic in complete isolation. No DOM, no React, no network.

**When to write one:**
- Any pure function (date utils, CSV parser, aggregation logic, colour scale)
- Any service module that transforms data
- Any IndexedDB store operation

**Conventions:**
- Colocate alongside the file under test: `foo.ts` → `foo.test.ts`
- Use `fake-indexeddb` (registered globally in `setup.ts`) for any IndexedDB code — never mock `openDB`
- Globals (`describe`, `it`, `expect`, `vi`) are available everywhere — no need to import them

**Example:** [src/lib/utils.test.ts](../frontend/src/lib/utils.test.ts)

---

## Layer 2 — Behaviour Tests (Vitest + RTL + MSW)

**Purpose:** Test React components from the user's perspective. Assert what the user sees, not internal state.

**When to write one:**
- Any component with loading/error/empty states
- Any component that fetches data
- Any user interaction (click, type, select)

**Conventions:**
- Wrap components in `renderWithProviders()` (from `src/test/utils.tsx`) — this provides `QueryClientProvider` with `retry: false, gcTime: 0` so tests don't hang
- Add MSW handlers in `src/test/msw/handlers.ts` for the EA API routes your component uses. Override per-test with `server.use(http.get(...))` for error/edge-case scenarios
- Mock MapLibre (and any other WebGL/canvas lib) with `vi.mock('react-map-gl/maplibre', () => ({ default: () => <div data-testid="..." /> }))` — jsdom has no WebGL
- Never assert on implementation details (internal state, class names, refs). Assert on text, roles, and `data-testid` attributes

**Example:** [src/App.test.tsx](../frontend/src/App.test.tsx)

---

## Layer 3 — Gherkin BDD (playwright-bdd)

**Purpose:** Express user-facing features in plain English. Product-readable acceptance criteria that also run as tests.

**Workflow:**
1. Write a `.feature` file in `e2e/features/` using standard Gherkin syntax
2. Add or reuse step definitions in `e2e/steps/`
3. Run `npm run test:bdd` — `bddgen` compiles `.feature` → `.features-gen/*.spec.js`, then Playwright executes them in real Chromium

**When to write a scenario:**
- Every user-facing feature that has an acceptance criterion
- Happy path first, then error/edge-case scenarios as separate `Scenario` blocks

**Conventions:**
- Steps should be declarative ("the map is visible"), not procedural ("click the canvas div")
- Reuse steps across feature files — the step phrase is the API
- Keep `Given` to setup, `When` to action, `Then` to assertion; never assert in `Given`/`When`
- `.features-gen/` is gitignored — it is always regenerated from source

**Example feature:** [e2e/features/app-shell.feature](../frontend/e2e/features/app-shell.feature)
**Example steps:** [e2e/steps/app-steps.ts](../frontend/e2e/steps/app-steps.ts)

---

## MSW — API Mocking

MSW intercepts `fetch` calls at the network level (no module mocking needed). The `setupServer` from `msw/node` is used for both unit and behaviour tests.

**Default handlers** (always active): [src/test/msw/handlers.ts](../frontend/src/test/msw/handlers.ts)
- `GET /id/stations` → returns 1 test station, totalCount 1027

**Per-test overrides:**
```ts
server.use(
  http.get('https://environment.data.gov.uk/...', () => HttpResponse.error()),
)
// server.resetHandlers() is called in afterEach automatically
```

**Adding a new route:** add a handler to `handlers.ts`. The handler is available in every test file without any imports.

---

## Coverage

Vitest collects v8 coverage on `npm run test:coverage`. Thresholds (80% across statements/branches/functions/lines) are enforced — the command exits non-zero if any metric falls below.

Excluded from coverage:
- `src/test/` (test infrastructure)
- `src/main.tsx` (entry point — only wiring)
- `e2e/` (Playwright handled separately)

---

## CI Guidance

Run in this order:

```bash
npm run lint
npm run test:run        # fast — no browser
npm run build
npm run test:bdd        # starts dev server automatically
```

The `webServer` in `playwright.config.ts` starts `npm run dev` before Playwright tests and reuses an existing server if `CI` is not set. In CI, set `CI=true` to always start a fresh server.
