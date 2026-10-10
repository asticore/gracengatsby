import React from 'react'

import { loadFieldGroups, fetchMediaUrls } from '../server'
import { getOptionValues, isValidOptionSlug } from '../options'
import { collectMediaIds } from '../stringify'
import { OptionsForm } from './OptionsForm'
import type { FieldGroupDoc } from '@/fields/customFields/types'

/**
 * Admin screen for Options pages (site-wide values that belong to no
 * collection). Lists every options page that has at least one Field Group
 * pointing at it, and edits the chosen one with the normal field inputs.
 *
 * Route: /admin/options?page=<slug>. Registered in src/admin/adminViewRegistry.ts.
 */

const pageSlugsOf = (groups: FieldGroupDoc[]): string[] => {
  const slugs = new Set<string>()
  for (const group of groups) {
    for (const rules of group.location) {
      for (const rule of rules) if (rule.param === 'optionsPage' && rule.operator === 'equals') slugs.add(rule.value)
    }
  }
  return [...slugs].filter(isValidOptionSlug).sort()
}

export async function OptionsView({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const groups = await loadFieldGroups()
  const slugs = pageSlugsOf(groups)
  const requested = searchParams?.page
  const current = typeof requested === 'string' && slugs.includes(requested) ? requested : slugs[0]

  if (!current) {
    return (
      <div className="flex flex-col gap-[12px] p-[24px]">
        <h1 className="m-0 text-[22px]">Options pages</h1>
        <p className="m-0 text-[14px] opacity-75">
          No options pages yet. Create a Field Group and set its &quot;Show on&quot; rule to an options page slug, for example
          &quot;Options page: site-contact&quot;.
        </p>
      </div>
    )
  }

  const pageGroups = groups.filter((g) => g.location.some((rules) => rules.some((r) => r.param === 'optionsPage' && r.value === current)))
  const stored = await getOptionValues(current)
  const mediaUrls = await fetchMediaUrls(collectMediaIds(pageGroups.flatMap((g) => g.fields), stored.values))

  return (
    <div className="flex flex-col gap-[20px] p-[24px]">
      <header className="flex flex-col gap-[10px]">
        <h1 className="m-0 text-[22px]">Options pages</h1>
        <nav className="flex flex-wrap gap-[8px]" aria-label="Options pages">
          {slugs.map((slug) => (
            <a
              key={slug}
              href={`/admin/options?page=${encodeURIComponent(slug)}`}
              aria-current={slug === current ? 'page' : undefined}
              className={`rounded-[5px] border px-[10px] py-[5px] text-[13px] ${slug === current ? 'border-[#2e3192] font-semibold' : 'border-[var(--theme-elevation-150,#cac7d1)]'}`}
            >
              {slug}
            </a>
          ))}
        </nav>
      </header>
      <OptionsForm
        key={current}
        slug={current}
        groups={pageGroups}
        initialValues={stored.values}
        initialUpdatedAt={stored.updatedAt}
        initialMediaUrls={Object.fromEntries(mediaUrls)}
      />
    </div>
  )
}
