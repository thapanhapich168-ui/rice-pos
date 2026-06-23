'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function ExpenseDashboard() {
  // --- Active Tab State ---
  const [activeTab, setActiveTab] = useState<'personal' | 'business'>('personal')

  // --- Form States ---
  const [expenseDate, setExpenseDate] = useState('')
  const [spender, setSpender] = useState<'Pich' | 'Jing' | 'Both'>('Pich')
  const [remarks, setRemarks] = useState('')
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

    if (!remarks) {
      alert('Please add remarks/item detail')
      return
    }

    if (!amountUsd && !amountRiel) {
      alert('Please enter an amount in either USD ($) or Riel (៛)')
      return
    }

    setLoading(true)

    const finalAmountUsd = amountUsd ? Number(amountUsd) : 0
    const finalAmountRiel = amountRiel ? Number(amountRiel) : 0
    
    // Maps perfectly to the Supabase columns you listed
    const { error } = await supabase.from('expenses').insert([
      {
        expense_date: expenseDate,
        spender: spender,
        remarks: remarks,                      // Pure text remarks
        amount: finalAmountUsd,                // Maps to amount $
        amount_riel: finalAmountRiel,          // Maps to amount riel
        description: activeTab.toUpperCase(),  // Stores 'PERSONAL' or 'BUSINESS' cleanly here!
      },
    ])

    setLoading(false)

    if (error) {
      alert(`Error saving entry: ${error.message}`)
    } else {
      alert('Expense recorded successfully!')
      setRemarks('')
      setAmountUsd('')
      setAmountRiel('')
    }
  }

    setLoading(false)

    if (error) {
      alert(`Error saving entry: ${error.message}`)
    } else {
      alert('Expense recorded successfully!')
      setRemarks('')
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
            onClick={() => setActiveTab('personal')}
            style={{
              ...styles.tabButton,
              ...(activeTab === 'personal' ? styles.activeTab : {}),
            }}
          >
            🏡 Personal Ledger
          </button>
          <button
            onClick={() => setActiveTab('business')}
            style={{
              ...styles.tabButton,
              ...(activeTab === 'business' ? styles.activeTab : {}),
            }}
          >
            🏢 Business Expenses
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

          {/* SPENDER SELECTOR */}
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

          {/* REMARKS */}
          <div style={styles.inputGroup}>
            <label style={styles.label}>Remarks</label>
            <input
              type="text"
              placeholder="e.g., Bought 50 Premium Rice Sacks, Fuel run, Electricity bill"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              style={styles.inputField}
              required
            />
          </div>

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
    backgroundColor: '#f8fafc',
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    backgroundColor: '#ffffff',
    maxWidth: '550px',
    width: '100%',
    borderRadius: '16px',
    padding: '35px',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.05), 0 2px 4px rgba(0, 0, 0, 0.02)',
    border: '1px solid #e2e8f0',
  },
  brandHeader: {
    textAlign: 'center' as const,
    marginBottom: '30px',
  },
  mainTitle: {
    color: '#b59410',
    fontSize: '28px',
    fontWeight: '700',
    letterSpacing: '-0.5px',
    margin: '0 0 4px 0',
  },
  subtitle: {
    color: '#64748b',
    fontSize: '14px',
    margin: 0,
  },
  tabContainer: {
    display: 'flex',
    gap: '10px',
    backgroundColor: '#f1f5f9',
    padding: '6px',
    borderRadius: '10px',
    marginBottom: '30px',
  },
  tabButton: {
    flex: 1,
    padding: '12px',
    background: 'none',
    border: 'none',
    color: '#64748b',
    fontSize: '14px',
    fontWeight: '600',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  activeTab: {
    backgroundColor: '#1b4d3e',
    color: '#ffffff',
    boxShadow: '0 4px 12px rgba(27,77,62,0.15)',
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
    color: '#b59410',
    fontSize: '13px',
    fontWeight: '600',
    letterSpacing: '0.3px',
    textTransform: 'uppercase' as const,
  },
  inputField: {
    backgroundColor: '#ffffff',
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    padding: '12px 14px',
    color: '#0f172a',
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
    backgroundColor: '#ffffff',
    border: '1px solid #cbd5e1',
    padding: '12px',
    borderRadius: '8px',
    color: '#64748b',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'all 0.2s ease',
  },
  radioLabelActive: {
    borderColor: '#b59410',
    color: '#0f172a',
    backgroundColor: '#fefcf3',
  },
  hiddenRadio: {
    display: 'none',
  },
  radioDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: 'transparent',
    border: '2px solid #cbd5e1',
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
    color: '#b59410',
    fontWeight: '600',
    fontSize: '16px',
  },
  submitButton: {
    backgroundColor: '#b59410',
    color: '#ffffff',
    padding: '15px',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 6px 18px rgba(181,148,16,0.15)',
    marginTop: '10px',
  },
}