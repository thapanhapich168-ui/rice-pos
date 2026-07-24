import type { Metadata, Viewport } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import SplashScreen from '@/components/SplashScreen'
import { ToastProvider } from '@/components/ToastProvider'

export const metadata: Metadata = {
  title: 'Angkor Radiant Rice POS',
  description: 'Inventory and POS Management System',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
  },
}

// 🔥 CRITICAL: Forces Safari to paint the notch and bottom bar white/light-grey
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#f8fafc',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <SplashScreen>
            {/* Changed 100dvh to 100% so it perfectly fits inside the pinned body */}
            <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
              
              <Sidebar />

              <main className="app-scroller">
                {children}
              </main>
              
            </div>
          </SplashScreen>
        </ToastProvider>
      </body>
    </html>
  )
}