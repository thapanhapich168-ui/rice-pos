import './globals.css'
import Sidebar from '@/components/Sidebar'
import SplashScreen from '@/components/SplashScreen'
import PullToRefresh from '@/components/PullToRefresh' // 👈 Added the import

export const metadata = {
  title: 'Angkor Radiant Rice POS',
  description: 'Inventory and POS Management System',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <SplashScreen>
          <div style={{ display: 'flex', width: '100%', height: '100dvh', overflow: 'hidden' }}>
            
            <Sidebar />

            <main className="app-scroller">
              {/* 👈 WRAPPED THE CHILDREN IN THE PULL-TO-REFRESH COMPONENT */}
              <PullToRefresh>
                {children}
              </PullToRefresh>
            </main>
            
          </div>
        </SplashScreen>
      </body>
    </html>
  )
}