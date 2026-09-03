# Authenticated Shell, Home and Project Parity Implementation Plan

> **Scope:** This batch implements the current authenticated LibTV desktop shell, home discovery surface and project list at the canonical `1440×900` viewport. It preserves the existing local-only API and workflow behavior. Canvas, storyboard and video-editor parity continue in later plans.

**Goal:** Replace the generic NovaVideo landing/project chrome with the observed LibTV information hierarchy and interaction model: campaign strip, collapsible global sidebar, account action rail, creation shortcuts, recent projects, compact Agent composer, TV Show feed and the four-column project manager.

**Architecture:** Page components consume a typed `GET /api/home` BFF contract and the existing project endpoints. Static catalogue data lives in `src/mocks`, never inside UI components. Shared chrome owns sidebar collapse state and route highlighting. Official public imagery is copied to `public/fixtures/libtv` and recorded in a provenance manifest. Existing workflow APIs and URLs remain compatible.

**Technology:** Next.js 15 App Router, React 19, TypeScript strict mode, Tailwind CSS v4, Zod, existing typed API client, Vitest and Playwright.

**Primary evidence:**

- `docs/research/libtv/pages/home/screenshots/home-authenticated-desktop-1440x900-2026-09-03.png`
- `docs/research/libtv/pages/home/screenshots/project-authenticated-desktop-1440x900-2026-09-03.png`
- `docs/research/libtv/pages/home/screenshots/project-sidebar-collapsed-desktop-1440x900-2026-09-03.png`
- `docs/research/libtv/api/captures/2026-09-03-home-refresh.md`
- `docs/research/libtv/api/captures/2026-09-03-project-list.md`

---

## Invariants

- [x] No runtime URL points at `liblib.tv`, `liblib.art` or `liblib.cloud`; every rendered image is local.
- [x] Components do not import fixture arrays directly; the API route is the boundary.
- [x] Existing project create/folder/delete tests keep their stable test IDs and semantics.
- [x] Sidebar collapse is keyboard reachable, persists in `localStorage`, and reflows rather than overlays content.
- [x] Authenticated shell is dark and scoped; canvas token migration is not smuggled into this batch.
- [x] Every new local route is in `LOCAL_API_ROUTES` and `docs/api/openapi.yaml`.
- [x] The user-owned untracked `.gitignore` is not staged or edited.

---

## Task 1: Freeze Current Evidence and Local Public Assets

**Files:**

- Modify: `docs/research/libtv/pages/home/README.md`
- Create: `docs/research/libtv/assets/MANIFEST.json`
- Create: `docs/research/libtv/pages/home/screenshots/*-2026-09-03.png`
- Create: `public/fixtures/libtv/home/theatre-banner.webp`
- Create: `public/fixtures/libtv/showcase/*.webp`

- [x] **Step 1: Save the three complete 1440×900 website states**

Capture authenticated home, expanded project page and collapsed project sidebar without exposing auth values.

- [x] **Step 2: Export only public page assets**

Copy the observed campaign banner and six public TV Show covers; do not copy private project media.

- [x] **Step 3: Record provenance and dimensions**

Every manifest item records stable local path, source URL, dimensions, source surface, purpose, capture date and evidence level.

- [x] **Step 4: Verify files**

Run:

```bash
sips -g pixelWidth -g pixelHeight docs/research/libtv/pages/home/screenshots/*2026-09-03.png
sips -g pixelWidth -g pixelHeight public/fixtures/libtv/home/*.webp public/fixtures/libtv/showcase/*.webp
```

Expected: screenshots are `1440×900`; banner is `4000×500`; showcase covers are approximately `900×506`.

- [x] **Step 5: Commit evidence**

```bash
git add docs/research/libtv/pages/home docs/research/libtv/assets public/fixtures/libtv
git commit -m "docs: freeze current LibTV home and project baselines"
```

---

## Task 2: Typed Home Discovery Contract and Mock API

**Files:**

