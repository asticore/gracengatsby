import React from 'react'

import { buildTocTree, levelsFor, type TocHeading, type TocNode } from '@/features/editScreens/toc'

/**
 * Server-rendered list of links to the page's headings. The headings come
 * from annotatePage (src/features/editScreens/toc.ts), which also gives each
 * heading the id these links point at. No client JavaScript: when collapsible
 * is on, the list is a native details element.
 */
export const TableOfContentsBlock: React.FC<{
  title?: string | null
  levels?: string | null
  collapsible?: boolean | null
  headings?: TocHeading[] | null
}> = ({ title, levels, collapsible, headings }) => {
  const tree = buildTocTree(Array.isArray(headings) ? headings : [], levelsFor(levels))
  if (tree.length === 0) return null

  const label = title?.trim() || 'Contents'
  const list = <TocList nodes={tree} />

  return (
    <section className="built-block mx-auto max-w-[760px] px-6 py-8">
      {collapsible ? (
        <details className="rounded border border-current/20 px-4 py-3" open>
          <summary className="cursor-pointer font-semibold">{label}</summary>
          <nav aria-label={label} className="mt-3">
            {list}
          </nav>
        </details>
      ) : (
        <nav aria-label={label}>
          {title?.trim() && <p className="mb-2 font-semibold">{label}</p>}
          {list}
        </nav>
      )}
    </section>
  )
}

const TocList: React.FC<{ nodes: TocNode[]; nested?: boolean }> = ({ nodes, nested = false }) => (
  <ol className={`list-none space-y-1 ${nested ? 'mt-1 pl-5' : 'pl-0'}`}>
    {nodes.map((node) => (
      <li key={node.heading.id}>
        <a className="underline-offset-4 hover:underline" href={`#${node.heading.id}`}>
          {node.heading.text}
        </a>
        {node.children.length > 0 && <TocList nodes={node.children} nested />}
      </li>
    ))}
  </ol>
)