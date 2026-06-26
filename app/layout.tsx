import './globals.css'
import Sidebar from '@/components/Sidebar'

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
      <body style={{ display: 'flex', margin: 0, padding: 0, width: '100vw', height: '100vh', overflow: 'hidden', background: '#f8fafc' }}>
        
        {/* The Sidebar handles its own hiding logic now! */}
        <Sidebar />

        <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', height: '100vh' }}>
          {children}
        </main>

      </body>
    </html>
  )
}