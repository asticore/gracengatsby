'use client'

import React from 'react'

import { useDocumentInfo } from '@/admin/context/DocumentInfoContext'

const buttonClass =
  'cursor-pointer rounded-[5px] border border-[var(--theme-elevation-150,#cac7d1)] bg-transparent px-[9px] py-[4px] text-[12px] text-inherit hover:border-[#2e3192]'

/** Export the open site template as a JSON file. The Templates hub has the import; this is the export for one template. */
export const ExportTemplateLink: React.FC = () => {
  const { id: docId } = useDocumentInfo()
  const urlId = typeof window !== 'undefined' ? /site-templates\/(\d+)/.exec(window.location.pathname)?.[1] : undefined
  const exportId = docId ?? urlId
  if (exportId === undefined) return null
  return (
    <div style={{ marginBottom: 8 }}>
      <a className={buttonClass} href={`/api/admin-template-io?id=${exportId}`} download>
        Export this template
      </a>
    </div>
  )
}

export default ExportTemplateLink
