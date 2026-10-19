'use client'

import React from 'react'

import { getElementDef } from '@/lib/elements/registry'
import type { SectionNode } from '@/lib/sectionTree'

import { getBlockDef } from './blockSchemas'
import { getNode, type NodePath } from './treeOps'

export type Crumb = {
  label: string
  /** Path to select when the crumb is clicked. null selects the page (clears the selection). */
  path: NodePath | null
}

function humanize(value: string): string {
  const spaced = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').trim()
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : value
}

function labelForBlock(node: SectionNode): string {
  if (node.blockType === 'section') return 'Section'
  if (node.blockType === 'element') {
    const type = typeof node.elementType === 'string' ? node.elementType : ''
    return getElementDef(type)?.label ?? (humanize(type) || 'Element')
  }
  return getBlockDef(node.blockType)?.label ?? humanize(node.blockType)
}

/**
 * Page > Section > Column > Element for a selection path. Odd-length prefixes are blocks, even-length
 * ones are columns (see treeOps.ts). The walk stops at the first prefix that no longer resolves.
 */
export function buildCrumbs(tree: SectionNode[], path: NodePath | null): Crumb[] {
  const crumbs: Crumb[] = [{ label: 'Page', path: null }]
  if (!path || path.length === 0) return crumbs

  for (let length = 1; length <= path.length; length += 1) {
    const prefix = path.slice(0, length)
    if (length % 2 === 1) {
      const node = getNode(tree, prefix)
      if (!node) break
      crumbs.push({ label: labelForBlock(node), path: prefix })
    } else {
      crumbs.push({ label: `Column ${prefix[prefix.length - 1] + 1}`, path: prefix })
    }
  }
  return crumbs
}

export const SelectionPath: React.FC<{
  tree: SectionNode[]
  selectedPath: NodePath | null
  onSelectPath: (path: NodePath | null) => void
}> = ({ tree, selectedPath, onSelectPath }) => {
  const crumbs = buildCrumbs(tree, selectedPath)
  return (
    <nav className="ve-crumbs" aria-label="Selection path">
      <ol className="ve-crumbs__list">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1
          return (
            <li key={`${index}-${crumb.label}`} className="ve-crumbs__item">
              {index > 0 && (
                <span className="ve-crumbs__sep" aria-hidden="true">
                  &gt;
                </span>
              )}
              <button
                type="button"
                className="ve-crumbs__btn"
                aria-current={last ? 'page' : undefined}
                onClick={() => onSelectPath(crumb.path)}
              >
                {crumb.label}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
