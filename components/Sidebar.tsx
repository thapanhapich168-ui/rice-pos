'use client'

import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useUserRole } from '@/lib/useUserRole'

interface MenuItem {
  label: string;
  href: string;
  adminOnly: boolean;
}

const defaultMenuItems: MenuItem[] = [
  { label: '📊 Dashboard', href: '/dashboard', adminOnly: true },
  { label: '🛒 POS System', href: '/pos', adminOnly: false },
  { label: '🚚 Delivery & Credit', href: '/delivery', adminOnly: false },
  { label: '💵 Expense & Payroll', href: '/expense', adminOnly: false },
  { label: '🌾 Rice Control', href: '/rice', adminOnly: false },
  { label: '🧮 Mix Calculator', href: '/calculator', adminOnly: false },
  { label: '🖼️ Invoice Gallery', href: '/invoices', adminOnly: false },
  { label: '🧾 COGS Accounting', href: '/cogs-report', adminOnly: true },
  { label: '🧑‍🌾 Customer Database', href: '/customerdatabase', adminOnly: false },
  { label: '🔐 Master Biz Database', href: '/bizdatabase', adminOnly: false },
  { label: '🛠️ Dev Test', href: '/dev-test', adminOnly: true },
  { label: '⚙️ Settings', href: '/settings', adminOnly: true }
]

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(false)
  const [menuItems, setMenuItems] = useState<MenuItem[]>(defaultMenuItems)
  const pathname = usePathname()
  const router = useRouter()
  const { role, loadingRole } = useUserRole();

  const sidebarRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem('sidebar_menu_order')
    if (saved) {
      try {
        const savedOrder = JSON.parse(saved)
        const sorted = [...defaultMenuItems].sort((a, b) => {
          const idxA = savedOrder.indexOf(a.label)
          const idxB = savedOrder.indexOf(b.label)
          if (idxA === -1 && idxB === -1) return 0
          if (idxA === -1) return 1
          if (idxB === -1) return -1
          return idxA - idxB
        })
        setMenuItems(sorted)
      } catch (e) {
      }
    }
  }, [])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.push('/')
      }
    })
    return () => subscription.unsubscribe()
  }, [router])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        isOpen && 
        sidebarRef.current && 
        !sidebarRef.current.contains(event.target as Node) &&
        buttonRef.current && 
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', index.toString())
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    const sourceIndex = parseInt(e.dataTransfer.getData('text/plain'), 10)
    if (isNaN(sourceIndex) || sourceIndex === targetIndex) return

    const newItems = [...menuItems]
    const [draggedItem] = newItems.splice(sourceIndex, 1)
    newItems.splice(targetIndex, 0, draggedItem)

    setMenuItems(newItems)
    localStorage.setItem('sidebar_menu_order', JSON.stringify(newItems.map(i => i.label)))
  }

  if (pathname === '/') return null;

  return (
    <>
      <div 
        className={`sidebar-backdrop ${isOpen ? 'open' : ''}`} 
        onClick={() => setIsOpen(false)} 
      />

      <button
        ref={buttonRef} 
        className="burger-btn"
        onClick={() => setIsOpen(!isOpen)}
        style={{ boxShadow: isOpen ? 'none' : '0 2px 8px rgba(0,0,0,0.2)' }}
        aria-label="Toggle Navigation Sidebar"
      >
        ☰
      </button>

      <div 
        ref={sidebarRef} 
        className={`sidebar-wrapper ${isOpen ? 'open' : 'closed'}`}
      >
        <div>
          {/* 🔥 FIX: Extracted to responsive CSS class for perfect math alignment */}
          <div className="sidebar-header">
            <h2 style={{ margin: 0, whiteSpace: 'nowrap', fontSize: '20px', lineHeight: 1 }}>🌾 Rice POS</h2>
          </div>
          
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {menuItems.map((item, index) => {
              const isAllowed = !item.adminOnly || (!loadingRole && role === 'admin');
              if (!isAllowed) return null;

              const isActive = pathname === item.href
              
              return (
                <div
                  key={item.href}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, index)}
                  style={{ cursor: 'grab', userSelect: 'none' }}
                  title="Drag up or down to reorder"
                >
                  <Link 
                    href={item.href}
                    onClick={() => setIsOpen(false)} 
                    draggable={false}
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
                </div>
              )
            })}
          </nav>
        </div>

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

      <style jsx>{`
        /* 🔥 NEW: Exact alignment matching the Dashboard/Customer page headers */
        .burger-btn {
          position: fixed;
          top: max(20px, env(safe-area-inset-top, 20px));
          left: max(24px, env(safe-area-inset-left, 24px));
          z-index: 1001;
          background: #111827;
          color: white;
          border: none;
          border-radius: 6px;
          width: 42px;
          height: 42px;
          cursor: pointer;
          font-size: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0; /* Ensures perfect square without stretching */
          box-sizing: border-box;
          outline: none;
        }

        .sidebar-header {
          display: flex;
          align-items: center;
          height: 42px; /* Matches exact desktop burger height */
          margin-bottom: 32px;
          margin-left: 54px; /* 42px button + 12px exact gap */
        }

        .sidebar-backdrop {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.5);
          z-index: 999;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s ease;
          touch-action: none;
        }

        .sidebar-wrapper {
          background: #111827;
          color: white;
          height: 100%; 
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
          width: 250px;
          min-width: 250px;
          opacity: 1;
          pointer-events: auto;
          /* Matches exact Desktop layout padding */
          padding: max(20px, env(safe-area-inset-top, 20px)) 24px 24px 24px;
          box-shadow: 4px 0 10px rgba(0, 0, 0, 0.1);
        }

        @media (min-width: 1024px) {
          .sidebar-wrapper {
            position: sticky;
            top: 0;
            left: 0;
            height: 100vh; 
          }
          .sidebar-backdrop {
            display: none;
          }
        }

        @media (max-width: 1023px) {
          .burger-btn {
            left: max(16px, env(safe-area-inset-left, 16px));
            width: 44px;
            height: 44px;
          }
          .sidebar-header {
            height: 44px; /* Matches exact mobile burger height */
            margin-left: 56px; /* 44px button + 12px exact gap */
          }
          .sidebar-wrapper {
            position: fixed;
            top: 0;
            left: 0;
          }
          .sidebar-wrapper.open {
             /* Matches exact Mobile layout padding */
             padding: max(20px, env(safe-area-inset-top, 20px)) 16px 16px 16px;
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