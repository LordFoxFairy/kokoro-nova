# Canvas, Workflow and Storyboard Parity Implementation Plan

> **Scope:** This batch migrates the existing functional editor to the current authenticated LibTV desktop canvas chrome at the canonical `1440×900` viewport. It covers the shared editor shell, workflow empty/populated states, add-node taxonomy, bottom controls, Agent dock geometry and storyboard column layout. Deep model-specific forms, full clip-editor fidelity and every library catalogue continue in focused follow-up plans.

**Goal:** Preserve the repository's deterministic workflow engine while making the first editor impression, navigation hierarchy and high-frequency interactions visually and behaviorally match the current LibTV site. The result must remain a pure frontend fixture: every project, graph, generation state, asset and API response is local and repeatable.

**Architecture:** `CanvasWorkspace` remains the orchestration boundary and `WorkflowDocument` remains the only editable document. A scoped editor token set turns the existing reusable controls dark without affecting the authenticated home/project shell. `TopBar`, `BottomToolbar`, empty-canvas starters and `StoryboardView` own only presentation and UI state; graph mutations still flow through `editor-store` and the existing mock API. Current LibTV imagery is evidence only unless it is a public asset; runtime fixtures stay local.

**Technology:** Next.js 15 App Router, React 19, TypeScript strict mode, Tailwind CSS v4, React Flow 12, Zustand, Zod, Vitest and Playwright.

**Primary evidence:**

- `docs/research/libtv/pages/canvas/screenshots/canvas-authenticated-current-dark-desktop-1440x900-2026-09-03.png`
- `docs/research/libtv/pages/canvas/screenshots/canvas-add-node-current-dark-desktop-1440x900-2026-09-03.png`
- `docs/research/libtv/pages/canvas/screenshots/storyboard-authenticated-current-dark-desktop-1440x900-2026-09-03.png`
- `docs/research/libtv/pages/canvas/screenshots/new-project-empty-workflow-with-agent.png`
- `docs/research/libtv/pages/canvas/README.md`

---

## Invariants

- [ ] The editor has no runtime dependency on `liblib.tv`, `liblib.art` or `liblib.cloud`.
- [ ] Existing workflow mutations, generation state machine, revision conflict handling, undo/redo and E2E journeys remain unchanged.
- [ ] Workflow and storyboard continue to render the same `WorkflowDocument`; switching views issues no document API write.
- [ ] All interactive icon-only controls have an accessible name and visible hover/focus feedback.
- [ ] Every floating surface remains keyboard dismissible and inside the `1440×900` viewport.
- [ ] Editor tokens are scoped to `[data-app-shell='editor']`; home/project visuals must not regress.
- [ ] The user-owned untracked `.gitignore` is not staged or edited.

---

## Task 1: Freeze Current Dark-Editor Evidence and Repository Map

**Files:**

- Create: `docs/CODEBASE_MAP.md`
- Create: `docs/research/libtv/pages/canvas/screenshots/*current-dark*2026-09-03.png`
- Modify: `docs/research/libtv/pages/canvas/README.md`

- [x] **Step 1: Capture current authenticated workflow at 1440×900**

Record the top chrome, graph surface, node/edge rendering, bottom rail and left status controls without storing session credentials or identifiers in prose.

- [x] **Step 2: Capture add-node and storyboard states**

Freeze the exact current menu order and populated storyboard columns. Keep private IDs out of filenames and documentation.

- [x] **Step 3: Add the compact repository map**

Describe surface entry points, layer boundaries, canvas hot paths and test commands so independent workers share the same architectural context.

- [x] **Step 4: Document observed geometry and taxonomy**

Add a current-dark baseline section to the canvas research README with the `32px` top controls, `48px` bottom rail, left status cluster and menu order:

`文本 / 图片 / 视频 / 智能剪辑 Beta / 导演台 NEW / 逐帧拉片 SD2.5 / 音频 / 脚本 / 素材库`, then `上传 / 从生成历史选择`.

- [x] **Step 5: Commit evidence**

```bash
git add docs/CODEBASE_MAP.md docs/research/libtv/pages/canvas
git commit -m "docs: freeze current LibTV canvas baseline"
```

---

## Task 2: Lock the Editor Shell Contract with Playwright

**Files:**

- Create: `e2e/canvas-parity.spec.ts`

- [ ] **Step 1: Add an empty-canvas geometry test**

Select `authenticated-empty`, create a project, and assert:

- full viewport editor with a dark background;
- top-left project/canvas identity begins at `16px` and is `32px` high;
- compact workflow/storyboard switch sits in the same top row;
- right action rail remains inside the viewport;
- bottom primary rail is `48px` high and horizontally centered;
- left status controls sit within `22px` of the bottom-left edge;
- the four starter actions are visible above the bottom rail.

- [ ] **Step 2: Add add-menu taxonomy and keyboard assertions**

Open from `data-testid=add-node-button`, assert exact primary order and badges, open both submenus, dismiss with `Escape`, and verify focus can return to the trigger.

- [ ] **Step 3: Add storyboard layout assertions**

