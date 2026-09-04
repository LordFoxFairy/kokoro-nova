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

type CreationContextStoreHost = {
  [STORE_KEY]?: CreationContextStore;
};

function initialStore(): CreationContextStore {
  return {
    home: structuredClone(CREATION_CONTEXT_EMPTY_FIXTURE),
    nextRequest: 1,
    requests: [],
  };
}

function store(): CreationContextStore {
  // App routes are evaluated in independent module graphs by Next dev. `process`
  // is shared by those graphs, whereas globalThis is not, so a draft written by
  // PUT and a request created by POST must meet at this process-level fixture.
  const processHost = process as typeof process & CreationContextStoreHost;
  const globalHost = globalThis as typeof globalThis & CreationContextStoreHost;
  const value = processHost[STORE_KEY] ?? globalHost[STORE_KEY] ?? initialStore();
  processHost[STORE_KEY] = value;
  globalHost[STORE_KEY] = value;
  return value;
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
  const value = initialStore();
  const processHost = process as typeof process & CreationContextStoreHost;
  const globalHost = globalThis as typeof globalThis & CreationContextStoreHost;
  processHost[STORE_KEY] = value;
  globalHost[STORE_KEY] = value;
}
