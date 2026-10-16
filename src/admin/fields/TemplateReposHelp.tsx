'use client'

import React from 'react'

/** Short explanation of the template repository layout, shown above the repository list. */
export const TemplateReposHelp: React.FC = () => (
  <div style={{ margin: '0 0 16px', padding: '10px 12px', borderLeft: '3px solid #1d4ed8', fontSize: 13, lineHeight: 1.5 }}>
    <p style={{ margin: '0 0 6px' }}>
      Each repository needs a <code>manifest.json</code> at its top (or in the folder you name below) listing the templates. Every template
      lives in <code>templates/&lt;slug&gt;/</code> with a <code>template.json</code> and an optional <code>preview.png</code>.
    </p>
    <a href="https://github.com/asticore/gracengatsby#template-repositories" target="_blank" rel="noreferrer">
      Read the Template repositories guide
    </a>
  </div>
)

export default TemplateReposHelp
