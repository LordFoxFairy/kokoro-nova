import { z } from "zod";

/**
 * Stable hand-off shape for a home creation turn.  It is intentionally
 * versioned separately from AgentSession: the first Agent turn starts before a
 * project/canvas exists, while the future gateway can attach this immutable
 * snapshot to the newly created session.
 */
export const CREATION_CONTEXT_VERSION = "2026-09-04.1" as const;
export const CreationContextVersionSchema = z.literal(CREATION_CONTEXT_VERSION);

const StableIdSchema = z.string().trim().min(1).max(200);
const LocalFixtureOrBlobUrlSchema = z
  .string()
  .refine(
    (value) =>
      value.startsWith("/fixtures/libtv/") || value.startsWith("blob:"),
    "上下文媒体只能是本地 fixture 或当前浏览器的临时 blob",
  );

export const CreationMediaKindSchema = z.enum([
  "image",
  "video",
  "audio",
  "text",
]);
export const CreationAttachmentSourceSchema = z.enum([
  "local-upload",
  "personal-asset",
]);

export const CreationAttachmentSchema = z
  .object({
    id: StableIdSchema,
    source: CreationAttachmentSourceSchema,
    assetId: StableIdSchema.nullable(),
    label: z.string().trim().min(1).max(500),
    mediaKind: CreationMediaKindSchema,
    thumbnailUrl: LocalFixtureOrBlobUrlSchema.nullable(),
  })
  .strict();

export const CreationReferenceSchema = z
  .object({
    id: StableIdSchema,
    source: z.literal("personal-asset"),
    assetId: StableIdSchema,
    label: z.string().trim().min(1).max(500),
    mediaKind: z.enum(["image", "video", "audio"]),
    thumbnailUrl: LocalFixtureOrBlobUrlSchema.nullable(),
  })
  .strict();

export const CreationModelSchema = z
  .object({
    id: StableIdSchema,
    label: z.string().trim().min(1).max(200),
    media: z.enum(["image", "video"]),
    catalogVersion: z.string().trim().min(1).max(100),
  })
  .strict();

export const CreationSkillSchema = z
  .object({
    id: StableIdSchema,
    label: z.string().trim().min(1).max(200),
    version: z.string().trim().min(1).max(100),
  })
  .strict();

export const CreationGenerationModeSchema = z.enum(["manual", "auto"]);

export const CreationContextSchema = z
  .object({
    version: CreationContextVersionSchema,
    attachments: z.array(CreationAttachmentSchema).max(12),
    model: CreationModelSchema.nullable(),
    skill: CreationSkillSchema.nullable(),
    references: z.array(CreationReferenceSchema).max(8),
    generationMode: CreationGenerationModeSchema,
  })
  .strict();

export const CreationContextScopeSchema = z.literal("home");
export const CreationContextReadResponseSchema = z
  .object({
    scope: CreationContextScopeSchema,
    context: CreationContextSchema,
  })
  .strict();
export const CreationContextWriteRequestSchema =
  CreationContextReadResponseSchema;
export const CreationContextWriteResponseSchema =
  CreationContextReadResponseSchema;

/** A frozen initial Agent input, stored before project creation/navigation. */
export const CreateCreationAgentRequestSchema = z
  .object({
    scope: CreationContextScopeSchema,
    prompt: z.string().trim().min(1).max(20_000),
    context: CreationContextSchema,
  })
  .strict();
export const CreationAgentRequestSchema =
  CreateCreationAgentRequestSchema.extend({
    id: StableIdSchema,
    createdAt: z.string().datetime(),
  }).strict();
export const CreateCreationAgentResponseSchema = z
  .object({ request: CreationAgentRequestSchema })
  .strict();

export type CreationContext = z.infer<typeof CreationContextSchema>;
export type CreationAttachment = z.infer<typeof CreationAttachmentSchema>;
export type CreationReference = z.infer<typeof CreationReferenceSchema>;
export type CreationModel = z.infer<typeof CreationModelSchema>;
export type CreationSkill = z.infer<typeof CreationSkillSchema>;
export type CreationAgentRequest = z.infer<typeof CreationAgentRequestSchema>;
