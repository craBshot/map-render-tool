import { Sidebar } from './Sidebar/Sidebar'
import { MapStage } from './Stage/MapStage'
import styles from './App.module.css'

export function App() {
  return (
    <div className={styles.app}>
      <Sidebar />
      <main className={styles.main}>
        <MapStage />
      </main>
    </div>
  )
}
