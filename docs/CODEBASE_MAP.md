# Codebase map

This map is the compact entry point for parallel research and implementation work.  It describes the current frontend fixture repository; `docs/ARCHITECTURE.md` remains the detailed source of truth.

## Product surfaces

| Surface | Route | Main entry | Important collaborators |
| --- | --- | --- | --- |
| Authenticated home | `/` | `src/components/home/HomePage.tsx` | `src/components/shell/*`, `src/mocks/home.ts` |
| Project manager | `/project` | `src/components/project/ProjectListPage.tsx` | project/folder routes, `src/contracts/project.ts` |
| Workflow canvas | `/canvas?projectId=…&canvasId=…` | `src/components/canvas/CanvasWorkspace.tsx` | `WorkflowCanvas.tsx`, `NodeCard.tsx`, `TopBar.tsx`, `BottomToolbar.tsx` |
| Storyboard projection | same canvas route | `src/components/storyboard/StoryboardView.tsx` | `MediaDetailDrawer.tsx`, `ImageToolEditors.tsx`, `ClipEditor.tsx` |
| Agent | home and canvas | `src/components/agent/AgentPanel.tsx` | `src/server/agent.ts`, agent session routes |
| Asset/library tools | canvas | `src/components/canvas/LibraryPanels.tsx` | `AssetSidebar.tsx`, `src/components/assets/*` |
| Director studio | canvas modal | `src/components/director/DirectorStudio.tsx` | `scene.ts` |
| Script workflow | canvas modal | `src/components/script/ScriptWizard.tsx` | `script-model.ts` |
| Skills | `/skills`, `/skills/[skillId]` | `src/components/skills/*` | `src/server/skills.ts` |
| Public showcase | `/showcase`, `/showcase/[snapshotId]` | `src/components/showcase/*` | `src/server/publish.ts` |
| Account ledger | `/account` | `src/components/account/*` | `src/server/ledger-view.ts` |

## Layers and ownership

```text
src/app/                 Next.js routes and HTTP handlers
src/components/          Client UI grouped by product surface
src/contracts/           Zod HTTP schemas, route manifest, OpenAPI inputs
src/domain/              Pure workflow model, mutations, compiler and projections
src/lib/editor-store.ts  Zustand editor state, optimistic commit queue, undo/redo
src/mocks/               Deterministic scenario and discovery fixtures
src/server/              File-backed mock services and generation state machine
e2e/                     Playwright product journeys at a 1440×900 viewport
docs/api/                Backend-facing API contract and generated OpenAPI
docs/research/libtv/     Official-site observations, screenshots and API evidence
docs/screenshots/        Local visual baselines
```

## Critical dependency boundaries

- UI code calls the typed wrapper in `src/lib/api.ts`; HTTP handlers validate through `src/contracts/**` and delegate to `src/server/**`.
- `src/domain/**` is shared, deterministic logic.  It must not import React or server-only modules.
- `src/domain/mutations.ts` is the canonical workflow-document reducer used by both client and server.
- `src/domain/storyboard.ts` projects the same workflow document; storyboard is not a second persisted document.
- `src/server/store.ts` is the persistence seam.  Fixtures persist under `.data/`, never in production services.
- `src/server/generation/provider.ts` is the future real-model seam; the present provider is deterministic and local.
- The authenticated shell lives only on home/project surfaces today.  Canvas parity work must not wrap the editor in that shell because the official editor has its own full-screen chrome.

## Canvas parity hot paths

| Concern | Files |
| --- | --- |
| Workspace orchestration | `src/components/canvas/CanvasWorkspace.tsx` |
| Header, project/canvas switcher, view tabs | `src/components/canvas/TopBar.tsx` |
| Infinite canvas and graph commands | `src/components/canvas/WorkflowCanvas.tsx` |
| Node visuals and editors | `src/components/canvas/NodeCard.tsx`, `node-visuals.tsx`, `TextNodeEditor.tsx`, `ImageNodeEditor.tsx`, `VideoNodeEditor.tsx`, `AudioNodeEditor.tsx` |
| Text authoring and starters | `src/domain/text-authoring.ts`, `src/domain/text-workflows.ts`, `src/contracts/text.ts`, `src/components/text/TextModelCatalog.tsx` |
| Left libraries and bottom controls | `LibraryPanels.tsx`, `AssetSidebar.tsx`, `BottomToolbar.tsx` |
| Storyboard columns/detail/editor | `src/components/storyboard/*` |
| Presence/follow state | `PresenceLayer.tsx`, `src/lib/presence-client.ts`, `src/server/presence.ts` |
| Canvas and workflow contracts | `src/contracts/canvas.ts`, `src/contracts/local.ts`, `src/domain/types.ts`, `docs/api/*_AUTHORING_STATE.md` |
| Official evidence | `docs/research/libtv/pages/canvas/README.md`, adjacent `screenshots/` |
| Existing browser journeys | `e2e/workflow.spec.ts`, `e2e/scenarios.spec.ts` |

## Test and verification commands

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm e2e
pnpm verify
```

`pnpm dev` and Playwright may rewrite `next-env.d.ts`; restore it before committing.  Full E2E can also update tracked files under `docs/screenshots/`; keep only intentional baselines.  The user-owned untracked `.gitignore` is out of scope.
