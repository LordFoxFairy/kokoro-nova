import type {
  CreationAgentRequest,
  CreationContext,
} from "@/contracts/creation-context";
import { CreationContextSchema } from "@/contracts/creation-context";
import { normalizeCreationContext } from "@/domain/creation-context";
import { CREATION_CONTEXT_EMPTY_FIXTURE } from "@/mocks/creation-context";

type CreationContextStore = {
  home: CreationContext;
  nextRequest: number;
  requests: CreationAgentRequest[];
};

const STORE_KEY = "__kokoroCreationContextStore";

function initialStore(): CreationContextStore {
  return {
    home: structuredClone(CREATION_CONTEXT_EMPTY_FIXTURE),
    nextRequest: 1,
    requests: [],
  };
}

function store(): CreationContextStore {
  const host = globalThis as typeof globalThis & {
    [STORE_KEY]?: CreationContextStore;
  };
  host[STORE_KEY] ??= initialStore();
  return host[STORE_KEY];
}

export function readHomeCreationContext(): CreationContext {
  return structuredClone(store().home);
}

export function writeHomeCreationContext(
  context: CreationContext,
): CreationContext {
  const normalized = normalizeCreationContext(
    CreationContextSchema.parse(context),
  );
  store().home = structuredClone(normalized);
  return structuredClone(normalized);
}

/**
 * The mock records the immutable input separately from the editable draft.
 * A future agent gateway can bind `request.id` to an AgentSession after
 * project/canvas creation without reinterpreting UI state.
 */
export function recordCreationAgentRequest(
  prompt: string,
  context: CreationContext,
): CreationAgentRequest {
  const state = store();
  const request: CreationAgentRequest = {
    id: `creation-request-${String(state.nextRequest++).padStart(4, "0")}`,
    scope: "home",
    prompt,
    context: writeHomeCreationContext(context),
    createdAt: new Date().toISOString(),
  };
  state.requests.push(structuredClone(request));
  return request;
}

export function listCreationAgentRequests(): CreationAgentRequest[] {
  return structuredClone(store().requests);
}

export function resetCreationContextStore() {
  const host = globalThis as typeof globalThis & {
    [STORE_KEY]?: CreationContextStore;
  };
  host[STORE_KEY] = initialStore();
}
