/**
 * Tailwind v4's PostCSS plugin. No `content` globs to maintain here - v4
 * scans the module graph itself and picks up every class name string it can
 * reach from the files this config's directory roots.
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}

export default config
