'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'

// Translations Dictionary (Matching POS style system)
const t = {
  en: {
    dashboard: "📊 Dashboard",
    posSystem: "🛒 POS System",
    productsAdmin: "📦 Products Admin",
    detailedReports: "📈 Detailed Reports",
    riceControl: "🌾 Rice Control",
    customersDb: "👥 Customer Database",
    logout: "Logout",
  },
  kh: {
    dashboard: "📊 ផ្ទាំងគ្រប់គ្រង",
    posSystem: "🛒 ប្រព័ន្ធលក់ POS",
    productsAdmin: "📦 គ្រប់គ្រងទំនិញ",
    detailedReports: "📈 របាយការណ៍លម្អិត",
    riceControl: "🌾 គ្រប់គ្រងតម្លៃអង្ករ",
    customersDb: "👥 ទិន្នន័យអតិថិជន",
    logout: "ចាកចេញ",
  }
};

interface CustomerView {
  id: string;
  name: string;
  filterOwner?: 'Jing' | 'Pich' | 'Both' | 'All';
}

export default function CustomerDatabasePage() {
  const [customers, setCustomers] = useState<any[]>([])
  const [lang, setLang] = useState<'en' | 'kh'>('en')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Customer Type Filter State: 'All' | 'Retail' | 'Wholesale'
  const [customerTypeFilter, setCustomerTypeFilter] = useState<'All' | 'ហូប' | 'លក់បាយ' | 'លក់ត' | 'ធ្វើនំ' | 'អំណោយ'>('All')

  // Airtable Views State Configuration
  const [views, setViews] = useState<CustomerView[]>([
    { id: 'all', name: 'All Customers', filterOwner: 'All' },
    { id: 'jing', name: 'Jing’s Accounts', filterOwner: 'Jing' },
    { id: 'pich', name: 'Pich’s Accounts', filterOwner: 'Pich' },
  ])
  const [activeViewId, setActiveViewId] = useState<string>('all')
  const [showCreateViewModal, setShowCreateViewModal] = useState(false)
  const [newViewName, setNewViewName] = useState('')
  const [newViewFilter, setNewViewFilter] = useState<'Jing' | 'Pich' | 'Both' | 'All'>('All')

  // "Add New Customer" Form Modal States
  const [showAddModal, setShowAddModal] = useState(false)
  const [newCustomer, setNewCustomer] = useState({
  name: '',
  owner: 'Both',
  type: 'ហូប', // <--- Matches the new DB default
  phone: '',
  location: '',
  google_map: ''
})

  useEffect(() => {
    loadCustomers()
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setIsSidebarOpen(false)
    }
  }, [])

  async function loadCustomers() {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error && data) setCustomers(data)
  }

  // Handle custom view creation logic
  function handleCreateView(e: React.FormEvent) {
    e.preventDefault()
    if (!newViewName.trim()) return
    const newView: CustomerView = {
      id: `view_${Date.now()}`,
      name: newViewName,
      filterOwner: newViewFilter
    }
    setViews([...views, newView])
    setActiveViewId(newView.id)
    setNewViewName('')
    setShowCreateViewModal(false)
  }

  // Handle new customer submittal save profile
  async function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault()
    if (!newCustomer.name.trim()) return

    try {
      const { error } = await supabase
        .from('customers')
        .insert([{
          name: newCustomer.name,
          owner: newCustomer.owner, 
          type: newCustomer.type, // This now correctly uses the type selected in the modal
          phone: newCustomer.phone,
          location: newCustomer.location,
          google_map: newCustomer.google_map
        }])

      if (error) throw error

      setShowAddModal(false)
      // FIX: Reset to a valid category from your new list, not 'Retail'
      setNewCustomer({ name: '', owner: 'Both', type: 'ហូប', phone: '', location: '', google_map: '' })
      loadCustomers() 
    } catch (err: any) {
      alert(`Supabase Sink Error: ${err.message}`)
    }
  }

  // Determine current applied active filtering rules
  const currentActiveView = views.find(v => v.id === activeViewId)
  
  const filteredCustomers = customers.filter(c => {
    // 1. Filter by Account Owner Tab View
    if (currentActiveView?.filterOwner && currentActiveView.filterOwner !== 'All') {
      if (c.owner !== currentActiveView.filterOwner) return false
    }

    // 2. Filter by Customer Type Segment Badge
    if (customerTypeFilter !== 'All') {
      if (c.type !== customerTypeFilter) return false
    }

    // 3. Filter by Search Text String Query
    const searchString = searchQuery.toLowerCase()
    return (
      c.name?.toLowerCase().includes(searchString) ||
      c.phone?.toLowerCase().includes(searchString) ||
      c.location?.toLowerCase().includes(searchString)
    )
  })

  const currentT = t[lang];

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', fontFamily: 'Arial, sans-serif', background: '#ffffff', overflow: 'hidden' }}>
      
      {/* 1. SIDEBAR PANEL SHELL */}
      <div style={{
        width: isSidebarOpen ? '240px' : '0px',
        opacity: isSidebarOpen ? 1 : 0,
        visibility: isSidebarOpen ? 'visible' : 'hidden',
        background: '#111827',
        color: 'white',
        padding: isSidebarOpen ? '20px' : '0px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden',
        zIndex: 100
      }}>
        <div>
          <h2 style={{ marginBottom: 30, color: '#fff', fontSize: '20px', whiteSpace: 'nowrap' }}>🌾 Rice POS</h2>
          <p style={{ marginBottom: 20 }}><Link href="/" style={{ color: '#9ca3af', textDecoration: 'none' }}>{currentT.dashboard}</Link></p>
          <p style={{ marginBottom: 20 }}><Link href="/pos" style={{ color: '#9ca3af', textDecoration: 'none' }}>{currentT.posSystem}</Link></p>
          <p style={{ marginBottom: 20 }}><Link href="/admin" style={{ color: '#9ca3af', textDecoration: 'none' }}>{currentT.productsAdmin}</Link></p>
          <p style={{ marginBottom: 20 }}><Link href="/dashboard" style={{ color: '#9ca3af', textDecoration: 'none' }}>{currentT.detailedReports}</Link></p>
          <p style={{ marginBottom: 20 }}><Link href="/rice" style={{ color: '#9ca3af', textDecoration: 'none' }}>{currentT.riceControl}</Link></p>
          <p style={{ marginBottom: 20, fontWeight: 'bold' }}><Link href="/customerdatabase" style={{ color: '#38bdf8', textDecoration: 'none' }}>{currentT.customersDb}</Link></p>
        </div>
        <button 
          onClick={() => supabase.auth.signOut()} 
          style={{ background: 'transparent', color: 'red', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
        >
          🚪 {currentT.logout}
        </button>
      </div>

      {/* 2. MAIN HUB DATA VIEW AREA */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: '#ffffff', overflow: 'hidden' }}>
        
        {/* HEADER TOP OPERATIONS BAR */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #f3f4f6', background: '#ffffff', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', padding: '4px', color: '#b58a3d', display: 'flex', alignItems: 'center' }}
            >
              ☰
            </button>
            <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0, color: '#4a3b1b' }}>Customer Database</h1>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <input 
              type="text" 
              placeholder="🔍 Search accounts..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #dcd7cc', outline: 'none', fontSize: '14px', width: '220px' }}
            />
            <div style={{ background: '#f4f1ea', borderRadius: '20px', padding: '2px' }}>
              <button onClick={() => setLang('en')} style={{ border: 'none', background: lang === 'en' ? '#b58a3d' : 'transparent', color: lang === 'en' ? '#fff' : '#6b582f', padding: '4px 10px', borderRadius: '18px', fontWeight: 'bold', cursor: 'pointer', fontSize: '11px' }}>EN</button>
              <button onClick={() => setLang('kh')} style={{ border: 'none', background: lang === 'kh' ? '#b58a3d' : 'transparent', color: lang === 'kh' ? '#fff' : '#6b582f', padding: '4px 10px', borderRadius: '18px', fontWeight: 'bold', cursor: 'pointer', fontSize: '11px' }}>KH</button>
            </div>
            <button 
              onClick={() => setShowAddModal(true)}
              style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 14px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              ➕ Add Customer
            </button>
          </div>
        </header>

        {/* AIRTABLE-STYLE VIEW TABS BAR */}
        <div style={{ background: '#fcfbfa', borderBottom: '1px solid #eadeca', padding: '8px 20px 0 20px', display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', flexShrink: 0 }}>
          {views.map((v) => (
            <button
              key={v.id}
              onClick={() => setActiveViewId(v.id)}
              style={{
                background: activeViewId === v.id ? '#ffffff' : 'transparent',
                color: activeViewId === v.id ? '#b58a3d' : '#7c6a46',
                border: '1px solid #eadeca',
                borderBottom: activeViewId === v.id ? '1px solid #ffffff' : '1px solid #eadeca',
                padding: '8px 16px',
                borderRadius: '6px 6px 0 0',
                fontSize: '13px',
                fontWeight: activeViewId === v.id ? 'bold' : 'normal',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                position: 'relative',
                bottom: '-1px'
              }}
            >
              📋 {v.name}
            </button>
          ))}
          <button 
            onClick={() => setShowCreateViewModal(true)}
            style={{ background: 'none', border: '1px dashed #b58a3d', color: '#b58a3d', padding: '4px 10px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold', marginBottom: '4px' }}
          >
            ⚡ Create New View
          </button>
        </div>

        {/* INTERACTIVE CUSTOMER TYPE SUB-FILTER CONTROLS BAR */}
<div style={{ padding: '10px 20px', background: '#fcfbfa', borderBottom: '1px solid #eadeca', display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
  <span style={{ fontSize: '12px', color: '#8a7650', fontWeight: 'bold', marginRight: '8px' }}>Filter Segment:</span>
  
  <button
    onClick={() => setCustomerTypeFilter('All')}
    style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '20px', border: '1px solid #eadeca', cursor: 'pointer', fontWeight: 'bold', background: customerTypeFilter === 'All' ? '#b58a3d' : '#fff', color: customerTypeFilter === 'All' ? '#fff' : '#6b582f' }}
  >
    All Types ({customers.length})
  </button>

  {/* --- REPLACE THE RETAIL/WHOLESALE BUTTONS WITH THIS --- */}
  {(['ហូប', 'លក់បាយ', 'លក់ត', 'ធ្វើនំ', 'អំណោយ'] as const).map((typeItem) => (
    <button
      key={typeItem}
      onClick={() => setCustomerTypeFilter(typeItem)}
      style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '20px', border: '1px solid #eadeca', cursor: 'pointer', fontWeight: 'bold', background: customerTypeFilter === typeItem ? '#b58a3d' : '#fff', color: customerTypeFilter === typeItem ? '#fff' : '#6b582f' }}
    >
      🏷️ {typeItem} ({customers.filter(c => c.type === typeItem).length})
    </button>
  ))}