- Create: `src/contracts/home.ts`
- Create: `src/contracts/__tests__/home.test.ts`
- Create: `src/mocks/home.ts`
- Create: `src/app/api/home/route.ts`
- Create: `src/app/api/home/route.test.ts`
- Modify: `src/api/client.ts`
- Modify: `src/contracts/route-manifest.ts`
- Modify: `docs/api/openapi.yaml`
- Modify: `docs/api/README.md`

**Contract:**

```ts
type HomeDiscoveryResponse = {
  campaign: { id: string; message: string; cta: string; imageUrl: string }
  account: { credits: number; unreadCount: number; membershipLabel: string }
  creatorTools: Array<{
    id: string
    title: string
    badge: string | null
    description: string
    intent: 'blank' | 'video-model' | 'director' | 'frame-analysis' | 'segment-remake'
  }>
  recentProjects: Array<{ id: string; name: string; coverUrl: string | null; updatedAt: string }>
  featuredSkills: Array<{ id: string; name: string; summary: string; coverUrl: string }>
  showcase: Array<{
    id: string
    title: string
    author: string
    authorTier: string | null
    coverUrl: string
    likeCount: number
    processAvailable: boolean
    category: string
  }>
  showcaseCategories: string[]
}
```

- [x] **Step 1: Write failing schema and route tests**

Assert local-only URLs, unique IDs, fixed ordering, exactly six creator tools, at least six showcase cards and three recent projects in `authenticated-populated`.

- [x] **Step 2: Run and verify RED**

```bash
pnpm vitest run src/contracts/__tests__/home.test.ts src/app/api/home/route.test.ts
```

Expected: FAIL because contract/route do not exist.

- [x] **Step 3: Implement catalogue and route**

The route reads project state, takes the three newest projects and combines them with deterministic campaign/tool/Skill/showcase catalogues. It returns partial-safe data: an empty projects collection does not remove creator tools or public showcase.

- [x] **Step 4: Add typed client endpoint**

Expose `client.home.get()` and decode every response with `HomeDiscoveryResponseSchema`.

- [x] **Step 5: Register and document the route**

Add `GET /api/home`, operationId `getHomeDiscovery`, tag `Projects`, UI triggers `登录态首页初始化`, and scenarios `anonymous`, `authenticated-empty`, `authenticated-populated`.

- [x] **Step 6: Run contract gate**

```bash
pnpm vitest run src/contracts/__tests__/home.test.ts src/app/api/home/route.test.ts src/contracts/__tests__/openapi.test.ts src/api/__tests__/client.test.ts
pnpm typecheck
pnpm lint
```

- [x] **Step 7: Commit contract**

```bash
git add src/contracts src/mocks/home.ts src/app/api/home src/api/client.ts docs/api
git commit -m "feat: add typed home discovery mock API"
```

---

## Task 3: Populate the Authenticated Scenario for Desktop Parity

**Files:**

- Modify: `src/mocks/scenarios/video-project.ts`
- Modify: `src/mocks/__tests__/scenarios.test.ts`
- Modify: `src/app/api/home/route.test.ts`
- Modify: `src/app/api/dev/scenario/route.test.ts`

- [x] **Step 1: Write failing scenario expectations**

`authenticated-populated` must contain three root projects ordered by update time. Every project has one valid canvas; all cover URLs are local fixture paths.

- [x] **Step 2: Run and verify RED**

```bash
pnpm vitest run src/mocks/__tests__/scenarios.test.ts
```

- [x] **Step 3: Add two lightweight projects and canvases**

Use stable IDs and fixed timestamps. Keep the canonical full video project's ID and workflow graph unchanged while aligning its surface name, cover and date to the captured list; the additional two canvases use empty documents and exist only to make recent/all-project surfaces realistic and navigable.

- [x] **Step 4: Verify graph references and deterministic snapshots**

```bash
pnpm vitest run src/mocks/__tests__/scenarios.test.ts src/server/__tests__/scenario-store.test.ts
```

