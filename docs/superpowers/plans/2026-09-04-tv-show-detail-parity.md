# TV Show Detail and Player Parity Implementation Plan

> **For agentic workers:** REQUIRED: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing `/showcase/[snapshotId]` read-only canvas view into the documented LibTV TV Show detail → immersive player → public production-process flow, backed entirely by deterministic local fixtures and typed API contracts.

**Architecture:** Keep `PublishedSnapshot` as the immutable public workflow/document boundary. Introduce a separate versioned `ShowcaseEntry` discovery projection that links to exactly one snapshot and owns public metadata, media variants, interaction counts and related-entry order. The detail shell owns ephemeral viewing state (player controls, like gate, quality menu and process overlay); it never mutates the snapshot or pretends an anonymous user cloned a project.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.9, Zod 3, Tailwind CSS 4, Vitest 3, Playwright 1.56, OpenAPI 3.1.

---

## Evidence and invariants

Primary UI evidence is `docs/research/libtv/pages/showcase/README.md` and its listed screenshots. Preserve these invariants:

- `/showcase` remains anonymous-readable; category search is explicit-submit and unmatched search returns a recommendation fallback.
- A detail page shows media as an immersive backdrop, author/tier/title/update/AI marker, watch/process/like/share actions and a related-work rail.
- Like opens a local login gate in-place; the entry context and intended action remain available after closing the gate.
- Player loops, exposes play/pause, scrub, time, 1×→1.5×→2× speed, quality, volume/mute and browser fullscreen; no remote media is requested.
- `查看制作过程` overlays the same frozen `PublishedSnapshot` in read-only Workflow/Storyboard mode; clone remains an anonymous login gate.
- All catalog/playback identity and media URLs are sanitized local fixture data. `PublishedSnapshot.document` does not gain view counts, likes or player state.

## File structure

| File | Responsibility |
| --- | --- |
| `src/domain/showcase.ts` | Versioned public entry and local-player types; pure normalization, quality/speed transitions and related-entry selection. |
| `src/domain/__tests__/showcase.test.ts` | Pure fixtures, fallback, player-control and snapshot-link invariants. |
| `src/contracts/showcase.ts` | Strict Zod list/detail/interaction contracts, inferred local API types. |
| `src/contracts/__tests__/showcase-examples.test.ts` | Executable API examples and malformed-input rejection. |
| `src/mocks/showcase.ts` | Frozen metadata plus repository media/cover variants and a snapshot link for every public entry. |
| `src/server/showcase.ts` | Read-only catalogue/detail projection and idempotent local interaction state. |
| `src/app/api/showcase/route.ts` | Typed catalogue list endpoint. |
| `src/app/api/showcase/[entryId]/route.ts` | Typed entry detail endpoint. |
| `src/app/api/showcase/[entryId]/interactions/route.ts` | Login-gated local like/share feedback endpoint; anonymous response does not mutate state. |
| `src/components/showcase/ShowcaseGallery.tsx` | Consume typed catalogue entries instead of deriving authors/categories from snapshot counts. |
| `src/components/showcase/ShowcaseDetail.tsx` | Detail shell, related rail, login intent gate and process overlay orchestration. |
| `src/components/showcase/ShowcasePlayer.tsx` | Accessible local player control bar and media state machine. |
| `src/components/showcase/PublicCanvasView.tsx` | Add overlay/embedded mode while retaining its independently accessible route behavior. |
| `src/app/showcase/[snapshotId]/page.tsx` | Resolve public entry id and mount the detail route without exposing a canvas id. |
| `docs/api/SHOWCASE.md` | Backend handoff: entity boundary, player state, interaction/auth behavior and endpoint-to-UI table. |
| `docs/api/examples/showcase-*.json` | Sanitized deterministic request/response examples. |
| `docs/api/openapi.yaml`, `docs/api/README.md`, `src/contracts/route-manifest.ts` | OpenAPI operations, examples and UI-trigger mapping. |
| `e2e/showcase-detail.spec.ts` | Keyboard/player/process/login-gate journeys and 1440×900 visual assertions. |
| `e2e/showcase-detail.spec.ts-snapshots/` | Detail, player, quality and process overlay visual baselines. |
| `docs/visual/showcase-detail-comparison.md` | Official/local geometry, states and intentional fixture-only differences. |

