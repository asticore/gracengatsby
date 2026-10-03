import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'
import type { Metadata } from 'next'
import { RichText } from '@/engine/editor/react'

import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { getEngine } from '@/lib/engine'
import { verifyPreviewToken } from '@/utilities/previewToken'
import type { Media, Post } from '@/engage-types'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return {
    robots: {
      index: false,
      follow: false,
    },
    title: 'Preview',
  }
}

interface PreviewPageParams {
  collection: string
  id: string
}

interface PreviewPageProps {
  params: Promise<PreviewPageParams>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function PreviewPage({ params, searchParams }: PreviewPageProps) {
  const { collection, id } = await params
  const { token: tokenParam } = await searchParams

  const token = typeof tokenParam === 'string' ? tokenParam : ''
  const docId = Number(id)

  // Verify token
  if (!token) {
    notFound()
  }

  const payload = await verifyPreviewToken(token)
  if (!payload) {
    notFound()
  }

  // Verify token matches collection and id
  if (payload.c !== collection || payload.i !== docId) {
    notFound()
  }

  // Load the draft document
  const engine = await getEngine()

  let doc: unknown
  try {
    doc = await engine.findByID({
      collection,
      id: docId,
      draft: true,
      overrideAccess: true,
      depth: 2,
    })
  } catch {
    notFound()
  }

  if (!doc) {
    notFound()
  }

  const docRecord = doc as Record<string, unknown>

  // Render based on collection type
  if (collection === 'pages') {
    const title = typeof docRecord.title === 'string' ? docRecord.title : 'Untitled Page'
    const blocks = Array.isArray(docRecord.blocks) ? docRecord.blocks : []
    const ancestors = Array.isArray(docRecord._ancestors)
      ? (docRecord._ancestors as Array<Record<string, unknown>>)
      : []

    return (
      <div className="built-page">
        <div className="preview-notice">
          <div className="preview-notice__content">
            <strong>Preview of an unpublished draft</strong> - only people with this link can see it
          </div>
        </div>

        {ancestors.length > 0 && (
          <nav
            className="mx-auto flex max-w-[var(--max-width)] flex-wrap gap-2 px-6 pt-4 text-[0.8rem] tracking-[0.04em] text-[rgba(20,17,15,0.6)]"
            aria-label="Breadcrumb"
          >
            <Link href="/">Home</Link>
            {ancestors.map((ancestor, idx) => (
              <React.Fragment key={String(ancestor.id) || idx}>
                <span className="opacity-50">/</span>
                <span>{String(ancestor.title || '')}</span>
              </React.Fragment>
            ))}
            <span className="opacity-50">/</span>
            <span className="text-[var(--color-ink)]">{title}</span>
          </nav>
        )}

        {blocks.map((block: unknown, index: number) => {
          const blockRecord = block as Record<string, unknown>
          return (
            <BlockRenderer
              key={String(blockRecord.id) || index}
              block={blockRecord}
              index={index}
            />
          )
        })}
      </div>
    )
  }

  if (collection === 'posts') {
    const title = typeof docRecord.title === 'string' ? docRecord.title : 'Untitled Post'
    const blocks = Array.isArray(docRecord.blocks) ? docRecord.blocks : []
    const content = docRecord.content
    const featuredImage = docRecord.featuredImage && typeof docRecord.featuredImage === 'object' ? (docRecord.featuredImage as Media) : null

    return (
      <article className="built-post">
        <div className="preview-notice">
          <div className="preview-notice__content">
            <strong>Preview of an unpublished draft</strong> - only people with this link can see it
          </div>
        </div>

        <div className="mx-auto max-w-[var(--max-width)] px-6 py-8">
          {featuredImage && featuredImage.url && (
            <Image
              alt={featuredImage.alt || ''}
              className="mb-8 w-full"
              height={500}
              src={featuredImage.url}
              width={1000}
            />
          )}
          <h1 className="mb-4 text-4xl font-bold">{title}</h1>

          {blocks && blocks.length > 0 && (
            <div className="mb-8">
              {(blocks as Array<Record<string, unknown>>).map((block, index) => (
                <BlockRenderer key={String(block.id) || index} block={block} index={index} />
              ))}
            </div>
          )}

          {content && typeof content === 'string' && (
            <div className="prose max-w-none">
              <RichText {...JSON.parse(content)} />
            </div>
          )}
        </div>
      </article>
    )
  }

  notFound()
}
