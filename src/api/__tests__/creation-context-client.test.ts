import { describe, expect, it } from "vitest";

import {
  createCreationContextClient,
  type CreationContextTransport,
} from "@/api/creation-context";
import {
  CREATION_CONTEXT_VERSION,
  type CreationContext,
} from "@/contracts/creation-context";

const context: CreationContext = {
  version: CREATION_CONTEXT_VERSION,
  attachments: [],
  model: null,
  skill: null,
  references: [],
  generationMode: "manual",
};

describe("CreationContext typed client", () => {
  it("uses only the local route and serializes the normalized target state", async () => {
    const calls: Array<{ path: string; method?: string; body?: string }> = [];
    const transport: CreationContextTransport = async (input, init) => {
      calls.push({
        path: String(input),
        method: init?.method,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      if (init?.method === "POST")
        return Response.json({
          request: {
            id: "creation-request-0001",
            scope: "home",
            prompt: "雨夜短片",
            context,
            createdAt: "2026-09-04T00:00:00.000Z",
          },
        });
      return Response.json({ scope: "home", context });
    };
    const client = createCreationContextClient(transport);

    await expect(client.get()).resolves.toEqual({ scope: "home", context });
    await expect(client.save(context)).resolves.toEqual({
      scope: "home",
      context,
    });
    await expect(client.submit("雨夜短片", context)).resolves.toMatchObject({
      request: { id: "creation-request-0001", context },
    });
    expect(calls).toEqual([
      { path: "/api/creation-context" },
      {
        path: "/api/creation-context",
        method: "PUT",
        body: JSON.stringify({ scope: "home", context }),
      },
      {
        path: "/api/creation-context",
        method: "POST",
        body: JSON.stringify({ scope: "home", prompt: "雨夜短片", context }),
      },
    ]);
  });
});
