'use client'

import { useAtom } from 'jotai'
import { adminViewAtom } from '@/admin/state'
import styles from './AdminNav.module.css'

const navItems = [
  { id: 'roles', label: 'Roles' },
  { id: 'settings', label: 'Settings' },
  { id: 'header-footer', label: 'Header & Footer' },
]

export function AdminNav() {
  const [currentView, setView] = useAtom(adminViewAtom)

  return (
    <nav className={styles.nav}>
      <div className={styles.logo}>Admin Panel</div>
      <ul className={styles.items}>
        {navItems.map((item) => (
          <li key={item.id}>
            <button
              className={`${styles.item} ${currentView === item.id ? styles.active : ''}`}
              onClick={() => setView(item.id)}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