- [x] **Step 5: Commit fixtures**

```bash
git add src/mocks
git commit -m "feat: seed populated LibTV project fixtures"
```

---

## Task 4: Shared Authenticated Desktop Chrome

**Files:**

- Create: `src/components/shell/LibTvLogo.tsx`
- Create: `src/components/shell/PromoStrip.tsx`
- Create: `src/components/shell/AppSidebar.tsx`
- Create: `src/components/shell/AccountRail.tsx`
- Create: `src/components/shell/AuthenticatedShell.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/components/home/HomePage.tsx`
- Modify: `src/components/project/ProjectListPage.tsx`
- Create: `e2e/home-project.spec.ts`

**Layout tokens:**

```css
--libtv-bg: #111111;
--libtv-panel: #181818;
--libtv-panel-raised: #232323;
--libtv-border: rgba(255,255,255,.09);
--libtv-text: rgba(255,255,255,.92);
--libtv-muted: rgba(255,255,255,.52);
--libtv-cyan: #60c9ef;
--libtv-sidebar-expanded: 232px;
--libtv-sidebar-collapsed: 68px;
--libtv-promo-height: 56px;
```

- [x] **Step 1: Add shell interaction E2E in failing form**

Assert active nav, collapse from 232px to 68px, content reflow, persistence after reload, and keyboard focus.

- [x] **Step 2: Implement semantic shell**

Use `aside`, `nav`, `header`, `main`; links navigate and buttons act. Persist only a boolean key `libtv.sidebar.collapsed`. Respect reduced motion.

- [x] **Step 3: Add exact global controls**

Expanded sidebar: logo/toggle, cyan new-project action, 首页/项目/LibTV Agent/创作者挑战赛, bottom promo and help. Account rail: Blender 插件, 积分超市, membership, credits and avatar placeholder.

- [x] **Step 4: Verify shell tests and accessibility**

Run the focused Playwright file and assert the toggle has an accessible name in both states.

- [x] **Step 5: Commit shell**

```bash
git add src/components/shell src/app/globals.css e2e/home-project.spec.ts
git commit -m "feat: replicate LibTV authenticated desktop shell"
```

---

## Task 5: Rebuild the Authenticated Home Surface

**Files:**

- Replace: `src/components/home/HomePage.tsx`
- Create: `src/components/home/CreatorToolGrid.tsx`
- Create: `src/components/home/HomeAgentComposer.tsx`
- Create: `src/components/home/RecentProjects.tsx`
- Create: `src/components/home/TvShowFeed.tsx`
- Modify: `e2e/home-project.spec.ts`

- [x] **Step 1: Write failing home hierarchy tests**

Assert campaign image, blank-canvas card, six creator tools, three recent projects, disabled empty composer send, valid-draft send, Skill chips, TV Show categories and six local cover images.

- [x] **Step 2: Run and verify RED**

```bash
pnpm playwright test e2e/home-project.spec.ts --grep "home"
```

- [x] **Step 3: Implement the first 900px viewport**

At expanded 1440×900: main x≈240; content x≈280; banner x≈280/y≈114/w≈1120/h≈140; tool grid begins y≈278; recent project heading/card row follows; compact Agent composer begins near y≈660; TV Show heading enters near the lower fold.

- [x] **Step 4: Preserve creation semantics**

Blank card creates a project. Tool cards create a project with deterministic intent in the `brief` query. Composer sends only valid trimmed text. Recent project opens existing canvas. Skill chip updates composer context without generating immediately.

- [x] **Step 5: Implement public discovery below the fold**

Category strip and search filter the fixed feed client-side; cards show local cover, title, author/tier, like count and a process button state.

- [x] **Step 6: Run focused E2E and capture local screenshot**

```bash
pnpm playwright test e2e/home-project.spec.ts --grep "home"
```

Save `docs/screenshots/libtv-home-local-1440x900.png` for side-by-side inspection.

- [x] **Step 7: Commit home**

