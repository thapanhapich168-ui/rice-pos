// app/layout.tsx
import Sidebar from '@/components/Sidebar'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: '#ffffff' }}>
        
        {/* Main Application Flex Frame */}
        <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
          
          {/* Your Shared Sidebar Component */}
          <Sidebar />
          
          {/* Shared Dynamic Content Panel Area */}
          <main style={{ 
            flex: 1, 
            height: '100vh', 
            overflow: 'auto', 
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