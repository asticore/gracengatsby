import { TemplateLibraries } from '@/features/templateLibraries/settings'

import { generateTable } from './generate'

/** Table for the template libraries global (eg_template_libraries and its two child tables), in its own file so the schema index is not edited. */
export const templateLibrariesGenerated = generateTable(TemplateLibraries)
export const templateLibraries = templateLibrariesGenerated.table
