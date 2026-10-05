'use client'

import React, { useState } from 'react'
import styles from './SettingsPageView.module.css'

export function SettingsPageView() {
  const [settings, setSettings] = useState({
    site_title: '',
    site_description: '',
    site_url: '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.currentTarget
    setSettings((prev) => ({ ...prev, [name]: value }))
  }

  const handleSave = () => {
    // Save settings
    console.log('Settings saved:', settings)
  }

  return (
    <div className={styles.container}>
      <h1>Settings</h1>
      <form className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="site_title">Site Title</label>
          <input
            id="site_title"
            name="site_title"
            type="text"
            value={settings.site_title}
            onChange={handleChange}
            placeholder="My Awesome Site"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="site_description">Site Description</label>
          <input
            id="site_description"
            name="site_description"
            type="text"
            value={settings.site_description}
            onChange={handleChange}
            placeholder="A brief description of your site"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="site_url">Site URL</label>
          <input
            id="site_url"
            name="site_url"
            type="url"
            value={settings.site_url}
            onChange={handleChange}
            placeholder="https://example.com"
          />
        </div>
        <button type="button" onClick={handleSave} className={styles.saveButton}>
          Save Settings
        </button>
      </form>
    </div>
  )
}
