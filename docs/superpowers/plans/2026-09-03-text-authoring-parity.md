# LibTV Text authoring parity implementation plan

> Scope: the current repository is a frontend-only local fixture. Every server interaction, generated result, asset and catalog entry remains deterministic and offline. The official LibTV canvas is the primary interaction reference; captured private identifiers and credentials are never copied into this repository.

## Goal

Bring the Text node to the same implementation depth as the existing Video, Image and Audio nodes:

- reproduce the observed node-attached 660 px generator, four-model catalog and layered keyboard behavior;
- reproduce the manual rich-document card, floating formatting toolbar, background choice, copy and expanded editor;
- make the three observed starter actions create complete, atomic, replayable workflow graphs;
- compile rich text correctly into downstream jobs and expose deterministic generated text results;
- freeze all persisted state, model capabilities and artifact fields in runtime schemas, executable examples and OpenAPI;
- verify the experience with domain tests, contract tests, Playwright interaction tests and 1440 x 900 visual baselines.

## Observed reference contract

- Empty actions: `自己编写内容`, `文生视频`, `图片反推提示词`, `文字生音乐`.
- Generator placeholder: `写下你想讲的故事、场景或角色设定。例如：一个来自未来的机器人，在城市屋顶看星星。`.
- Model order:
  1. `GVLM 3.1` / `20s` / `多模态文本模型Pro`
  2. `CVLM 5.5` / `10s` / `超智能大语言模型`
  3. `GVLM 3.1 Flash` / `15s` / `多模态文本模型lite`
  4. `Qwen 3 VL Flash` / `10s` / `Qwen 3 VL Flash`
- Default model/cost: `GVLM 3.1`, 6 credits.
- Rich-document toolbar: background, H1/H2/H3/body, bold, italic, unordered list, ordered list, divider, copy and expanded edit.
- Manual text content is persisted separately from generation prompt and is the text supplied to downstream nodes.
- Starter group names: `预设 - 文生视频`, `预设 - 图片反推提示词`, `预设 - 文字生音乐`.

## Delivery sequence

### 1. Domain and contract tests first

- [x] Add failing tests for the versioned Text authoring state, stale-input normalization, safe block serialization and plain-text projection.
- [x] Add failing tests that freeze the exact four-model order, latency, descriptions, provider mapping and capabilities.
- [x] Add failing tests for all three starter graph topologies, prompts, model/output defaults and group membership.
- [x] Add failing compiler tests proving rich document text overrides an empty generation prompt for downstream edges and authoring-only metadata never leaks into provider output.
- [x] Add failing contract/OpenAPI example tests for Text state, catalog, starter mutations and inline text artifacts.

### 2. Versioned Text domain

- [x] Implement `TextAuthoringState` v1 with explicit `generator`/`document` modes, intent, safe rich blocks, background, translation preference and expanded-editor state.
- [x] Implement strict readers/normalizers for imported or stale `NodeData.extra` values.
- [x] Implement rich-block-to-plain-text and rich-block-to-safe-React projections without raw HTML execution.
- [x] Implement deterministic starter mutation builders that update the source Text node and add nodes, edges and group in one transaction.
- [x] Initialize every new Text node with the complete v1 state.

### 3. Model and execution contract

- [x] Replace the stale text catalog with the exact four observed entries and bump the catalog version.
- [x] Add typed Text model capabilities, including provider model/scene mapping, character limit and accepted reference kinds.
- [x] Normalize Text compilation and use rich-document plain text for graph inputs.
- [x] Add optional inline `textContent` to Text artifacts and have the offline provider emit the same deterministic text to both file and API response.
- [x] Preserve existing artifact, quote, confirmation, polling and storyboard paths.

### 4. Text generator UI

- [x] Embed a counter-scaled 660 px dark Text generator under the open canvas node.
- [x] Add prompt persistence, reference strip, exact four-model catalog, translation control, cost and disabled/active run states.
- [x] Implement layered Escape behavior: nested catalog first, editor second.
- [x] Ensure double-click inspection clears batch selection and keeps all authoring nodes gray while an attached editor is open.
- [x] Render generated inline text and downloadable `.txt` provenance after completion.

### 5. Rich-document UI

- [x] Switch `自己编写内容` into document mode without opening the generic inspector.
- [x] Implement safe block editing for headings, paragraph, bold, italic, unordered/ordered lists and divider.
- [x] Implement background palette, copy feedback and a full-screen expanded editor over the same persisted state.
- [x] Render the empty hint `请编写内容，开始你的创作。` outside editing mode.
- [x] Keep all changes deterministic across close, reopen and page reload.

### 6. Starter workflows

- [x] `文生视频`: Text -> Video, observed example prompt, video default prompt/model/output and exact group name.
- [x] `图片反推提示词`: Image -> Text, one-image reference intent, observed structured-prompt request and exact group name.
- [x] `文字生音乐`: Text -> Audio, observed music prompt, selected music model/defaults and exact group name.
- [x] Select and fit the newly materialized group after the transaction succeeds.
- [x] Verify one undo frame removes the complete starter graph.

### 7. API documentation

- [x] Add `TEXT_AUTHORING_STATE.md` with state machine, mutation examples, compile rules, output projection and backend handoff notes.
- [x] Add sanitized official API capture notes for current batch persistence and power-calculator envelopes.
- [x] Add executable JSON examples for Text state updates, model catalog and starter mutations.
- [x] Update OpenAPI schemas/examples/version and cross-link the API index, endpoint inventory and feature matrix.
- [x] Explicitly distinguish shape-confirmed official contracts from local mock-only endpoints.

### 8. Browser and visual verification

- [x] Add Playwright coverage for generator sizing at multiple zooms, model order, prompt persistence and Escape layering.
- [x] Add Playwright coverage for every rich-document toolbar action, background, copy, expanded editor and reload.
- [x] Add Playwright coverage for all three starter graph topologies and undo atomicity.
- [x] Add Playwright coverage for confirmation, deterministic `.txt` generation and Storyboard projection.
- [x] Capture intentional 1440 x 900 visual baselines for generator, model catalog, rich toolbar and expanded editor.

### 9. Final quality gates

- [x] Run focused red/green tests throughout implementation.
- [x] Run `pnpm verify`.
- [x] Run the complete Playwright suite.
- [x] Restore generated `next-env.d.ts` and unrelated screenshot changes.
- [x] Confirm no official private IDs, credentials or remote LibTV media URLs entered tracked files.
- [x] Commit only intentional Text parity changes; leave the user-owned untracked `.gitignore` untouched.
