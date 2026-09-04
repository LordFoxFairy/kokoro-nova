# Canvas E2E fixture / cold-start audit — 2026-09-04

## Scope

- Audited: `e2e/canvas-parity.spec.ts` and its canvas-opening fixture boundary.
- Excluded: production components, audio, project-management and showcase flows.
- Test server: isolated Next dev process on `127.0.0.1:3247`, with both `NEXT_DIST_DIR` and `DATA_DIR` outside the repository.

## Reproduction finding

The previous helper clicked `start-create`, waited only for a broad
`/canvas?projectId=` URL pattern, then treated the editor shell as ready. That
match did not identify the newly-created project/canvas and could observe a
prior route transition while the server-side mock state or client canvas load
was still settling. Seeded-canvas cases independently navigated without
checking that the requested mock fixture was available first.

A cold isolated boot showed the relevant compilation boundaries: scenario API
(about 4.1s), project page (about 3s), project API (about 2s), then the canvas
API. Test readiness therefore must follow observable state rather than a
longer arbitrary timeout.

## Acceptance boundary now used

1. POST `/api/dev/scenario` must return the requested scenario id and fixture
   counts before any canvas route is opened.
2. New-project flow listens for the successful POST `/api/projects`, derives
   the exact `projectId` and `canvasId` from that response, verifies that exact
   canvas with GET `/api/canvases/:canvasId`, then requires both the exact
   browser identity and visible `workflow-canvas`.
3. Seeded-canvas flow verifies GET `/api/canvases/can_video_main` belongs to
   `prj_video_demo` before navigation, then requires visible editor chrome and
   no `canvas-load-error`.

No per-action timeout was lengthened. The pre-existing visual geometry helper
retains its own 5s visibility assertion because it validates rendered boxes,
not navigation readiness.

## Verification

```sh
pnpm exec playwright test e2e/canvas-parity.spec.ts \
  --config=/tmp/kokoro-canvas-audit.playwright.config.ts
```

Result: **14 passed** on the isolated cold-start server. Playwright recorded
`{ "status": "passed", "failedTests": [] }` in its final run metadata.