</div>

        {/* GRID SPREADSHEET CANVAS VIEW */}
        <div style={{ flex: 1, overflow: 'auto', background: '#ffffff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px', minWidth: '1100px' }}>
            <thead>
              <tr style={{ background: '#f9f8f6', borderBottom: '1px solid #eadeca', color: '#5c4d32' }}>
                <th style={{ padding: '12px', borderRight: '1px solid #f4f1ea', width: '150px' }}>Date Added</th>
                <th style={{ padding: '12px', borderRight: '1px solid #f4f1ea', width: '8px' }}>ID</th>
                <th style={{ padding: '12px', borderRight: '1px solid #f4f1ea', width: '220px' }}>Customer Name</th>
                <th style={{ padding: '12px', borderRight: '1px solid #f4f1ea', width: '110px' }}>Account Owner</th>
                <th style={{ padding: '12px', borderRight: '1px solid #f4f1ea', width: '12px' }}>Customer Type</th>
                <th style={{ padding: '12px', borderRight: '1px solid #f4f1ea', width: '140px' }}>Phone Number</th>
                <th style={{ padding: '12px', borderRight: '1px solid #f4f1ea', width: '200px' }}>Location</th>
                <th style={{ padding: '12px', borderRight: '1px solid #f4f1ea', width: '100px' }}>Google Map</th>
                <th style={{ padding: '12px' }}>Last Purchase Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '30px', textAlign: 'center', color: '#8a7650', background: '#ffffff' }}>
                    No record items found inside this grid selection sheet view.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f4f1ea' }} className="table-row">
                    <td style={{ padding: '10px 12px', borderRight: '1px solid #f4f1ea', color: '#666' }}>
                      {c.created_at ? new Date(c.created_at).toLocaleDateString('en-GB') : 'N/A'}
                    </td>
                    <td style={{ padding: '10px 12px', borderRight: '1px solid #f4f1ea', color: '#999', fontFamily: 'monospace' }}>
                      {c.id}
                    </td>
                    <td style={{ padding: '10px 12px', borderRight: '1px solid #f4f1ea', fontWeight: 'bold', color: '#4a3b1b' }}>
                      {c.name}
                    </td>
                    <td style={{ padding: '10px 12px', borderRight: '1px solid #f4f1ea' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold',
                        background: c.owner === 'Jing' ? '#fee2e2' : c.owner === 'Pich' ? '#dbeafe' : '#f3e8ff',
                        color: c.owner === 'Jing' ? '#991b1b' : c.owner === 'Pich' ? '#1e40af' : '#6b21a8'
                      }}>
                        {c.owner || 'Both'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', borderRight: '1px solid #f4f1ea', color: '#4a3b1b' }}>
  <span style={{ fontWeight: 'bold', fontSize: '12px', background: '#f4f1ea', padding: '2px 6px', borderRadius: '4px' }}>
    {c.type}
  </span>
</td>
                    <td style={{ padding: '10px 12px', borderRight: '1px solid #f4f1ea', color: '#111827' }}>
                      {c.phone || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', borderRight: '1px solid #f4f1ea', color: '#4b5563' }}>
                      {c.location || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', borderRight: '1px solid #f4f1ea', textAlign: 'center' }}>
                      {c.google_map ? (
                        <a href={c.google_map} target="_blank" rel="noreferrer" style={{ color: '#b58a3d', textDecoration: 'underline', fontWeight: 'bold' }}>🗺️ View Map</a>
                      ) : (
                        <span style={{ color: '#ccc' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#6b7280', fontStyle: 'italic' }}>
                      {c.last_purchase_date ? new Date(c.last_purchase_date).toLocaleDateString('en-GB') : 'Sync pending...'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL WINDOW 1: DYNAMIC VIEWS CREATOR */}
      {showCreateViewModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <form onSubmit={handleCreateView} style={{ background: '#ffffff', width: '100%', maxWidth: '400px', borderRadius: '12px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#4a3b1b', borderBottom: '1px solid #f3f4f6', paddingBottom: '10px' }}>Create Custom Spreadsheet View</h3>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#8a7650', marginBottom: '4px' }}>View Name</label>
              <input type="text" placeholder="e.g. Jing Premium Row" value={newViewName} onChange={(e) => setNewViewName(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #dcd7cc', boxSizing: 'border-box' }} required />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#8a7650', marginBottom: '4px' }}>Filter accounts assigned to:</label>
              <select value={newViewFilter} onChange={(e: any) => setNewViewFilter(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #dcd7cc', background: '#fff' }}>
                <option value="All">Show All Accounts</option>
                <option value="Jing">Jing</option>
                <option value="Pich">Pich</option>
                <option value="Both">Both</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button type="button" onClick={() => setShowCreateViewModal(false)} style={{ padding: '10px 16px', background: '#f4f1ea', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#6b582f', fontWeight: 'bold' }}>Cancel</button>
              <button type="submit" style={{ padding: '10px 16px', background: '#b58a3d', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#fff', fontWeight: 'bold' }}>Apply Grid View</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL WINDOW 2: CREATION CUSTOMER CARD PROFILES */}
      {showAddModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <form onSubmit={handleAddCustomer} style={{ background: '#ffffff', width: '100%', maxWidth: '460px', borderRadius: '12px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#4a3b1b', borderBottom: '1px solid #f3f4f6', paddingBottom: '10px' }}>👤 File New Customer Profile Record</h3>
            
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#8a7650', marginBottom: '4px' }}>Customer Full Name *</label>
              <input type="text" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #dcd7cc', boxSizing: 'border-box' }} required />
            </div>

            <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#8a7650', marginBottom: '4px' }}>Who customer is it?</label>
                <select value={newCustomer.owner} onChange={(e) => setNewCustomer({ ...newCustomer, owner: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #dcd7cc', background: '#fff' }}>
                  <option value="Jing">Jing</option>
                  <option value="Pich">Pich</option>
                  <option value="Both">Both</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#8a7650', marginBottom: '4px' }}>Customer Type</label>
                <select value={newCustomer.type} onChange={(e) => setNewCustomer({ ...newCustomer, type: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #dcd7cc', background: '#fff' }}>
  <option value="ហូប">ហូប</option>
  <option value="លក់បាយ">លក់បាយ</option>
  <option value="លក់ត">លក់ត</option>
  <option value="ធ្វើនំ">ធ្វើនំ</option>
  <option value="អំណោយ">អំណោយ</option>
</select>
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#8a7650', marginBottom: '4px' }}>Phone Number</label>
              <input type="text" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} placeholder="e.g. 012 345 678" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #dcd7cc', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#8a7650', marginBottom: '4px' }}>Delivery Address Location</label>
              <input type="text" value={newCustomer.location} onChange={(e) => setNewCustomer({ ...newCustomer, location: e.target.value })} placeholder="Phnom Penh" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #dcd7cc', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#8a7650', marginBottom: '4px' }}>Google Map URL Link</label>
              <input type="url" value={newCustomer.google_map} onChange={(e) => setNewCustomer({ ...newCustomer, google_map: e.target.value })} placeholder="https://maps.google.com/..." style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #dcd7cc', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button type="button" onClick={() => setShowAddModal(false)} style={{ padding: '10px 16px', background: '#f4f1ea', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#6b582f', fontWeight: 'bold' }}>Cancel</button>
              <button type="submit" style={{ padding: '10px 16px', background: '#10b981', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#fff', fontWeight: 'bold' }}>Save To Database</button>
            </div>
          </form>
        </div>
      )}

      {/* HOVER CSS RULES FOR SPREADSHEET ALIGNMENT */}
      <style jsx global>{`
        .table-row:hover {
          background-color: #fcfbfa !important;
        }
      `}</style>

    </div>
  )
}