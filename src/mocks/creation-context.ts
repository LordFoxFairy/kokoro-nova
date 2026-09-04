import {
  CREATION_CONTEXT_VERSION,
  type CreationContext,
} from "@/contracts/creation-context";

/** Deterministic client/server initial value — never reaches LibTV or a CDN. */
export const CREATION_CONTEXT_EMPTY_FIXTURE: CreationContext = {
  version: CREATION_CONTEXT_VERSION,
  attachments: [],
  model: null,
  skill: null,
  references: [],
  generationMode: "manual",
};

export const CREATION_CONTEXT_FIXTURE_VERSION = CREATION_CONTEXT_VERSION;
