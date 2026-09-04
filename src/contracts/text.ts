import { z } from 'zod'

import {
  TEXT_AUTHORING_MODES,
  TEXT_BACKGROUNDS,
  TEXT_BLOCK_KINDS,
  TEXT_DOCUMENT_MAX_BLOCKS,
  TEXT_DOCUMENT_MAX_CHARACTERS,
  TEXT_MARKS,
  TEXT_STARTER_INTENTS,
} from '@/domain/text-authoring'

export const TextBlockSchema = z.object({
  id: z.string().min(1).max(100),
  kind: z.enum(TEXT_BLOCK_KINDS),
  text: z.string().max(TEXT_DOCUMENT_MAX_CHARACTERS),
  marks: z.array(z.enum(TEXT_MARKS)).max(TEXT_MARKS.length).refine(
    (marks) => new Set(marks).size === marks.length,
    'Text marks must be unique',
  ),
})

export const TextAuthoringDocumentSchema = z.object({
  background: z.enum(TEXT_BACKGROUNDS),
  blocks: z.array(TextBlockSchema).min(1).max(TEXT_DOCUMENT_MAX_BLOCKS),
}).superRefine((document, context) => {
  const ids = new Set<string>()
  let characters = 0
  document.blocks.forEach((block, index) => {
    if (ids.has(block.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['blocks', index, 'id'],
        message: 'Text block ids must be unique',
      })
    }
    ids.add(block.id)
    if (block.kind !== 'divider') characters += block.text.length
  })
  if (characters > TEXT_DOCUMENT_MAX_CHARACTERS) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['blocks'],
      message: `Text document must not exceed ${TEXT_DOCUMENT_MAX_CHARACTERS} characters`,
    })
  }
})

export const TextAuthoringStateSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.enum(TEXT_AUTHORING_MODES),
  intent: z.enum(TEXT_STARTER_INTENTS).nullable(),
  document: TextAuthoringDocumentSchema,
  translationEnabled: z.boolean(),
  expanded: z.boolean(),
})

export const TextModelCapabilitiesSchema = z.object({
  family: z.enum(['multimodal', 'language']),
  maxCharacters: z.number().int().positive(),
  acceptsReferences: z.array(z.enum(['text', 'image'])).min(1).max(2).refine(
    (values) => new Set(values).size === values.length,
    'Text reference kinds must be unique',
  ),
  providerModelId: z.string().min(1),
  scene: z.literal('text-generate'),
  supportsTranslation: z.boolean(),
})

export type TextAuthoringStateContract = z.infer<typeof TextAuthoringStateSchema>
