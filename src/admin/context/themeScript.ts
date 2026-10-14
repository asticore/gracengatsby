/**
 * Pre-paint admin theme script (wave 16).
 *
 * ThemeContext applies the saved light/dark preference in a React effect,
 * which runs after the first paint. A light-theme user on a dark OS therefore
 * saw a dark flash. This module holds the tiny synchronous script that RootLayout
 * renders into <head> so the attribute is set before <body> paints.
 *
 * Plain .ts on purpose (no 'use client'): RootLayout is a server component and
 * must be able to import these constants. Keep this file pure ASCII.
 */

export const THEME_STORAGE_KEY = 'ac-theme'

/**
 * Script text injected as-is. It reads localStorage inside try/catch so a
 * blocked or throwing storage (private window, disabled site data) falls back
 * to 'auto'. When the script and ThemeContext disagree, this script wins
 * because it runs first.
 */
export const THEME_SCRIPT = [
  '(function () {',
  '  var stored = null;',
  '  try {',
  "    stored = window.localStorage.getItem('" + THEME_STORAGE_KEY + "');",
  '  } catch (e) {',
  '    stored = null;',
  '  }',
  '  var root = document.documentElement;',
  "  if (stored === 'light' || stored === 'dark') {",
  '    root.dataset.theme = stored;',
  '  } else {',
  '    delete root.dataset.theme;',
  '  }',
  '})();',
].join('\n')
