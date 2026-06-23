import Sidebar from '@/components/Sidebar'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ 
        margin: 0, 
        padding: 0, 
        background: '#ffffff',
        // Set Arial globally for every page
        fontFamily: 'Arial, sans-serif',
        color: '#333',
        overflow: 'hidden' 
      }}>
        
        <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
          
          <Sidebar />
          
          <main style={{ 
            flex: 1, 
            height: '100vh', 
            overflow: 'hidden', 
            position: 'relative',
            background: '#ffffff' 
          }}>
            {children}
          </main>
          
        </div>
      </body>
    </html>
  )
}