import {
  CREATION_CONTEXT_VERSION,
  CreationContextSchema,
  type CreationAttachment,
  type CreationContext,
  type CreationModel,
  type CreationReference,
  type CreationSkill,
} from "@/contracts/creation-context";

export const CREATION_CONTEXT_STORAGE_KEY = `kokoro.creation-context:${CREATION_CONTEXT_VERSION}`;

export function emptyCreationContext(): CreationContext {
  return {
    version: CREATION_CONTEXT_VERSION,
    attachments: [],
    model: null,
    skill: null,
    references: [],
    generationMode: "manual",
  };
}

function dedupe<T extends { id: string }>(items: readonly T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

/** Canonical ordering/deduplication makes retries and future session hand-off stable. */
export function normalizeCreationContext(
  input: CreationContext,
): CreationContext {
  return CreationContextSchema.parse({
    ...input,
    attachments: dedupe(input.attachments),
    references: dedupe(input.references),
  });
}

export function withCreationAttachment(
  context: CreationContext,
  attachment: CreationAttachment,
): CreationContext {
  return normalizeCreationContext({
    ...context,
    attachments: [...context.attachments, attachment],
  });
}

export function withoutCreationAttachment(
  context: CreationContext,
  attachmentId: string,
): CreationContext {
  return normalizeCreationContext({
    ...context,
    attachments: context.attachments.filter((item) => item.id !== attachmentId),
  });
}

export function withCreationReference(
  context: CreationContext,
  reference: CreationReference,
): CreationContext {
  return normalizeCreationContext({
    ...context,
    references: [...context.references, reference],
  });
}

export function withoutCreationReference(
  context: CreationContext,
  referenceId: string,
): CreationContext {
  return normalizeCreationContext({
    ...context,
    references: context.references.filter((item) => item.id !== referenceId),
  });
}

export function withCreationModel(
  context: CreationContext,
  model: CreationModel | null,
): CreationContext {
  return normalizeCreationContext({ ...context, model });
}

export function withCreationSkill(
  context: CreationContext,
  skill: CreationSkill | null,
): CreationContext {
  return normalizeCreationContext({ ...context, skill });
}

export function creationContextSummary(context: CreationContext): string[] {
  const lines: string[] = [];
  if (context.attachments.length)
    lines.push(
      `附件：${context.attachments.map((item) => item.label).join("、")}`,
    );
  if (context.references.length)
    lines.push(
      `参考：${context.references.map((item) => item.label).join("、")}`,
    );
  if (context.skill)
    lines.push(`Skill：${context.skill.label} (${context.skill.version})`);
  if (context.model) lines.push(`模型：${context.model.label}`);
  lines.push(
    `生成模式：${context.generationMode === "auto" ? "自动" : "手动"}`,
  );
  return lines;
}

export function readCreationContextStorage(
  value: string | null,
): CreationContext {
  if (!value) return emptyCreationContext();
  try {
    return normalizeCreationContext(
      CreationContextSchema.parse(JSON.parse(value) as unknown),
    );
  } catch {
    return emptyCreationContext();
  }
}
