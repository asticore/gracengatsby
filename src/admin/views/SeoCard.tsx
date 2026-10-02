'use client'

import React, { useState, useEffect } from 'react'
import type { Field } from '@/engine'
import { FieldRenderer } from '@/admin/fields/FieldRenderer'
import { useFormFields } from '@/admin/context'
import { SocialImageInfo } from './SocialImageInfo'

function SchemaDisplay() {
  const { schemaType } = useFormFields(([fields]) => ({
    schemaType: fields['schemaType']?.value as string | undefined,
  }))

  const displayValue = schemaType || 'Not set'

  return (
    <div className="seo-schema">
      <p>
        <strong>Structured data type:</strong> {displayValue}
      </p>
      <p className="doc-muted">Change it in the Page type box on the right.</p>
    </div>
  )
}

export type SeoCardProps = {
  seoField: Field
  readOnly?: boolean
  liveHref?: string
}

function SnippetPreview({ liveHref }: { liveHref?: string }) {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    // Avoid hydration mismatch: render the hostname only when mounted on the client.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true)
  }, [])

  const { metaTitle, metaDescription } = useFormFields(([fields]) => ({
    metaTitle: fields['seo.metaTitle']?.value as string | undefined,
    metaDescription: fields['seo.metaDescription']?.value as string | undefined,
  }))

  const { title, name } = useFormFields(([fields]) => ({
    title: fields['title']?.value as string | undefined,
    name: fields['name']?.value as string | undefined,
  }))

  const docTitle = metaTitle || title || name || 'Untitled'
  const description = metaDescription || 'Add a meta description…'

  const host = isMounted ? window.location.hostname : 'example.com'
  const path = liveHref || '/'

  const titleLength = metaTitle?.length ?? 0
  const descLength = metaDescription?.length ?? 0

  const getTitleClass = (len: number) => {
    if (len <= 60) return 'seo-count--ok'
    if (len <= 66) return 'seo-count--warn'
    return 'seo-count--bad'
  }

  const getDescClass = (len: number) => {
    if (len <= 160) return 'seo-count--ok'
    if (len <= 176) return 'seo-count--warn'
    return 'seo-count--bad'
  }

  return (
    <div className="seo-snippet">
      <div className="seo-snippet__url">
        {host}
        {isMounted && path}
      </div>
      <div className="seo-snippet__title">{docTitle}</div>
      <div className="seo-snippet__description">{description}</div>
      <div className="seo-snippet__counters">
        <span className={`seo-count ${getTitleClass(titleLength)}`}>Title {titleLength}/60</span>
        <span className={`seo-count ${getDescClass(descLength)}`}>Description {descLength}/160</span>
      </div>
    </div>
  )
}

export const SeoCard: React.FC<SeoCardProps> = ({ seoField, readOnly, liveHref }) => {
  const [activeTab, setActiveTab] = useState<'seo' | 'social' | 'schema'>('seo')

  const seoFields = ((seoField.fields as Field[] | undefined) || []).filter((f) => {
    const name = 'name' in f ? (f as { name?: string }).name : undefined
    return ['metaTitle', 'metaDescription', 'canonicalUrl', 'noIndex', 'noFollow'].includes(name as string)
  })

  const socialFields = ((seoField.fields as Field[] | undefined) || []).filter((f) => {
    const name = 'name' in f ? (f as { name?: string }).name : undefined
    return ['socialTitle', 'socialDescription', 'ogImage', 'xCard', 'xImage'].includes(name as string)
  })

  const restrictedSeoField: Field = {
    ...seoField,
    label: false,
    admin: { ...seoField.admin, description: undefined },
    fields: seoFields,
  }

  const restrictedSocialField: Field = {
    ...seoField,
    label: false,
    admin: { ...seoField.admin, description: undefined },
    fields: socialFields,
  }

  return (
    <section className="doc-seo-card">
      <h2 className="doc-seo-card__title">SEO</h2>

      <div role="tablist" className="doc-seo-card__tabs">
        <button
          type="button"
          role="tab"
          id="seo-tab-seo"
          aria-controls="seo-panel-seo"
          aria-selected={activeTab === 'seo'}
          onClick={() => setActiveTab('seo')}
          className="doc-seo-card__tab"
        >
          SEO
        </button>
        <button
          type="button"
          role="tab"
          id="seo-tab-social"
          aria-controls="seo-panel-social"
          aria-selected={activeTab === 'social'}
          onClick={() => setActiveTab('social')}
          className="doc-seo-card__tab"
        >
          Social
        </button>
        <button
          type="button"
          role="tab"
          id="seo-tab-schema"
          aria-controls="seo-panel-schema"
          aria-selected={activeTab === 'schema'}
          onClick={() => setActiveTab('schema')}
          className="doc-seo-card__tab"
        >
          Schema
        </button>
      </div>

      <div className="doc-seo-card__tab-content">
        <div id="seo-panel-seo" role="tabpanel" aria-labelledby="seo-tab-seo" hidden={activeTab !== 'seo'}>
          <SnippetPreview liveHref={liveHref} />
          <FieldRenderer fields={[restrictedSeoField]} readOnly={readOnly} />
        </div>
        <div id="seo-panel-social" role="tabpanel" aria-labelledby="seo-tab-social" hidden={activeTab !== 'social'}>
          <FieldRenderer fields={[restrictedSocialField]} readOnly={readOnly} />
          <SocialImageInfo />
        </div>
        <div id="seo-panel-schema" role="tabpanel" aria-labelledby="seo-tab-schema" hidden={activeTab !== 'schema'}>
          <SchemaDisplay />
        </div>
      </div>
    </section>
  )
}
