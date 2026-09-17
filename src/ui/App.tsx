import { Sidebar } from './Sidebar/Sidebar'
import { MapStage } from './Stage/MapStage'
import { PlaybackBar } from './Stage/PlaybackBar'
import styles from './App.module.css'

export function App() {
  return (
    <div className={styles.app}>
      <Sidebar />
      <main className={styles.main}>
        <MapStage />
        <PlaybackBar />
      </main>
    </div>
  )
}