## Chunk 1: Canonical discovery contract

### Task 1: Define public entry and player domain types

**Files:**
- Create: `src/domain/showcase.ts`
- Create: `src/domain/__tests__/showcase.test.ts`

- [ ] **Step 1: Write failing domain tests** for a fully populated entry, immutable snapshot link, category/query fallback, related entries excluding current id, speed cycle and quality fallback.
- [ ] **Step 2: Run** `pnpm vitest run src/domain/__tests__/showcase.test.ts`; expect missing-module failure.
- [ ] **Step 3: Implement** `ShowcaseEntry`, `ShowcaseMediaVariant`, `ShowcaseInteractionState`, `filterShowcaseEntries`, `nextPlaybackRate`, `resolveQuality`, `relatedShowcaseEntries` and defensive reader functions.
- [ ] **Step 4: Run the focused suite**; expect pass with no remote URL accepted.
- [ ] **Step 5: Commit** `feat: define showcase detail domain`.

### Task 2: Add strict runtime contracts and fixtures

**Files:**
- Create: `src/contracts/showcase.ts`
- Create: `src/contracts/__tests__/showcase-examples.test.ts`
- Create: `src/mocks/showcase.ts`
- Create: `docs/api/examples/showcase-list.response.json`
- Create: `docs/api/examples/showcase-detail.response.json`
- Create: `docs/api/examples/showcase-interaction.request.json`
- Create: `docs/api/examples/showcase-interaction.unauthenticated.json`

- [ ] **Step 1: Write failing example tests** that parse every example and reject HTTP media URLs, unknown qualities, an absent snapshot id and unbounded related lists.
- [ ] **Step 2: Implement Zod schemas** with local `/fixtures/` media URL constraint, fixed quality values and explicit anonymous interaction result.
- [ ] **Step 3: Build fixtures** with at least four entries across documented categories, all linked to public snapshots and all variants deterministic/repository-local.
- [ ] **Step 4: Run contract/domain suites** and inspect fixture ids for only local placeholder values.
- [ ] **Step 5: Commit** `feat: add showcase fixture contracts`.

## Chunk 2: Local API and catalogue adoption

### Task 3: Serve separate catalogue/detail projections

**Files:**
- Create: `src/server/showcase.ts`
- Create: `src/server/__tests__/showcase.test.ts`
- Create: `src/app/api/showcase/route.ts`
- Create: `src/app/api/showcase/[entryId]/route.ts`
- Create: `src/app/api/showcase/[entryId]/interactions/route.ts`

- [ ] **Step 1: Write failing server tests** for category list, query fallback, unknown entry 404, immutable snapshot association, anonymous like gate and idempotent authenticated fixture like.
- [ ] **Step 2: Implement a fixture-backed repository** without adding entry metadata to `WorkspaceState` or `PublishedSnapshot.document`.
- [ ] **Step 3: Implement route handlers** using schemas for every input/output and consistent 400/401/404/422 JSON errors.
- [ ] **Step 4: Run** `pnpm vitest run src/server/__tests__/showcase.test.ts src/contracts/__tests__/showcase-examples.test.ts`.
- [ ] **Step 5: Commit** `feat: serve local showcase detail api`.

### Task 4: Migrate the TV Show catalogue to typed entries

**Files:**
- Modify: `src/components/showcase/ShowcaseGallery.tsx`
- Modify: `src/components/showcase/__tests__/showcase-surfaces.test.ts`
- Modify: `e2e/public-discovery.spec.ts`

- [ ] **Step 1: Add a failing UI/API test** proving the gallery renders author, tier, category and count from API entries rather than `SnapshotSummary` heuristics.
- [ ] **Step 2: Replace only the catalogue fetch/projection seam**; retain the dark shell, explicit submit search and fallback already accepted in `df17a48`.
- [ ] **Step 3: Verify card navigation uses public `entryId` while the immutable snapshot id remains internal to detail/process views.**
- [ ] **Step 4: Run public discovery E2E** with isolated `DATA_DIR`; restore unrelated screenshots.
- [ ] **Step 5: Commit** `refactor: source tv show catalogue from local api`.

## Chunk 3: Detail, player and process overlay

### Task 5: Build the accessible TV Show detail shell

