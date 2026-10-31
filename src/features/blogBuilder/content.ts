/**
 * Builds the Lexical rich text for a post from the reviewed outline and sections.
 * Pure. Uses the same node builders as the content importer, so the stored shape matches.
 */

import {
  lexicalRoot,
  heading,
  listItem,
  listNode,
  paragraph,
  textNode,
  type LexicalNode,
} from '@/features/importContent/lexical'

import type { BlogOutlineItem } from './request'

/** One paragraph or list block from a section's text. Lines inside a paragraph are joined with a space. */
export function blockNodes(sectionText: string): LexicalNode[] {
  const nodes: LexicalNode[] = []
  for (const block of sectionText.split(/\n\s*\n/)) {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    if (lines.length === 0) continue
    if (lines.every((line) => line.startsWith('- '))) {
      nodes.push(
        listNode(
          false,
          lines.map((line) => listItem([textNode(line.slice(2).trim())])),
        ),
      )
    } else {
      nodes.push(paragraph([textNode(lines.join(' ').replace(/^- /, ''))]))
    }
  }
  return nodes
}

/** The post body: each outline heading as h2, then its section text. */
export function postContent(
  outline: BlogOutlineItem[],
  sections: string[],
): Record<string, unknown> {
  const nodes: LexicalNode[] = []
  outline.forEach((item, index) => {
    nodes.push(heading('h2', [textNode(item.heading)]))
    nodes.push(...blockNodes(sections[index] ?? ''))
  })
  return lexicalRoot(nodes)
}
