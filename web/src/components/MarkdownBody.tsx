'use client'

import { marked } from 'marked'
import './MarkdownBody.css'

interface Props {
  body: string
  maxHeight?: string
}

export default function MarkdownBody({ body, maxHeight }: Props) {
  const html = marked(body, { async: false }) as string
  return (
    <div
      className="md-body"
      dangerouslySetInnerHTML={{ __html: html }}
      style={maxHeight ? { '--md-max-height': maxHeight } as React.CSSProperties : undefined}
    />
  )
}
