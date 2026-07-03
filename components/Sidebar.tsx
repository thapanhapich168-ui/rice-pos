'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  // Navigation paths logically arranged by business workflow
  const menuItems = [
    // 1. Daily Operations
    { label: '📊 Dashboard', href: '/dashboard' },
    { label: '🛒 POS System', href: '/pos' },
    { label: '🚚 Delivery & Credit', href: '/delivery' },
    
    // 2. Money & Inventory
    { label: '💵 Expense & Payroll', href: '/expense' },
    { label: '🌾 Rice Control', href: '/rice' },
    { label: '🧮 Mix Calculator', href: '/calculator' },
    
    // 3. Records & Accounting
    { label: '🖼️ Invoice Gallery', href: '/invoices' },
    { label: '🧾 COGS Accounting', href: '/cogs-report' },
    
    // 4. Databases & Config
    { label: '👥 Customer Database', href: '/customerdatabase' },
    { label: '💼 Master Biz Database', href: '/bizdatabase' },
    { label: '⚙️ Settings', href: '/settings' }
  ]

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

  if (pathname === '/') return null;

  return (
    <>
      {/* MOBILE BACKDROP */}
      <div 
        className={`sidebar-backdrop ${isOpen ? 'open' : ''}`} 
        onClick={() => setIsOpen(false)} 
      />

      {/* FIXED BURGER BUTTON (Guaranteed Hardware Clearance) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          top: '55px', /* FIXED: Safely below all iOS notches, clocks, and battery icons */
          left: '20px',
          zIndex: 1001,
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
          boxShadow: isOpen ? 'none' : '0 2px 8px rgba(0,0,0,0.2)'
        }}
        aria-label="Toggle Navigation Sidebar"
      >
        ☰
      </button>

      {/* SIDEBAR CONTAINER */}
      <div className={`sidebar-wrapper ${isOpen ? 'open' : 'closed'}`}>
        
        {/* TOP SECTION: BRAND & LINKS */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', minHeight: '42px', marginBottom: '30px', paddingLeft: '45px' }}>
            <h2 style={{ margin: 0, whiteSpace: 'nowrap', fontSize: '20px' }}>🌾 Rice POS</h2>
          </div>
          
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {menuItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link 
                  key={item.href} 
                  href={item.href}
                  onClick={() => setIsOpen(false)} 
                  style={{
                    color: 'white',
                    textDecoration: 'none',
                    fontSize: '14px',
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

      {/* SIDEBAR RESPONSIVE & MOBILE PHYSICS */}
      <style jsx>{`
        .sidebar-backdrop {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.5);
          z-index: 999;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s ease;
        }

        .sidebar-wrapper {
          background: #111827;
          color: white;
          height: 100dvh;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          box-sizing: border-box;
          transition: all 0.3s ease-in-out;
          overflow-x: hidden;
          overflow-y: auto;
          z-index: 1000;
        }

        .sidebar-wrapper.closed {
          width: 0px;
          min-width: 0px;
          opacity: 0;
          pointer-events: none;
          padding: 0px;
        }

        .sidebar-wrapper.open {
          width: 240px;
          min-width: 240px;
          opacity: 1;
          pointer-events: auto;
          padding: max(15px, env(safe-area-inset-top, 15px)) 20px max(20px, env(safe-area-inset-bottom, 20px)) 20px;
          box-shadow: 4px 0 10px rgba(0, 0, 0, 0.1);
        }

        @media (min-width: 1024px) {
          .sidebar-wrapper {
            position: sticky;
            top: 0;
            left: 0;
          }
          .sidebar-backdrop {
            display: none;
          }
        }

        @media (max-width: 1023px) {
          .sidebar-wrapper {
            position: fixed;
            top: 0;
            left: 0;
          }
          .sidebar-backdrop.open {
            opacity: 1;
            pointer-events: auto;
          }
        }
      `}</style>
    </>
  )
}