import styles from '../../app.module.css'

export default function Loading() {
  return (
    <div className={styles.centered}>
      <div className={styles.spinner} />
    </div>
  )
}
