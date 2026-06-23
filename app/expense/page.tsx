'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function ExpenseDashboard() {
  // --- Active Tab State ---
  const [activeTab, setActiveTab] = useState<'personal' | 'business'>('business')

  // --- Form States ---
  const [expenseDate, setExpenseDate] = useState('')
  const [spender, setSpender] = useState<'Pich' | 'Jing' | 'Both'>('Pich')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('Stock')
  const [amountUsd, setAmountUsd] = useState('')
  const [amountRiel, setAmountRiel] = useState('')
  const [loading, setLoading] = useState(false)

  // Set default date to today on load
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    setExpenseDate(today)
  }, [])

  // --- Handle Form Submit ---
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!description) {
      alert('Please add a description/item detail')
      return
    }

    if (!amountUsd && !amountRiel) {
      alert('Please enter an amount in either USD ($) or Riel (៛)')
      return
    }

    setLoading(true)

    // Formulate values for submission
    // (If you have different columns for USD/Riel in your database, pass them here)
    const finalAmountUsd = amountUsd ? Number(amountUsd) : 0
    
    const { error } = await supabase.from('expenses').insert([
      {
        description: `[${spender}][${activeTab.toUpperCase()}] ${description}`,
        category: category,
        amount: finalAmountUsd, // Submits USD to standard total column
        expense_date: expenseDate,
      },
    ])

    setLoading(false)

    if (error) {
      alert(`Error saving entry: ${error.message}`)
    } else {
      alert('Expense recorded successfully!')
      setDescription('')
      setAmountUsd('')
      setAmountRiel('')
    }
  }

  return (
    <div style={styles.pageContainer}>
      <div style={styles.card}>
        {/* HEADER BRANDING */}
        <div style={styles.brandHeader}>
          <h1 style={styles.mainTitle}>Daily Expenses</h1>
          <p style={styles.subtitle}>Tracker & Ledger Dashboard</p>
        </div>

        {/* TWO TAB HEADER */}
        <div style={styles.tabContainer}>
          <button
            onClick={() => setActiveTab('business')}
            style={{
              ...styles.tabButton,
              ...(activeTab === 'business' ? styles.activeTab : {}),
            }}
          >
            🏢 Business Expenses
          </button>
          <button
            onClick={() => setActiveTab('personal')}
            style={{
              ...styles.tabButton,
              ...(activeTab === 'personal' ? styles.activeTab : {}),
            }}
          >
            🏡 Personal Ledger
          </button>
        </div>

        {/* EXPENSE TRANSACTION FORM */}
        <form onSubmit={handleSubmit} style={styles.form}>
          
          {/* DATE PICKER */}
          <div style={styles.inputGroup}>
            <label style={styles.label}>Transaction Date</label>
            <input
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              style={styles.inputField}
              required
            />
          </div>

          {/* SPENDER SELECTOR (3 MULTIPLE CHOICE) */}
          <div style={styles.inputGroup}>
            <label style={styles.label}>Who Paid? / Purchaser</label>
            <div style={styles.radioGrid}>
              {(['Pich', 'Jing', 'Both'] as const).map((person) => (
                <label
                  key={person}
                  style={{
                    ...styles.radioLabel,
                    ...(spender === person ? styles.radioLabelActive : {}),
                  }}
                >
                  <input
                    type="radio"
                    name="spender"
                    value={person}
                    checked={spender === person}
                    onChange={() => setSpender(person)}
                    style={styles.hiddenRadio}
                  />
                  <span style={styles.radioDot} />
                  {person}
                </label>
              ))}
            </div>
          </div>

          {/* CATEGORY & DETAILS */}
          <div style={styles.inputGroup}>
            <label style={styles.label}>Expense Category</label>
            <select 
              value={category} 
              onChange={e => setCategory(e.target.value)} 
              style={styles.inputField}
            >
              <option value="Stock">🌾 Stock / Goods Purchased</option>
              <option value="Utilities">💡 Utilities (Water, Power, Internet)</option>
              <option value="Rent">🏢 Rent & Space Lease</option>
              <option value="Salary">💰 Staff Wages & Remunerations</option>
              <option value="Marketing">📢 Marketing / Ads</option>
              <option value="Other">📦 Other Operational Items</option>
            </select>
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Item Description / Note</label>
            <input
              type="text"
              placeholder="e.g., Bought 50 Premium Rice Sacks, Fuel run, Electricity bill"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={styles.inputField}
              required
            />
          </div>

          {/* DUAL CURRENCY FIELDS */}
          <div style={styles.currencyRow}>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Amount in USD ($)</label>
              <div style={styles.currencyWrapper}>
                <span style={styles.currencyPrefix}>$</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={amountUsd}
                  onChange={(e) => setAmountUsd(e.target.value)}
                  style={{ ...styles.inputField, paddingLeft: '30px' }}
                />
              </div>
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Amount in Khmer Riel (៛)</label>
              <div style={styles.currencyWrapper}>
                <span style={styles.currencyPrefix}>៛</span>
                <input
                  type="number"
                  step="100"
                  placeholder="0"
                  value={amountRiel}
                  onChange={(e) => setAmountRiel(e.target.value)}
                  style={{ ...styles.inputField, paddingLeft: '30px' }}
                />
              </div>
            </div>
          </div>
          <span style={styles.helperText}>* You can enter an amount in either currency box and leave the other completely blank.</span>

          {/* SUBMIT BUTTON */}
          <button type="submit" disabled={loading} style={styles.submitButton}>
            {loading ? 'Processing Entry...' : `Securely Log ${activeTab === 'business' ? 'Business' : 'Personal'} Expense`}
          </button>

        </form>
      </div>
    </div>
  )
}

