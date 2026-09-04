import { afterEach, describe, expect, it } from "vitest";

import {
  CREATION_CONTEXT_VERSION,
  CreateCreationAgentResponseSchema,
  CreationContextReadResponseSchema,
  CreationContextWriteResponseSchema,
} from "@/contracts/creation-context";
import { resetCreationContextStore } from "@/server/creation-context";
import { GET, POST, PUT } from "./route";

const context = {
  version: CREATION_CONTEXT_VERSION,
  attachments: [
    {
      id: "asset-rain",
      source: "personal-asset",
      assetId: "asset-rain",
      label: "雨夜街景",
      mediaKind: "image",
      thumbnailUrl: "/fixtures/libtv/assets/rain.webp",
    },
  ],
  model: {
    id: "seedance-2-5",
    label: "Seedance 2.5",
    media: "video",
    catalogVersion: "2026-09-04.1",
  },
  skill: { id: "skill-storyboard", label: "分镜拆解", version: "1.4.0" },
  references: [
    {
      id: "asset-character",
      source: "personal-asset",
      assetId: "asset-character",
      label: "角色参考",
      mediaKind: "image",
      thumbnailUrl: "/fixtures/libtv/assets/character.webp",
    },
  ],
  generationMode: "auto",
} as const;

afterEach(() => resetCreationContextStore());

describe.sequential("CreationContext local mock contract", () => {
  it("writes a versioned draft and restores it on a later read", async () => {
    const written = await PUT(
      new Request("http://localhost/api/creation-context", {
        method: "PUT",
        body: JSON.stringify({ scope: "home", context }),
      }),
    );
    expect(written.status).toBe(200);
    expect(
      CreationContextWriteResponseSchema.parse(await written.json()).context,
    ).toEqual(context);

    const restored = await GET();
    expect(
      CreationContextReadResponseSchema.parse(await restored.json()).context,
    ).toEqual(context);
  });

  it("freezes submitted context into a deterministic local Agent request", async () => {
    const response = await POST(
      new Request("http://localhost/api/creation-context", {
        method: "POST",
        body: JSON.stringify({
          scope: "home",
          prompt: "一支雨夜城市短片",
          context,
        }),
      }),
    );
    const body = CreateCreationAgentResponseSchema.parse(await response.json());
    expect(response.status).toBe(200);
    expect(body.request).toMatchObject({
      id: "creation-request-0001",
      prompt: "一支雨夜城市短片",
      context,
    });
  });

  it("rejects a remote media URL instead of accepting a production dependency", async () => {
    const response = await PUT(
      new Request("http://localhost/api/creation-context", {
        method: "PUT",
        body: JSON.stringify({
          scope: "home",
          context: {
            ...context,
            attachments: [
              {
                ...context.attachments[0],
                thumbnailUrl: "https://remote.example/image.webp",
              },
            ],
          },
        }),
      }),
    );
    expect(response.status).toBe(400);
  });
});
