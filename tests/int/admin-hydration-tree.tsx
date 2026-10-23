import React from 'react'
export async function load() {
    const { DocumentEventsProvider, NavProvider, ThemeProvider } = await import('@/admin/context')
    const { AdminShell } = await import('@/admin/ui/AdminShell')
    const { NavToggler } = await import('@/admin/ui/NavToggler')
    const { ThemeToggler } = await import('@/admin/ui/ThemeToggler')
    const { SessionWatch } = await import('@/admin/SessionWatch')
    const nav = await import('@/components/admin/nav/AdminNavClient')
    const { AsticoreSaasComingSoon } = await import('@/components/branding/AsticoreSaasComingSoon')
    const { Logout } = await import('@/admin/ui/Logout')
    const { VisualEditorView } = await import('@/views/VisualEditor')
    const { THEME_SCRIPT } = await import('@/admin/context/themeScript')
    const tree = () => (
      <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head><body><DocumentEventsProvider><NavProvider><ThemeProvider>
        <SessionWatch />
        <AdminShell>
          <NavToggler /><ThemeToggler />
          <nav.AdminNavShell>
            <nav><nav.AdminNavDashboardLink href="/admin" />
            <nav.AdminNavClient groups={[{ label: 'Content', entities: [{ slug: 'pages', label: 'Pages', href: '/admin/collections/pages', id: 'nav-pages' }] } as any]} openGroups={{}} />
            <AsticoreSaasComingSoon /><Logout /></nav>
            <nav.AdminNavHamburger />
          </nav.AdminNavShell>
          <div className="admin-shell__main"><main><VisualEditorView /></main></div>
        </AdminShell>
      </ThemeProvider></NavProvider></DocumentEventsProvider></body></html>
    )
  return tree
}
