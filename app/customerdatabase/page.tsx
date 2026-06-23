'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'

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

// Updated Types for Khmer Categories
type CustomerType = 'All' | 'ហូប' | 'លក់បាយ' | 'លក់ត' | 'ធ្វើនំ' | 'អំណោយ';

export default function CustomerDatabasePage() {
  const [customers, setCustomers] = useState<any[]>([])
  const [lang, setLang] = useState<'en' | 'kh'>('en')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Updated Filter State
  const [customerTypeFilter, setCustomerTypeFilter] = useState<CustomerType>('All')

  const [views, setViews] = useState<CustomerView[]>([
    { id: 'all', name: 'All Customers', filterOwner: 'All' },
    { id: 'jing', name: 'Jing’s Accounts', filterOwner: 'Jing' },
    { id: 'pich', name: 'Pich’s Accounts', filterOwner: 'Pich' },
  ])
  const [activeViewId, setActiveViewId] = useState<string>('all')
  const [showCreateViewModal, setShowCreateViewModal] = useState(false)
  const [newViewName, setNewViewName] = useState('')
  const [newViewFilter, setNewViewFilter] = useState<'Jing' | 'Pich' | 'Both' | 'All'>('All')

  const [showAddModal, setShowAddModal] = useState(false)
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    owner: 'Both',
    type: 'ហូប', // Defaulting to first category
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

  function handleCreateView(e: React.FormEvent) {
    e.preventDefault()
    if (!newViewName.trim()) return
    const newView: CustomerView = { id: `view_${Date.now()}`, name: newViewName, filterOwner: newViewFilter }
    setViews([...views, newView])
    setActiveViewId(newView.id)
    setNewViewName('')
    setShowCreateViewModal(false)
  }

  async function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault()
    if (!newCustomer.name.trim()) return

    try {
      const { error } = await supabase
        .from('customers')
        .insert([newCustomer])

      if (error) throw error

      setShowAddModal(false)
      setNewCustomer({ name: '', owner: 'Both', type: 'ហូប', phone: '', location: '', google_map: '' })
      loadCustomers() 
    } catch (err: any) {
      alert(`Supabase Error: ${err.message}`)
    }
  }

  const currentActiveView = views.find(v => v.id === activeViewId)
  
  const filteredCustomers = customers.filter(c => {
    if (currentActiveView?.filterOwner && currentActiveView.filterOwner !== 'All') {
      if (c.owner !== currentActiveView.filterOwner) return false
    }
    if (customerTypeFilter !== 'All') {
      if (c.type !== customerTypeFilter) return false
    }
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
      
      <div style={{ width: isSidebarOpen ? '240px' : '0px', background: '#111827', color: 'white', padding: isSidebarOpen ? '20px' : '0px', transition: 'all 0.3s', overflow: 'hidden' }}>
        <h2 style={{ marginBottom: 30, fontSize: '20px' }}>🌾 Rice POS</h2>
        <p><Link href="/customerdatabase" style={{ color: '#38bdf8', textDecoration: 'none' }}>{currentT.customersDb}</Link></p>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #f3f4f6' }}>
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)}>☰</button>
          <h1 style={{ fontSize: '20px', color: '#4a3b1b' }}>Customer Database</h1>
          <button onClick={() => setShowAddModal(true)} style={{ background: '#10b981', color: 'white', padding: '8px 14px', borderRadius: '6px' }}>➕ Add Customer</button>
        </header>

        {/* Updated Filter Buttons */}
        <div style={{ padding: '10px 20px', display: 'flex', gap: '8px', overflowX: 'auto' }}>
          <button onClick={() => setCustomerTypeFilter('All')} style={{ padding: '6px 12px', borderRadius: '20px', background: customerTypeFilter === 'All' ? '#b58a3d' : '#fff', border: '1px solid #eadeca' }}>All ({customers.length})</button>
          {(['ហូប', 'លក់បាយ', 'លក់ត', 'ធ្វើនំ', 'អំណោយ'] as const).map(typeItem => (
            <button key={typeItem} onClick={() => setCustomerTypeFilter(typeItem)} style={{ padding: '6px 12px', borderRadius: '20px', border: '1px solid #eadeca', background: customerTypeFilter === typeItem ? '#b58a3d' : '#fff' }}>
              {typeItem} ({customers.filter(c => c.type === typeItem).length})
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9f8f6' }}>
                <th style={{ padding: '12px' }}>Name</th>
                <th style={{ padding: '12px' }}>Type</th>
                <th style={{ padding: '12px' }}>Owner</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f4f1ea' }}>
                  <td style={{ padding: '10px 12px' }}>{c.name}</td>
                  <td style={{ padding: '10px 12px' }}>{c.type}</td>
                  <td style={{ padding: '10px 12px' }}>{c.owner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <form onSubmit={handleAddCustomer} style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '400px' }}>
            <input type="text" placeholder="Name" value={newCustomer.name} onChange={e => setNewCustomer({...newCustomer, name: e.target.value})} style={{ width: '100%', marginBottom: '10px', padding: '8px' }} />
            <select value={newCustomer.type} onChange={e => setNewCustomer({...newCustomer, type: e.target.value})} style={{ width: '100%', marginBottom: '10px', padding: '8px' }}>
              {['ហូប', 'លក់បាយ', 'លក់ត', 'ធ្វើនំ', 'អំណោយ'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button type="submit" style={{ width: '100%', padding: '10px', background: '#10b981', color: 'white' }}>Save</button>
          </form>
        </div>
      )}
    </div>
  )
}