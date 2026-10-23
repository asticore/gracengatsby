// @vitest-environment jsdom
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import { act } from 'react'

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/visual-editor/collection/pages/2', useRouter: () => ({ push() {}, refresh() {} }) }))

describe('admin shell + visual editor loading state hydrate cleanly', () => {
  it('logs no hydration errors (empty and populated storage, Mac, mobile)', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as any
    const { load } = await import('./admin-hydration-tree')
    const tree = await load()
    const html = renderToString(tree())
    document.documentElement.innerHTML = html.replace(/^<html[^>]*>/,'').replace(/<\/html>$/,'')
    const errs: any[] = []
    localStorage.setItem('ac-nav-collapsed','1'); localStorage.setItem('ac-theme','dark'); localStorage.setItem('ve-x','1'); Object.defineProperty(navigator,'platform',{value:'MacIntel'}); window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as any
    const spy = vi.spyOn(console, 'error').mockImplementation((...a) => { errs.push(a) })
    await act(async () => { hydrateRoot(document, tree()) })
    spy.mockRestore()
    expect(errs.filter((e) => /hydrat|did not match|#418/i.test(e.map(String).join(' ')))).toEqual([])
  })
})
