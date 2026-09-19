import { Sidebar } from './Sidebar/Sidebar'
import { MapStage } from './Stage/MapStage'
import { Timeline } from './Timeline/Timeline'
import styles from './App.module.css'

export function App() {
  return (
    <div className={styles.app}>
      <Sidebar />
      <main className={styles.main}>
        <MapStage />
        <Timeline />
      </main>
    </div>
  )
}