**Files:**
- Create: `src/components/showcase/ShowcaseDetail.tsx`
- Modify: `src/app/showcase/[snapshotId]/page.tsx`
- Modify: `src/components/showcase/__tests__/showcase-surfaces.test.ts`

- [ ] **Step 1: Add failing component/E2E expectations** for immersive poster, title/author/tier/update/AI marker, watch/process/like/share actions and related rail.
- [ ] **Step 2: Implement detail loading/error/stale states** with a single local entry fetch and focus-safe return to catalogue.
- [ ] **Step 3: Implement the like intent gate**: anonymous click opens the existing local login dialog, preserves entry/action intent and never changes counts.
- [ ] **Step 4: Add related-item navigation** without resetting current anonymous interaction intent until navigation completes.
- [ ] **Step 5: Run focused tests and commit** `feat: add immersive showcase detail`.

### Task 6: Implement deterministic player controls

**Files:**
- Create: `src/components/showcase/ShowcasePlayer.tsx`
- Create: `src/components/showcase/__tests__/ShowcasePlayer.test.tsx`
- Modify: `src/components/showcase/ShowcaseDetail.tsx`

- [ ] **Step 1: Write failing unit tests** for loading/ready/error, loop, play/pause, scrubbing, 1×/1.5×/2× cycle, quality menu, mute restore and fullscreen unavailable state.
- [ ] **Step 2: Implement HTMLMediaElement adapter guards** so JSDOM and media-unavailable fixtures never throw; load local asset URLs only.
- [ ] **Step 3: Render controls with semantic labels, slider keyboard support and live time/status feedback.**
- [ ] **Step 4: Implement Fullscreen API feature detection** and preserve the existing in-page player when unavailable.
- [ ] **Step 5: Run focused tests and commit** `feat: add local showcase player controls`.

### Task 7: Open public production process over the detail

**Files:**
- Modify: `src/components/showcase/PublicCanvasView.tsx`
- Modify: `src/components/showcase/ShowcaseDetail.tsx`
- Modify: `src/components/showcase/__tests__/showcase-surfaces.test.ts`

- [ ] **Step 1: Add failing E2E**: process opens a full-screen read-only Workflow overlay, switches to Storyboard, closes with Escape and returns focus to its detail action.
- [ ] **Step 2: Add `embedded`/overlay composition mode** to `PublicCanvasView`; preserve standalone `/showcase/{snapshotId}` behavior for old shared URLs.
- [ ] **Step 3: Keep clone as a login gate**; overlay never mounts editable `CanvasWorkspace` or mutating controls.
- [ ] **Step 4: Add unavailable snapshot retry flow** that leaves the detail visible and actionable.
- [ ] **Step 5: Run focused tests and commit** `feat: embed readonly production process`.

## Chunk 4: OpenAPI and evidence

### Task 8: Publish API and visual proof

**Files:**
- Create: `docs/api/SHOWCASE.md`
- Modify: `docs/api/openapi.yaml`
- Modify: `docs/api/README.md`
- Modify: `src/contracts/route-manifest.ts`
- Create: `e2e/showcase-detail.spec.ts`
- Create: `e2e/showcase-detail.spec.ts-snapshots/*.png`
- Create: `docs/visual/showcase-detail-comparison.md`
- Modify: `docs/research/libtv/visual/2026-09-04-public-discovery-fidelity-audit.md`

- [ ] **Step 1: Write OpenAPI parity tests** for catalogue/detail/interaction operations, schemas, 200/401/404/422 responses and all JSON examples.
- [ ] **Step 2: Document** immutable snapshot versus discovery entry boundaries, anonymous/authenticated interaction behavior and every player state.
- [ ] **Step 3: Add four 1440×900 Playwright baselines**: detail, player controls, quality menu and read-only process overlay. Mask only video frame time/caret regions.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm lint && pnpm test && pnpm build` plus isolated `e2e/public-discovery.spec.ts` and `e2e/showcase-detail.spec.ts`.
- [ ] **Step 5: Restore generated `next-env.d.ts`, `tsconfig.json`, unrelated screenshots and leave user-owned `.gitignore` untracked.**
- [ ] **Step 6: Commit** `test: verify tv show detail parity` and update the fidelity audit only with proven local states.
