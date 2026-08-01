import { customAlphabet } from 'nanoid'

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz'
const raw = customAlphabet(alphabet, 16)

/**
 * Prefixed, sortable-enough opaque ids. Object URLs use these; readable titles
 * are never a lookup key (see information-architecture/NAVIGATION.md).
 */
export function newId(prefix: string): string {
  return `${prefix}_${raw()}`
}

export const ids = {
  space: () => newId('sp'),
  project: () => newId('prj'),
  folder: () => newId('fld'),
  canvas: () => newId('cvs'),
  node: () => newId('nd'),
  edge: () => newId('edg'),
  group: () => newId('grp'),
  asset: () => newId('ast'),
  job: () => newId('job'),
  artifact: () => newId('art'),
  session: () => newId('ses'),
  message: () => newId('msg'),
  ledger: () => newId('led'),
  invocation: () => newId('inv'),
}
