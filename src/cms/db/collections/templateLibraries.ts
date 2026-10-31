import { TemplateLibraries } from '@/features/templateLibraries/settings'

import { createGlobalOps } from '../generic'
import { templateLibraries, templateLibrariesGenerated } from '../schema/templateLibraries'

type Doc = Record<string, unknown> & { id: number; updatedAt: string; createdAt: string }

const settingsOps = createGlobalOps(templateLibraries, TemplateLibraries, {}, { groupFields: templateLibrariesGenerated.groupFields })
export const findTemplateLibraries = settingsOps.find as unknown as () => Promise<Doc | null>
export const updateTemplateLibraries = settingsOps.update as unknown as (data: Record<string, unknown>) => Promise<Doc>
