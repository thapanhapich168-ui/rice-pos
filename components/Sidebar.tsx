'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(true)
  const pathname = usePathname()
  const router = useRouter()

  // Define your 7 key navigation paths
  const menuItems = [
    { label: '📊 Dashboard', href: '/dashboard' },
    { label: '🛒 POS System', href: '/pos' },
    { label: '📦 Products Admin', href: '/admin' },
    { label: '📈 Detailed Reports', href: '/reports' },
    { label: '🌾 Rice Control', href: '/rice' },
    { label: '👥 Customer Database', href: '/customer' },
    { label: '💵 Expenses & Ledger', href: '/expense' },
  ]

  // Automatically secure screens: if user logs out, boot them back to root login page
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.push('/')
      }
    })
    return () => subscription.unsubscribe()
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <>
      {/* FIXED BURGER BUTTON (Always available top-left) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          top: '15px',
          left: '15px',
          zIndex: 100,
          background: '#111827',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          padding: '10px 12px',
          cursor: 'pointer',
          fontSize: '18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
        }}
        aria-label="Toggle Navigation Sidebar"
      >
        {isOpen ? '❌' : '☰'}
      </button>

      {/* SIDEBAR CONTAINER */}
      <div
        style={{
          width: isOpen ? '240px' : '0px',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          background: '#111827',
          color: 'white',
          height: '100vh',
          position: 'sticky',
          top: 0,
          left: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: isOpen ? '75px 20px 20px 20px' : '0px',
          boxSizing: 'border-box',
          transition: 'all 0.3s ease-in-out',
          overflowX: 'hidden',
          zIndex: 90,
          boxShadow: isOpen ? '4px 0 10px rgba(0,0,0,0.1)' : 'none'
        }}
      >
        {/* TOP SECTION: BRAND & LINKS */}
        <div>
          <h2 style={{ marginBottom: '30px', whiteSpace: 'nowrap', fontSize: '22px' }}>🌾 Rice POS</h2>
          
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {menuItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link 
                  key={item.href} 
                  href={item.href}
                  style={{
                    color: 'white',
                    textDecoration: 'none',
                    fontSize: '15px',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    display: 'block',
                    whiteSpace: 'nowrap',
                    background: isActive ? '#1f2937' : 'transparent',
                    borderLeft: isActive ? '4px solid #38bdf8' : '4px solid transparent',
                    fontWeight: isActive ? 'bold' : 'normal',
                    transition: 'background 0.2s'
                  }}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>

        {/* BOTTOM SECTION: LOGOUT */}
        <button 
          onClick={handleLogout} 
          style={{
            background: '#b91c1c',
            color: 'white',
            border: 'none',
            padding: '12px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
            width: '100%',
            transition: 'background 0.2s'
          }}
        >
          🚪 Log Out
        </button>
      </div>
    </>
  )
}