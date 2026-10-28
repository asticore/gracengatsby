// @vitest-environment node
// The builder's Translate deep link: ?lang=<locale>&translate=1 selects the language. Pure.
import { describe, expect, it } from 'vitest'

import { resolveTranslateParams, translateEditorPath } from '@/views/visualEditor/translateParams'
import { builderTranslateHref } from '@/features/multilingual/documentRows'

const TARGETS = ['fr', 'de']

describe('resolveTranslateParams', () => {
  it('selects the language named by lang and turns translate on', () => {
    expect(resolveTranslateParams('?lang=de&translate=1', TARGETS, 'en')).toEqual({ translate: true, locale: 'de' })
  })

  it('accepts translate=true as well as 1', () => {
    expect(resolveTranslateParams('?lang=fr&translate=true', TARGETS, 'en')).toEqual({ translate: true, locale: 'fr' })
  })

  it('ignores a language the site does not offer rather than trusting it', () => {
    expect(resolveTranslateParams('?lang=xx&translate=1', TARGETS, 'en')).toEqual({ translate: true, locale: 'fr' })
    expect(resolveTranslateParams('?lang=xx', TARGETS, 'en')).toEqual({ translate: false, locale: null })
  })

  it('does not switch to the default language through the deep link', () => {
    expect(resolveTranslateParams('?lang=en&translate=1', TARGETS, 'en')).toEqual({ translate: true, locale: 'fr' })
  })

  it('leaves the normal builder alone when there are no params', () => {
    expect(resolveTranslateParams('', TARGETS, 'en')).toEqual({ translate: false, locale: null })
  })

  it('with no target languages, translate has nothing to select', () => {
    expect(resolveTranslateParams('?translate=1', [], 'en')).toEqual({ translate: true, locale: null })
  })
})

describe('deep link URLs', () => {
  it('the table and the builder agree on the URL shape', () => {
    expect(translateEditorPath('pages', '12', 'fr')).toBe('/admin/visual-editor/collection/pages/12?lang=fr&translate=1')
    expect(builderTranslateHref('pages', '12', 'fr')).toBe(translateEditorPath('pages', '12', 'fr'))
  })

  it('round-trips through the builder resolver', () => {
    const href = builderTranslateHref('posts', '7', 'de')
    const search = href.slice(href.indexOf('?'))
    expect(resolveTranslateParams(search, TARGETS, 'en')).toEqual({ translate: true, locale: 'de' })
  })
})
