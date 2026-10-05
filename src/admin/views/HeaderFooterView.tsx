'use client'

import React, { useState } from 'react'
import styles from './HeaderFooterView.module.css'

interface HeaderFooterSettings {
  header_html: string
  footer_html: string
}

export function HeaderFooterView() {
  const [settings, setSettings] = useState<HeaderFooterSettings>({
    header_html: '',
    footer_html: '',
  })

  const handleChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
    key: keyof HeaderFooterSettings,
  ) => {
    const { value } = e.currentTarget
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    console.log('Header/Footer saved:', settings)
  }

  return (
    <div className={styles.container}>
      <h1>Header & Footer</h1>
      <form className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="header_html">Header HTML</label>
          <textarea
            id="header_html"
            value={settings.header_html}
            onChange={(e) => handleChange(e, 'header_html')}
            placeholder="Enter header HTML content..."
            rows={6}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="footer_html">Footer HTML</label>
          <textarea
            id="footer_html"
            value={settings.footer_html}
            onChange={(e) => handleChange(e, 'footer_html')}
            placeholder="Enter footer HTML content..."
            rows={6}
          />
        </div>
        <button type="button" onClick={handleSave} className={styles.saveButton}>
          Save Header & Footer
        </button>
      </form>
    </div>
  )
}
