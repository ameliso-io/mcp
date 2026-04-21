"use client";

import DOMPurify from "dompurify";
import { marked } from "marked";
import { useMemo } from "react";
import styles from "./MarkdownBody.module.css";

interface Props {
  body: string;
  maxHeight?: string;
}

export default function MarkdownBody({ body, maxHeight }: Props) {
  const html = useMemo(() => {
    const raw = marked(body, { async: false }) as string;
    return DOMPurify.sanitize(raw);
  }, [body]);
  return (
    <div
      className={styles.body}
      dangerouslySetInnerHTML={{ __html: html }}
      style={maxHeight ? ({ "--md-max-height": maxHeight } as React.CSSProperties) : undefined}
    />
  );
}
