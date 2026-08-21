import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import PushNotificationBanner from './PushNotificationBanner'
import styles from './AppLayout.module.css'

export default function AppLayout() {
  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <PushNotificationBanner />
        <Outlet />
      </main>
    </div>
  )
}
