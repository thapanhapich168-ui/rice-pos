import type { Metadata, Viewport } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import SplashScreen from '@/components/SplashScreen'

export const metadata: Metadata = {
  title: 'Angkor Radiant Rice POS',
  description: 'Inventory and POS Management System',
}

// 🔥 THIS KILLS THE GREY SCREEN: Paints notch/bottom area & locks zoom
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
          {/* Changed 100dvh to 100% to stop it from pushing out of bounds */}
          <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
            
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