// --- CSS-IN-JS BRAND THEME STYLING ---
const styles = {
  pageContainer: {
    backgroundColor: '#0f1715', // Sleek deep forest dark mode background
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    backgroundColor: '#16221f', // Rich charcoal-green container background
    maxWidth: '550px',
    width: '100%',
    borderRadius: '16px',
    padding: '35px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
    border: '1px solid #233631',
  },
  brandHeader: {
    textAlign: 'center' as const,
    marginBottom: '30px',
  },
  mainTitle: {
    color: '#d4af37', // Luxurious matte gold text branding accent
    fontSize: '28px',
    fontWeight: '700',
    letterSpacing: '-0.5px',
    margin: '0 0 4px 0',
  },
  subtitle: {
    color: '#8da69f', // Soft muted complementary secondary text color
    fontSize: '14px',
    margin: 0,
  },
  tabContainer: {
    display: 'flex',
    gap: '10px',
    backgroundColor: '#0a100e',
    padding: '6px',
    borderRadius: '10px',
    marginBottom: '30px',
  },
  tabButton: {
    flex: 1,
    padding: '12px',
    background: 'none',
    border: 'none',
    color: '#8da69f',
    fontSize: '14px',
    fontWeight: '600',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  activeTab: {
    backgroundColor: '#1b4d3e', // Deep vibrant corporate green
    color: '#ffffff',
    boxShadow: '0 4px 12px rgba(27,77,62,0.3)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  label: {
    color: '#d4af37',
    fontSize: '13px',
    fontWeight: '600',
    letterSpacing: '0.3px',
    textTransform: 'uppercase' as const,
  },
  inputField: {
    backgroundColor: '#0d1614',
    border: '1px solid #2c423d',
    borderRadius: '8px',
    padding: '12px 14px',
    color: '#ffffff',
    fontSize: '15px',
    outline: 'none',
    transition: 'all 0.2s ease',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  radioGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '10px',
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    backgroundColor: '#0d1614',
    border: '1px solid #2c423d',
    padding: '12px',
    borderRadius: '8px',
    color: '#8da69f',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'all 0.2s ease',
  },
  radioLabelActive: {
    borderColor: '#d4af37',
    color: '#ffffff',
    backgroundColor: '#1b2a26',
  },
  hiddenRadio: {
    display: 'none',
  },
  radioDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: 'transparent',
    border: '2px solid #8da69f',
    display: 'inline-block',
  },
  currencyRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '15px',
  },
  currencyWrapper: {
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
  },
  currencyPrefix: {
    position: 'absolute' as const,
    left: '12px',
    color: '#d4af37',
    fontWeight: '600',
    fontSize: '16px',
  },
  helperText: {
    color: '#718781',
    fontSize: '12px',
    fontStyle: 'italic',
    marginTop: '-8px',
  },
  submitButton: {
    backgroundColor: '#d4af37',
    color: '#0a100e',
    padding: '15px',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 6px 18px rgba(212,175,55,0.2)',
    marginTop: '10px',
  },
}