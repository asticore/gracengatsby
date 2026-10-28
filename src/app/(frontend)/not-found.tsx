import { storeTexts } from '@/features/uiStrings/storeTextsServer'
import { translateWith } from '@/features/uiStrings/t'
import type { UiStringKey } from '@/features/uiStrings/keys'
import Link from 'next/link'
import React from 'react'

import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { annotatePage } from '@/features/editScreens/toc'
import { resolveDocumentContent } from '@/features/customFields/server'
import { getNotFoundPage } from '@/features/site/pages'
import { getFeatureFlags } from '@/utilities/features'
import { renderWithTemplate } from '@/features/siteTemplates/render'

/**
 * Shown for any address that does not exist under the public site. Next answers with HTTP 404 for it
 * (notFound() in [...slug]/page.tsx), so the status is right either way. When a 404 page is picked in
 * Site pages, its blocks are rendered here; otherwise a short built-in message is shown.
 */
export default async function NotFound() {
  const dict = await storeTexts()
  const t = (key: UiStringKey) => translateWith(dict, key)
  const page = await getNotFoundPage()

  if (page) {
    const content = await resolveDocumentContent('pages', page)
    return (
      <div className="built-page">
        {annotatePage({ blocks: content.blocks || [] }).blocks.map((block, index) => (
          <BlockRenderer key={block.id || index} block={block} index={index} />
        ))}
      </div>
    )
  }

  const flags = await getFeatureFlags()

  const message = (
    <section className="mx-auto max-w-[var(--max-width)] px-6 py-24 text-center" aria-labelledby="not-found-heading">
      <h1 id="not-found-heading" className="text-4xl text-[var(--color-ink)]" style={{ fontFamily: 'var(--font-display)' }}>
        {t('store.pageNotFound')}
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-[var(--color-ink)] opacity-80">
        {t('store.notFoundHelp')}
      </p>
      <nav className="mt-8 flex flex-wrap justify-center gap-6 text-[var(--color-ink)] underline underline-offset-4" aria-label={t('store.helpfulLinks')}>
        <Link href="/">{t('store.home')}</Link>
        {flags.blog !== false && <Link href="/blog">{t('store.blog')}</Link>}
        {flags.ecommerce !== false && <Link href="/shop">{t('store.shop')}</Link>}
      </nav>
    </section>
  )
  // A matching 404 template replaces the built-in message; the 404 page picked in Site pages still wins above.
  return renderWithTemplate({ kind: 'not-found', ctx: {}, content: message })
}
