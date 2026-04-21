import { marked } from 'marked'
import { useEffect } from 'react'

const STYLE_ID = 'ameliso-md-styles'

const CSS = `
.md-body h1,.md-body h2,.md-body h3{margin:.6em 0 .3em;font-weight:700;line-height:1.3}
.md-body h1{font-size:1.2em}.md-body h2{font-size:1.05em}.md-body h3{font-size:.95em;color:#334155}
.md-body p{margin:.3em 0}
.md-body ol,.md-body ul{padding-left:1.4em;margin:.3em 0}
.md-body li{margin:.15em 0}
.md-body code{background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:.9em;font-family:monospace}
.md-body pre{background:#f1f5f9;padding:10px 14px;border-radius:6px;overflow-x:auto;margin:.4em 0}
.md-body pre code{background:none;padding:0}
.md-body strong{font-weight:700}.md-body em{font-style:italic}
.md-body hr{border:none;border-top:1px solid #e2e8f0;margin:.5em 0}
`

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return
  const s = document.createElement('style')
  s.id = STYLE_ID
  s.textContent = CSS
  document.head.appendChild(s)
}

interface Props {
  body: string
  maxHeight?: string
}

export default function MarkdownBody({ body, maxHeight }: Props) {
  useEffect(injectStyles, [])
  const html = marked(body, { async: false }) as string
  return (
    <div
      className="md-body"
      dangerouslySetInnerHTML={{ __html: html }}
      style={{
        fontSize: '13px',
        lineHeight: '1.6',
        color: '#1e293b',
        maxHeight: maxHeight ?? 'none',
        overflowY: maxHeight ? 'auto' : undefined,
      }}
    />
  )
}
