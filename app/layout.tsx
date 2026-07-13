import type { Metadata, Viewport } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import SplashScreen from '@/components/SplashScreen'

export const metadata: Metadata = {
  title: 'Angkor Radiant Rice POS',
  description: 'Inventory and POS Management System',
}

// 🔥 ADDED viewportFit: 'cover'
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#f8fafc',
  viewportFit: 'cover', 
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
              {children}
            </main>
          </div>
        </SplashScreen>
      </body>
    </html>
  )
}