Use the deterministic populated scenario. Assert dark column surfaces, stable text/image/video ordering, filter/expand actions, fixed clip-editor entry and no document revision change when switching views.

- [ ] **Step 4: Run and confirm RED**

```bash
pnpm playwright test e2e/canvas-parity.spec.ts
```

Expected: shell color, geometry, current menu labels and storyboard surface assertions fail against the light generic editor.

---

## Task 3: Scoped Dark Editor Tokens

**Files:**

- Modify: `src/app/globals.css`

**Observed token target:**

```css
[data-app-shell='editor'] {
  --color-canvas: #141414;
  --color-surface: #242424;
  --color-ink-900: rgba(255,255,255,.92);
  --color-ink-700: rgba(255,255,255,.78);
  --color-ink-500: rgba(255,255,255,.55);
  --color-ink-200: rgba(255,255,255,.14);
  --color-ink-100: rgba(255,255,255,.08);
}
```

- [ ] **Step 1: Introduce editor-only color, border and shadow tokens**

Use neutral charcoal surfaces, fine translucent borders and nearly shadowless floating controls. Do not change the global light fallback or the authenticated discovery-shell variables.

- [ ] **Step 2: Align React Flow canvas primitives**

Use the current dot density/contrast, cool gray edges, dark handles, dark minimap and cyan selection state.

- [ ] **Step 3: Verify home/project isolation**

```bash
pnpm playwright test e2e/home-project.spec.ts
```

- [ ] **Step 4: Commit tokens**

```bash
git add src/app/globals.css e2e/canvas-parity.spec.ts
git commit -m "feat: match LibTV dark editor tokens"
```

---

## Task 4: Current Top Chrome and Canvas Switcher

**Files:**

- Modify: `src/components/canvas/TopBar.tsx`
- Modify: `src/components/shell/LibTvLogo.tsx` if a reusable compact mark is needed
- Modify: `src/components/ui/controls.tsx`
- Modify: `e2e/canvas-parity.spec.ts`

- [ ] **Step 1: Recompose the left identity control**

Use a compact LibTV mark, project name, divider and canvas switcher in one `32px`-high rounded rectangle. Keep existing canvas create/switch/rename/copy/delete behavior.

- [ ] **Step 2: Make the view switch current and accessible**

At desktop width render two adjacent `32×32` icon buttons with `工作流` and `故事板` accessible names/tooltips. Active state uses the raised dark surface; do not expose duplicate visible labels.

- [ ] **Step 3: Add observed right-side hierarchy**

Order the controls as share, points store, membership offer, credit balance, account avatar and Agent. Decorative local fixture actions may toast or route locally; share and Agent retain their real mock behavior.

- [ ] **Step 4: Match switcher menu states**

Keep current-canvas check state, in-place new-canvas naming, disabled last-canvas delete and keyboard dismissal.

- [ ] **Step 5: Run focused tests and commit**

```bash
pnpm playwright test e2e/canvas-parity.spec.ts e2e/workflow.spec.ts --grep "canvas|switch|project"
git add src/components/canvas/TopBar.tsx src/components/ui/controls.tsx e2e/canvas-parity.spec.ts
git commit -m "feat: replicate LibTV canvas top chrome"
```

---

## Task 5: Bottom Rail, Add Taxonomy and Empty Canvas

**Files:**

- Modify: `src/components/canvas/BottomToolbar.tsx`
- Modify: `src/components/canvas/CanvasWorkspace.tsx`
- Modify: `src/domain/nodes.ts`
- Modify: `src/components/canvas/node-visuals.tsx`
- Modify: `e2e/canvas-parity.spec.ts`

- [ ] **Step 1: Match bottom control geometry**

Center one `48px`-high rounded rail. Keep the primary add control distinct, preserve select/hand/toolbox/material/character/history/shortcut/help actions and retain all stable test IDs.

- [ ] **Step 2: Match current add-menu labels and order**

Present the observed taxonomy exactly. Where an existing domain type underlies a renamed current product capability, keep the stable serialized type and map only its product label. Do not introduce a fake mutation path.

- [ ] **Step 3: Preserve add-resource behavior**

`上传` still opens the local asset library and `从生成历史选择` still opens history; menu selection and nested menus remain keyboard operable.

- [ ] **Step 4: Rebuild the empty starter strip**

Place the double-click hint near viewport center and four wide thumbnail-like starter cards immediately above the bottom controls. Reuse local public fixture imagery/gradients only.

- [ ] **Step 5: Run focused tests and commit**

```bash
pnpm playwright test e2e/canvas-parity.spec.ts e2e/workflow.spec.ts --grep "menu|empty|double-click|toolbox"
git add src/components/canvas src/domain/nodes.ts e2e/canvas-parity.spec.ts
git commit -m "feat: replicate LibTV canvas creation rail"
```

---

## Task 6: Workflow Node and Edge Visual Parity

**Files:**

- Modify: `src/components/canvas/NodeCard.tsx`
- Modify: `src/components/canvas/node-visuals.tsx`
- Modify: `src/components/canvas/GroupLayer.tsx`
- Modify: `src/components/canvas/WorkflowCanvas.tsx`
- Modify: `src/app/globals.css`
- Modify: `e2e/canvas-parity.spec.ts`

