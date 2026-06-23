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
        /* Global classic font stack */
        fontFamily: '"Times New Roman", Times, "Baskerville", "Playfair Display", serif',
        color: '#333',
        overflow: 'hidden' // Prevents browser-level scrollbars
      }}>
        
        {/* Main Application Flex Frame */}
        <div style={{ 
          display: 'flex', 
          width: '100vw', 
          height: '100vh', 
          overflow: 'hidden' 
        }}>
          
          {/* Your Shared Sidebar Component */}
          <Sidebar />
          
          {/* Shared Dynamic Content Panel Area */}
          <main style={{ 
            flex: 1, 
            height: '100vh', 
            overflow: 'hidden', // Changed from 'auto' to 'hidden' to let sub-pages handle their own scroll
            position: 'relative',
            background: '#ffffff'
            /* Removed global padding here to prevent layout overflow on POS/Dashboard */
          }}>
            {children}
          </main>
          
        </div>
      </body>
    </html>
  )
}