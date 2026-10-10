'use client'

import React from 'react'
import { FieldLabel, useFormFields } from '@/engine/ui'
import type { Field } from '@/engine'
import { fieldLabel } from '@/admin/fields/shared'

import { describeSiteFiles, type SiteFileState, type SiteFilesSettings } from '../siteFiles'
import './SiteFilesField.css'

/**
 * The "Site files" card at the top of the group. Shows each generated file with
 * its live address and whether it is being served, computed from the values in
 * the form right now, so an edit shows its effect before anything is saved.
 *
 * Client-only and reads sibling fields by path; it does not touch the engine.
 */

const SITE_FILE_KEYS = [
  'llmsEnabled',
  'llmsIncludeCollections',
  'llmsExcludePaths',
  'llmsTitle',
  'llmsSummary',
  'securityTxtContact',
  'securityTxtExpires',
  'securityTxtPolicy',
  'securityTxtLanguages',
  'securityTxtCustom',
  'adsTxt',
  'appAdsTxt',
  'humansTxt',
  'manifestName',
  'manifestShortName',
  'manifestThemeColor',
  'manifestBackgroundColor',
  'manifestDisplay',
] as const

const STATE_LABEL: Record<SiteFileState, string> = {
  served: 'Served',
  off: 'Off',
  empty: 'Empty',
}

type SiteFilesFieldProps = {
  field: Field
  path: string
  readOnly?: boolean
}

export function SiteFilesField({ field }: SiteFilesFieldProps) {
  const values = useFormFields(([fields]) =>
    Object.fromEntries(SITE_FILE_KEYS.map((key) => [key, fields?.[`siteFiles.${key}`]?.value])),
  ) as SiteFilesSettings

  const rows = describeSiteFiles(values)

  return (
    <div className="site-files">
      <FieldLabel label={fieldLabel(field)} />
      <p className="site-files__intro">
        These files are generated from the settings below. Each address opens the live file. Save first to see the
        result on the live site.
      </p>
      <div className="site-files__scroll">
        <table className="site-files__table">
          <thead>
            <tr>
              <th scope="col">File</th>
              <th scope="col">Address</th>
              <th scope="col">Status</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.label}</td>
                <td>
                  <a href={row.path} target="_blank" rel="noreferrer">
                    {row.path}
                  </a>
                </td>
                <td>
                  <span className={`site-files__status site-files__status--${row.state}`}>{STATE_LABEL[row.state]}</span>
                </td>
                <td className="site-files__note">{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="site-files__footnote">
        An .htaccess file does not work on Cloudflare Workers, so it is not offered. The server response headers and
        blocked paths settings below do the same job.
      </p>
    </div>
  )
}
