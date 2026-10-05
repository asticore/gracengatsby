'use client'

import { useAtom } from 'jotai'
import React from 'react'
import { AdminNav } from '@/components/admin/nav/AdminNav'
import { adminViewAtom } from '@/admin/state'
import { RolesView } from './RolesView'
import { SettingsPageView } from './SettingsPageView'
import { HeaderFooterView } from './HeaderFooterView'
import styles from './RootPage.module.css'

const views: Record<string, React.ComponentType> = {
  roles: RolesView,
  settings: SettingsPageView,
  'header-footer': HeaderFooterView,
}

export function RootPage() {
  const [currentView] = useAtom(adminViewAtom)

  const ViewComponent = views[currentView] || (() => <div>View not found</div>)

  return (
    <div className={styles.root}>
      <AdminNav />
      <div className={styles.content}>
        <ViewComponent />
      </div>
    </div>
  )
}