- [ ] **Step 1: Restyle media nodes at common zoom levels**

Keep titles and dimensions above the media, reduce surrounding card chrome, use charcoal placeholders and keep generated images visually dominant. Text/configuration nodes retain full cards because they need controls.

- [ ] **Step 2: Match handles and edges**

Use `20px` hover handles, thin cool-gray bezier edges and high-contrast selected state. Edge hide/show must remain presentation-only.

- [ ] **Step 3: Match selection, hover and status treatment**

Preserve job labels, progress, generation confirmation and node menus while removing light-theme rings/shadows.

- [ ] **Step 4: Verify graph behavior**

```bash
pnpm playwright test e2e/workflow.spec.ts --grep "graph|connect|groups|double-click"
```

- [ ] **Step 5: Commit workflow visuals**

```bash
git add src/components/canvas src/app/globals.css e2e/canvas-parity.spec.ts
git commit -m "feat: match LibTV dark workflow graph"
```

---

## Task 7: Storyboard Dark Projection and Agent Dock

**Files:**

- Modify: `src/components/storyboard/StoryboardView.tsx`
- Modify: `src/components/storyboard/MediaDetailDrawer.tsx`
- Modify: `src/components/agent/AgentPanel.tsx`
- Modify: `src/components/canvas/CanvasWorkspace.tsx`
- Modify: `e2e/canvas-parity.spec.ts`

- [ ] **Step 1: Match column projection**

Use large dark rounded column surfaces with compact headers, preserve audio/text stacking when both exist, and allow image/video columns to consume remaining width. Pending media and metadata chips use the observed low-contrast hierarchy.

- [ ] **Step 2: Preserve filter and expanded modes**

The video filter remains `全部 / 成片 / 片段`; expanding either media column hides only its sibling content and remains reversible.

- [ ] **Step 3: Match clip-editor entry**

Pin the round `剪辑` action to the lower-right of the visible storyboard, above any Agent dock.

- [ ] **Step 4: Match Agent side dock geometry**

Opening Agent reduces the content viewport rather than obscuring the editor. Preserve current ask-human, context-chip and mutation-confirmation behavior.

- [ ] **Step 5: Run storyboard and Agent tests and commit**

```bash
pnpm playwright test e2e/canvas-parity.spec.ts e2e/workflow.spec.ts --grep "storyboard|agent|reference|clip"
git add src/components/storyboard src/components/agent src/components/canvas/CanvasWorkspace.tsx e2e/canvas-parity.spec.ts
git commit -m "feat: replicate LibTV dark storyboard workspace"
```

---

## Task 8: Baselines, Documentation and Full Gate

**Files:**

- Create: `docs/screenshots/libtv-canvas-empty-local-1440x900.png`
- Create: `docs/screenshots/libtv-canvas-populated-local-1440x900.png`
- Create: `docs/screenshots/libtv-canvas-add-menu-local-1440x900.png`
- Create: `docs/screenshots/libtv-storyboard-local-1440x900.png`
- Create: `docs/research/libtv/visual/canvas-workflow-comparison.md`
- Modify: `docs/research/libtv/FEATURE_MATRIX.md`
- Modify: `docs/api/README.md` only if a UI trigger or contract note changed

- [ ] **Step 1: Capture deterministic local screenshots**

Reset the scenario before every baseline. Do not overwrite unrelated historical E2E evidence.

- [ ] **Step 2: Write the visual delta report**

Compare official/current and local files for shell geometry, node density, typography, colors and interaction states. List remaining intentional deltas as follow-up work rather than calling them parity.

- [ ] **Step 3: Update the feature matrix**

Mark only verified shell/workflow/storyboard rows complete. Keep model-specific forms, libraries and Video editing rows open until their own tests and baselines exist.

- [ ] **Step 4: Run the full quality gate**

```bash
pnpm verify
pnpm e2e
```

Expected: typecheck, zero-warning lint, all Vitest suites, production build and every non-skipped Playwright test pass.

- [ ] **Step 5: Check repository hygiene**

Restore `next-env.d.ts` if a dev run changed it; restore unrelated `docs/screenshots/**`; grep runtime sources for remote LibTV URLs; confirm only `.gitignore` remains user-owned and untracked outside intentional work.

- [ ] **Step 6: Commit verification**

```bash
git add docs/screenshots docs/research/libtv e2e src
git commit -m "test: verify LibTV canvas and storyboard parity"
```

---

## Completion Boundary

This plan completes the current **editor shell, workflow and storyboard layout milestone** only when the full gate and four local visual baselines pass. It does **not** complete the overarching replica goal. The next plans must cover, in order:

1. image/video/audio node model catalogues and dependent parameter states;
2. Script V2 and legacy frame-analysis flows;
3. toolbox, style/effect, character, history and asset-management catalogue parity;
4. generated-media detail tools and complete Video clip-editor/timeline/export behavior;
5. final cross-surface visual diff, accessibility, responsive behavior and API-contract audit.