```bash
git add src/components/home e2e/home-project.spec.ts docs/screenshots/libtv-home-local-1440x900.png
git commit -m "feat: replicate LibTV authenticated home"
```

---

## Task 6: Rebuild the Project Manager Surface

**Files:**

- Modify: `src/components/project/ProjectListPage.tsx`
- Create: `src/components/project/ProjectToolbar.tsx`
- Create: `src/components/project/ProjectCard.tsx`
- Create: `src/components/project/RecycleBinDialog.tsx`
- Modify: `e2e/home-project.spec.ts`
- Modify: `e2e/workflow.spec.ts`
- Modify: `src/components/shell/AppSidebar.tsx`
- Modify: `src/components/shell/AuthenticatedShell.tsx`
- Modify: `src/mocks/scenarios/video-project.ts`

- [x] **Step 1: Write failing project layout and interaction tests**

Assert exact toolbar order, four cards at desktop, search filtering, recycle-bin empty dialog, immediate unnamed folder creation, project/folder menus and sidebar collapse without breaking content.

- [x] **Step 2: Run and verify RED**

```bash
pnpm playwright test e2e/home-project.spec.ts --grep "project"
```

- [x] **Step 3: Implement dark four-column manager**

Keep create tile first. At expanded 1440px use 212px cards and 16px gaps inside a content area beginning near x=280. Cover height is about 120px; title/date sit below. Empty folder/project states retain the same grid.

- [x] **Step 4: Implement toolbar behavior**

Search filters without a network round trip. Recycle bin opens a deterministic empty dialog. New folder keeps the observed immediate-create behavior. Return navigates home.

- [x] **Step 5: Preserve destructive and rename flows**

Retain all existing stable test IDs and exact-name folder delete confirmation. Menus use dark tokens and remain anchored to the trigger.

- [x] **Step 6: Run both new and legacy E2E**

```bash
pnpm playwright test e2e/home-project.spec.ts
pnpm playwright test e2e/workflow.spec.ts --grep "project list"
```

- [x] **Step 7: Commit project UI**

```bash
git add src/components/project e2e docs/screenshots/libtv-project-local-1440x900.png
git commit -m "feat: replicate LibTV project manager"
```

---

## Task 7: Visual and Full Verification Gate

**Files:**

- Modify: `e2e/home-project.spec.ts`
- Create: `docs/research/libtv/visual/home-project-comparison.md`
- Modify: `docs/research/libtv/FEATURE_MATRIX.md`

- [x] **Step 1: Add bounding-box assertions from official evidence**

Use tolerances rather than hard-coded pixels for dynamic text: sidebar ±2px, banner ±4px, content origin ±4px, creator grid and project grid ±8px.

- [x] **Step 2: Inspect official/local screenshots side by side**

Record remaining differences in layout, typography, color, crop, state or interaction. Fix all high-salience differences in this batch; defer only canvas/video-specific gaps.

- [x] **Step 3: Run the full gate**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm e2e
```

Expected: every command exits 0; only the intentionally opt-in production suite is skipped.

- [x] **Step 4: Check remote dependency and placeholder drift**

```bash
grep -RInE 'https?://(www\.)?liblib|liblib\.cloud|liblib\.art' src public || true
grep -RInE 'TODO|TBD|placeholder' src/components/home src/components/project src/components/shell || true
git diff --check
```

- [x] **Step 5: Commit verification record**

```bash
git add docs/research/libtv/visual docs/research/libtv/FEATURE_MATRIX.md e2e/home-project.spec.ts
git commit -m "test: verify LibTV home and project parity"
```

---

## Completion Boundary

Completing this plan proves the shared authenticated shell, home and project manager at the desktop baseline. It does **not** complete the overall replica goal. The next plan begins from the authenticated canvas screenshot and covers dark workspace chrome, exact node cards, add-node/resources menus, canvas controls and shared workflow/storyboard layout before the dedicated Video vertical slice.
