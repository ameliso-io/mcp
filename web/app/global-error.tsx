'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body>
        <div style={styles.container}>
          <h2 style={styles.heading}>Something went wrong</h2>
          <p style={styles.message}>{error.message}</p>
          <button style={styles.button} onClick={reset}>
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    gap: '16px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#dc2626',
  },
  heading: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#1a1a1a',
  },
  message: {
    fontSize: '14px',
    color: '#64748b',
  },
  button: {
    padding: '8px 16px',
    background: '#1e293b',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  },
}
