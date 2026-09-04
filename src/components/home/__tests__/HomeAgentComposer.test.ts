import { describe, expect, it } from "vitest";

import {
  buildHomeAgentBrief,
  nextHomeComposerEscapeState,
  type HomeAgentRequest,
} from "../HomeAgentComposer";

const request: HomeAgentRequest = {
  text: "一支雨夜城市的电影感短片",
  creationRequestId: "creation-request-0001",
  creationContext: {
    version: "2026-09-04.1",
    attachments: [
      {
        id: "asset-1",
        source: "personal-asset",
        assetId: "asset-1",
        label: "雨夜附件",
        mediaKind: "image",
        thumbnailUrl: "/fixtures/libtv/assets/rain.webp",
      },
    ],
    model: {
      id: "seedance-2-5",
      label: "Seedance 2.5",
      media: "video",
      catalogVersion: "local-catalog-2026-09-04.1",
    },
    skill: { id: "skill-1", label: "分镜拆解", version: "1.4.0" },
    references: [
      {
        id: "reference-1",
        source: "personal-asset",
        assetId: "asset-2",
        label: "雨夜参考图",
        mediaKind: "image",
        thumbnailUrl: "/fixtures/libtv/assets/rain.webp",
      },
    ],
    generationMode: "auto",
  },
};

describe("home Agent composer request boundary", () => {
  it("serializes prompt, context, model and mode for the existing canvas seam", () => {
    expect(buildHomeAgentBrief(request)).toBe(
      "一支雨夜城市的电影感短片\n附件：雨夜附件\n参考：雨夜参考图\nSkill：分镜拆解 (1.4.0)\n模型：Seedance 2.5\n生成模式：自动",
    );
  });

  it("does not add empty context lines to a clean request", () => {
    expect(
      buildHomeAgentBrief({
        text: "只写一个想法",
        creationRequestId: "creation-request-0002",
        creationContext: {
          version: "2026-09-04.1",
          attachments: [],
          model: null,
          skill: null,
          references: [],
          generationMode: "manual",
        },
      }),
    ).toBe("只写一个想法\n生成模式：手动");
  });

  it("closes the active popover before collapsing the expanded composer", () => {
    expect(
      nextHomeComposerEscapeState({ expanded: true, activePopover: "model" }),
    ).toEqual({
      expanded: true,
      activePopover: null,
      handled: true,
    });
    expect(
      nextHomeComposerEscapeState({ expanded: true, activePopover: null }),
    ).toEqual({
      expanded: false,
      activePopover: null,
      handled: true,
    });
  });

  it("leaves a collapsed composer alone when no layer is open", () => {
    expect(
      nextHomeComposerEscapeState({ expanded: false, activePopover: null }),
    ).toEqual({
      expanded: false,
      activePopover: null,
      handled: false,
    });
  });
});
