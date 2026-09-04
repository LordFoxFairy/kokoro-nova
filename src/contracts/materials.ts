import { z } from 'zod'

export const MaterialKindSchema = z.enum(['style', 'effect'])
export const MaterialScopeSchema = z.enum(['market', 'favorites', 'recent'])
export const MaterialFavouriteActionSchema = z.enum(['favourite', 'unfavourite'])

const StableMaterialIdSchema = z.string().trim().min(1).max(200)

/** A model option is returned with the page so the UI never imports a registry. */
export const MaterialModelSchema = z
  .object({
    id: StableMaterialIdSchema,
    label: z.string().min(1),
  })
  .strict()

/**
 * A catalog card deliberately contains presentation metadata, not a media URL.
 * The local UI turns `hue` into deterministic preview art and can later replace
 * that renderer without changing the transport contract.
 */
export const MaterialCatalogItemSchema = z
  .object({
    id: StableMaterialIdSchema,
    kind: MaterialKindSchema,
    name: z.string().min(1),
    category: z.string().min(1),
    author: z.string().min(1),
    commercial: z.boolean(),
    usageCount: z.number().int().nonnegative(),
    modelId: StableMaterialIdSchema,
    modelLabel: z.string().min(1),
    modelIds: z.array(StableMaterialIdSchema).min(1),
    hue: z.number().int().min(0).max(359),
    description: z.string().min(1),
    favourite: z.boolean(),
    recent: z.boolean(),
  })
  .strict()

export const MaterialPageSchema = z
  .object({
    offset: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    hasMore: z.boolean(),
    nextOffset: z.number().int().nonnegative().nullable(),
  })
  .strict()

export const MaterialCatalogResponseSchema = z
  .object({
    version: z.string().min(1),
    kind: MaterialKindSchema,
    scope: MaterialScopeSchema,
    query: z.string(),
    category: z.string().min(1),
    commercialOnly: z.boolean(),
    modelId: StableMaterialIdSchema.nullable(),
    categories: z.array(z.string().min(1)).min(1),
    models: z.array(MaterialModelSchema),
    items: z.array(MaterialCatalogItemSchema),
    page: MaterialPageSchema,
  })
  .strict()

export const GetMaterialResponseSchema = z
  .object({ material: MaterialCatalogItemSchema })
  .strict()

export const ToggleMaterialFavouriteRequestSchema = z
  .object({ action: MaterialFavouriteActionSchema })
  .strict()

export const ToggleMaterialFavouriteResponseSchema = GetMaterialResponseSchema

export type MaterialKind = z.infer<typeof MaterialKindSchema>
export type MaterialScope = z.infer<typeof MaterialScopeSchema>
export type MaterialCatalogItem = z.infer<typeof MaterialCatalogItemSchema>
export type MaterialModel = z.infer<typeof MaterialModelSchema>
export type MaterialCatalogResponse = z.infer<typeof MaterialCatalogResponseSchema>
export type GetMaterialResponse = z.infer<typeof GetMaterialResponseSchema>
export type ToggleMaterialFavouriteRequest = z.infer<typeof ToggleMaterialFavouriteRequestSchema>
export type ToggleMaterialFavouriteResponse = z.infer<typeof ToggleMaterialFavouriteResponseSchema>
