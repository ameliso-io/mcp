'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div style={styles.container}>
      <p style={styles.message}>{error.message || 'Something went wrong.'}</p>
      <button style={styles.button} onClick={reset}>
        Try again
      </button>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '16px',
    padding: '48px',
    color: '#dc2626',
  },
  message: {
    fontSize: '14px',
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
