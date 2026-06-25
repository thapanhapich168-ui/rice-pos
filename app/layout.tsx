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
      {/* 1. We lock the BODY to the exact size of the monitor (100vh) so the Sidebar never moves.
        2. We use 'display: flex' to put the Sidebar on the left, and the pages on the right.
      */}
      <body style={{ display: 'flex', margin: 0, padding: 0, width: '100vw', height: '100vh', overflow: 'hidden' }}>
        
        <Sidebar />

        {/* 3. This MAIN tag wraps all your pages (POS, Calculator, Ledgers). 
          4. 'overflowY: auto' is the magic command that gives every page its own scrollbar!
        */}
        <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', height: '100vh', background: '#f8fafc' }}>
          {children}
        </main>

      </body>
    </html>
  )
}