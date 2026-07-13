'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import { useUserRole } from '@/lib/useUserRole'

// ==========================================
// ROBUST LIVE COMMA FORMATTER 
// ==========================================
function CurrencyInput({ value, onChange, onBlur, placeholder, style, className }: any) {
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (value === '' || value === 0 || value === undefined) {
      setInputValue('');
    } else {
      const parsed = parseFloat(inputValue.replace(/,/g, ''));
      if (parsed !== Number(value)) {
        setInputValue(new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value)));
      }
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/[^0-9.]/g, '');
    const parts = raw.split('.');
    if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');

    let formatted = parts[0] ? new Intl.NumberFormat('en-US').format(parseInt(parts[0], 10)) : '';
    if (parts.length > 1) formatted += '.' + parts[1].substring(0, 2);
    if (raw === '') formatted = '';

    setInputValue(formatted);
    const num = parseFloat(raw);
    onChange(isNaN(num) ? '' : num);
  };

  return (
    <input 
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      value={inputValue}
      onChange={handleChange}
      onBlur={onBlur}
      style={{ ...style, color: '#334155', fontWeight: 'bold' }}
      className={className || "mobile-input-field no-spinners"}
    />
  )
}

export default function SettingsPage() {
  const router = useRouter()
  
  // 🚀 AUTH & ROLE STATE
  const { role, loadingRole } = useUserRole()
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<any[]>([])

  // --- FINANCIAL STATE ---
  const [exchangeRate, setExchangeRate] = useState<number>(4000)
  const [baseCapital, setBaseCapital] = useState<number>(0)
  const [initCashRiel, setInitCashRiel] = useState<number>(0)
  const [initCashUsd, setInitCashUsd] = useState<number>(0)
  const [initQrRiel, setInitQrRiel] = useState<number>(0)
  const [initQrUsd, setInitQrUsd] = useState<number>(0)
  const [familyOweRiel, setFamilyOweRiel] = useState<number>(0)
  const [familyOweUsd, setFamilyOweUsd] = useState<number>(0)
  const [persOweRiel, setPersOweRiel] = useState<number>(0) 
  const [persOweUsd, setPersOweUsd] = useState<number>(0) 

  const [isResetting, setIsResetting] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUser(user)
    })
    fetchSettings()
    fetchProfiles()
  }, [])

  async function fetchSettings() {
    setLoading(true)
    const keys = [
      'exchange_rate', 'base_capital', 'initial_cash_riel', 'initial_cash_usd', 
      'initial_qr_riel', 'initial_qr_usd', 'personal_owe_riel', 'personal_owe_usd', 
      'family_owe_riel', 'family_owe_usd'
    ];
    
    const { data } = await supabase.from('app_settings').select('*').in('setting_key', keys)
    
    if (data) {
      data.forEach((s: any) => {
        if (s.setting_key === 'exchange_rate') setExchangeRate(Number(s.setting_value) || 4000)
        if (s.setting_key === 'base_capital') setBaseCapital(Number(s.setting_value) || 0)
        if (s.setting_key === 'initial_cash_riel') setInitCashRiel(Number(s.setting_value) || 0)
        if (s.setting_key === 'initial_cash_usd') setInitCashUsd(Number(s.setting_value) || 0)
        if (s.setting_key === 'initial_qr_riel') setInitQrRiel(Number(s.setting_value) || 0)
        if (s.setting_key === 'initial_qr_usd') setInitQrUsd(Number(s.setting_value) || 0)
        if (s.setting_key === 'personal_owe_riel') setPersOweRiel(Number(s.setting_value) || 0)
        if (s.setting_key === 'personal_owe_usd') setPersOweUsd(Number(s.setting_value) || 0)
        if (s.setting_key === 'family_owe_riel') setFamilyOweRiel(Number(s.setting_value) || 0)
        if (s.setting_key === 'family_owe_usd') setFamilyOweUsd(Number(s.setting_value) || 0)
      })
    }
    setLoading(false)
  }

  async function fetchProfiles() {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: true })
    if (data) setProfiles(data)
  }

  async function updateSetting(key: string, val: number) {
    const { error } = await supabase.from('app_settings').upsert({ setting_key: key, setting_value: val }, { onConflict: 'setting_key' })
    if (error) alert(`Error saving ${key}: ${error.message}`)
  }

  // 🚀 PERMISSION UPDATER
  async function handleRoleUpdate(profileId: string, newRole: string) {
    if (!confirm(`Are you sure you want to change this user's access level to ${newRole.toUpperCase() || 'NO ACCESS'}?`)) return;

    const roleValue = newRole === '' ? null : newRole;
    const { error } = await supabase.from('profiles').update({ role: roleValue }).eq('id', profileId);
    
    if (error) {
      alert(`Error updating permissions: ${error.message}`);
    } else {
      setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, role: roleValue } : p));
    }
  }

  const handleSignOut = async () => {
    if(!confirm("Are you sure you want to sign out?")) return;
    await supabase.auth.signOut();
    router.push('/');
  }

  const handleResetLayouts = async () => {
    if(!confirm("⚠️ WARNING: This will reset all table column widths, sorts, and layouts across the entire app back to their default state. Are you sure?")) return;
    
    setIsResetting(true);
    try {
      const layoutKeys = [
        'pos_product_order', 
        'column_widths', 'column_order', 
        'cust_col_widths', 'cust_col_order', 
        'biz_col_widths', 'biz_sum_cols', 'biz_daily_cols', 'biz_retail_cols', 'biz_exp_cols'
      ];
      
      const { error } = await supabase.from('app_settings').delete().in('setting_key', layoutKeys);
      if (error) throw error;
      
      alert("✅ All UI Layouts have been successfully reset. Refresh your other tabs to see the changes.");
    } catch (err: any) {
      alert(`Error resetting layouts: ${err.message}`);
    } finally {
      setIsResetting(false);
    }
  }

  // ==========================================
  // 🛡️ HARD SECURITY GUARDRAIL
  // ==========================================
  if (loadingRole || loading) {
    return <div className="main-wrapper" style={{ padding: '40px', color: '#64748b' }}>Loading secure settings...</div>;
  }

  if (role !== 'admin') {
    return (
      <div className="main-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100dvh', background: '#f8fafc' }}>
        <div style={{ textAlign: 'center', background: '#fff', padding: '40px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', borderTop: '4px solid #ef4444', maxWidth: '400px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🛑</div>
          <h1 style={{ margin: '0 0 8px 0', color: '#1e293b', fontSize: '24px' }}>Access Denied</h1>
          <p style={{ color: '#64748b', marginBottom: '24px', fontSize: '14px', lineHeight: 1.5 }}>
            You do not have administrative permissions to view or change business settings. Please contact the Master Admin.
          </p>
          <button onClick={() => router.push('/pos')} style={{ width: '100%', padding: '12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
            Return to POS
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="main-wrapper">
      <div className="header-container">
        <h1 className="page-title">⚙️ Access & Settings</h1>
      </div>

      <div className="settings-grid">
        
        {/* === CARD 1: ACCOUNT === */}
        <div className="settings-card">
          <h2 className="card-subtitle">🔐 Active Session Details</h2>
          
          <div className="session-info-box">
            <div className="info-label">Currently Authenticated As:</div>
            <div className="info-value">
              {currentUser?.email || 'Unknown User'}
            </div>
            <div className="info-subtext">Session ID: {currentUser?.id || 'N/A'}</div>
          </div>

          <h3 className="section-title">Account Management</h3>
          <p className="section-text">
            Signing out will safely end your current session on this device. All your inventory, sales, and customer data will remain completely intact in the database.
          </p>

          <button onClick={handleSignOut} className="signout-btn">
            Sign Out
          </button>
        </div>

        {/* === CARD 2: SYSTEM CONSTANTS === */}
        <div className="settings-card">
          <h2 className="card-subtitle">🌐 Global Business Constants</h2>
          <p className="section-text">
            These values affect the mathematical formulas across your entire Point of Sale and Accounting platform.
          </p>

          <div className="input-group" style={{ background: '#fefcf3', borderColor: '#fde047' }}>
            <div>
              <label className="input-label" style={{ color: '#854d0e' }}>Master Exchange Rate (៛ per $1)</label>
              <div className="info-subtext" style={{ marginTop: '2px', marginBottom: '8px' }}>Updates POS & COGS calculations globally.</div>
            </div>
            <CurrencyInput 
              value={exchangeRate} 
              onChange={(v: any) => setExchangeRate(Number(v) || 0)} 
              onBlur={() => updateSetting('exchange_rate', exchangeRate)} 
              style={{ padding: '12px', borderRadius: '8px', border: '2px solid #b58a3d', outline: 'none', width: '100%', fontSize: '18px', color: '#b58a3d' }} 
            />
          </div>
        </div>

        {/* === CARD 3: USER PERMISSIONS === */}
        <div className="settings-card" style={{ gridColumn: '1 / -1' }}>
          <h2 className="card-subtitle">👥 User Permissions & Roles</h2>
          <div className="section-text">
            Change the access level for your staff. <br/>
            <strong style={{ color: '#b45309' }}>To Add Users:</strong> Create them securely in your <i>Supabase Auth Dashboard</i>. They will instantly appear below so you can assign their role.
          </div>

          <div className="table-responsive-wrapper">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px', minWidth: '500px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ padding: '14px 16px', color: '#475569', fontWeight: 'bold' }}>Name / Account</th>
                  <th style={{ padding: '14px 16px', color: '#475569', fontWeight: 'bold', width: '150px' }}>Current Access</th>
                  <th style={{ padding: '14px 16px', color: '#475569', fontWeight: 'bold', width: '200px' }}>Change Permission</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map(p => (
                   <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9', background: '#fff' }}>
                     <td style={{ padding: '14px 16px', fontWeight: 'bold', color: '#1e293b' }}>
                       {p.full_name || 'New Staff Member'}
                       <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', fontWeight: 'normal' }}>ID: {p.id.split('-')[0]}...</div>
                     </td>
                     <td style={{ padding: '14px 16px' }}>
                        <span style={{
                           padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold',
                           background: p.role === 'admin' ? '#fef3c7' : p.role === 'manager' ? '#e0f2fe' : p.role === 'cashier' ? '#f3e8ff' : '#f1f5f9',
                           color: p.role === 'admin' ? '#b45309' : p.role === 'manager' ? '#0369a1' : p.role === 'cashier' ? '#7e22ce' : '#475569'
                        }}>
                           {p.role ? String(p.role).toUpperCase() : 'NO ACCESS'}
                        </span>
                     </td>
                     <td style={{ padding: '14px 16px' }}>
                       <select
                         className="mobile-select"
                         value={p.role || ''}
                         onChange={(e) => handleRoleUpdate(p.id, e.target.value)}
                         disabled={p.id === currentUser?.id}
                         style={{ 
                           padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', background: '#fff', 
                           color: '#334155', width: '100%', cursor: p.id === currentUser?.id ? 'not-allowed' : 'pointer', fontSize: '16px' 
                         }}
                       >
                         <option value="">🚫 No Access</option>
                         <option value="cashier">🛒 Cashier (POS Only)</option>
                         <option value="manager">🛡️ Manager</option>
                         <option value="admin">👑 Master Admin</option>
                       </select>
                     </td>
                   </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* === CARD 4: STARTING BALANCES === */}
        <div className="settings-card" style={{ gridColumn: '1 / -1' }}>
          <h2 className="card-subtitle">⚖️ Manual Starting Balances</h2>
          <p className="section-text">
            These base values are added to your live Business Dashboard asset tracking. Click outside the box to save.
          </p>
          
          <div className="balances-grid">
            <div className="input-group">
              <label className="input-label">Base Capital (៛)</label>
              <CurrencyInput value={baseCapital} onChange={(v: any) => setBaseCapital(Number(v) || 0)} onBlur={() => updateSetting('base_capital', baseCapital)} className="settings-input" />
            </div>
            <div className="input-group">
              <label className="input-label">Initial Cash (៛)</label>
              <CurrencyInput value={initCashRiel} onChange={(v: any) => setInitCashRiel(Number(v) || 0)} onBlur={() => updateSetting('initial_cash_riel', initCashRiel)} className="settings-input" />
            </div>
            <div className="input-group">
              <label className="input-label">Initial Cash ($)</label>
              <CurrencyInput value={initCashUsd} onChange={(v: any) => setInitCashUsd(Number(v) || 0)} onBlur={() => updateSetting('initial_cash_usd', initCashUsd)} className="settings-input" />
            </div>
            <div className="input-group">
              <label className="input-label">Initial QR (៛)</label>
              <CurrencyInput value={initQrRiel} onChange={(v: any) => setInitQrRiel(Number(v) || 0)} onBlur={() => updateSetting('initial_qr_riel', initQrRiel)} className="settings-input" />
            </div>
            <div className="input-group">
              <label className="input-label">Initial QR ($)</label>
              <CurrencyInput value={initQrUsd} onChange={(v: any) => setInitQrUsd(Number(v) || 0)} onBlur={() => updateSetting('initial_qr_usd', initQrUsd)} className="settings-input" />
            </div>
            <div className="input-group">
              <label className="input-label">Family Owes Me (៛)</label>
              <CurrencyInput value={familyOweRiel} onChange={(v: any) => setFamilyOweRiel(Number(v) || 0)} onBlur={() => updateSetting('family_owe_riel', familyOweRiel)} className="settings-input" />
            </div>
            <div className="input-group">
              <label className="input-label">Family Owes Me ($)</label>
              <CurrencyInput value={familyOweUsd} onChange={(v: any) => setFamilyOweUsd(Number(v) || 0)} onBlur={() => updateSetting('family_owe_usd', familyOweUsd)} className="settings-input" />
            </div>
            <div className="input-group" style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
              <label className="input-label" style={{ color: '#991b1b' }}>Mom Starting Owe (៛)</label>
              <CurrencyInput value={persOweRiel} onChange={(v: any) => setPersOweRiel(Number(v) || 0)} onBlur={() => updateSetting('personal_owe_riel', persOweRiel)} className="settings-input" />
            </div>
            <div className="input-group" style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
              <label className="input-label" style={{ color: '#991b1b' }}>Mom Starting Owe ($)</label>
              <CurrencyInput value={persOweUsd} onChange={(v: any) => setPersOweUsd(Number(v) || 0)} onBlur={() => updateSetting('personal_owe_usd', persOweUsd)} className="settings-input" />
            </div>
          </div>
        </div>

        {/* === CARD 5: SYSTEM MAINTENANCE === */}
        <div className="settings-card" style={{ gridColumn: '1 / -1', border: '1px solid #fecaca', background: '#fff1f2' }}>
          <h2 className="card-subtitle" style={{ color: '#be123c' }}>🛠️ System Maintenance</h2>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ flex: 1, minWidth: '250px' }}>
              <h3 className="section-title" style={{ color: '#991b1b' }}>Reset UI Layouts</h3>
              <p className="section-text" style={{ color: '#ef4444', margin: 0 }}>
                If your tables disappear or column widths get completely broken because of accidental dragging, click this button to factory reset all table views across the app.
              </p>
            </div>
            <button onClick={handleResetLayouts} disabled={isResetting} className="danger-btn">
              {isResetting ? 'Processing...' : '⚠️ Reset All Tables'}
            </button>
          </div>
        </div>

      </div>
      
      <style jsx global>{`
        .main-wrapper { 
          padding: 24px 24px 24px 75px; 
          background: #f8fafc; 
          min-height: 100dvh; /* Swapped to 100dvh for accurate mobile browser height */
          font-family: Arial, sans-serif; 
          box-sizing: border-box; 
          color: #333;
        }
        .header-container { 
          margin-bottom: 24px; 
        }
        .page-title { 
          font-size: 24px; 
          font-weight: bold; 
          color: #4a3b1b; 
          margin: 0; 
        }

        .settings-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
          gap: 24px;
          max-width: 1200px;
        }

        .settings-card {
          background: #fff; 
          padding: 30px; 
          border-radius: 12px; 
          border: 1px solid #e2e8f0; 
          box-shadow: 0 4px 6px rgba(0,0,0,0.02);
          display: flex;
          flex-direction: column;
        }
        .card-subtitle {
          margin: 0 0 16px 0; 
          font-size: 18px; 
          font-weight: bold;
          color: #0f172a;
        }
        .section-title {
          margin: 0 0 8px 0; 
          font-size: 14px; 
          font-weight: bold;
          color: #111827;
        }
        .section-text {
          font-size: 13px; 
          color: #64748b; 
          margin-bottom: 20px; 
          line-height: 1.5;
        }

        .session-info-box {
          background: #f8fafc; 
          padding: 16px; 
          border-radius: 8px; 
          border: 1px solid #e2e8f0; 
          margin-bottom: 24px;
        }
        .info-label {
          font-size: 12px; 
          color: #64748b; 
          margin-bottom: 4px;
          font-weight: bold;
          text-transform: uppercase;
        }
        .info-value {
          font-size: 16px; 
          font-weight: bold; 
          color: #10b981;
        }
        .info-subtext {
          font-size: 11px; 
          color: #94a3b8; 
          margin-top: 8px;
        }

        .balances-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
        }

        .input-group {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 16px;
          border-radius: 8px;
        }
        .input-label {
          display: block; 
          font-size: 12px; 
          color: #475569; 
          margin-bottom: 8px; 
          font-weight: bold;
          text-transform: uppercase;
        }
        .settings-input, .mobile-select {
          width: 100%; 
          padding: 10px 12px; 
          border-radius: 6px; 
          border: 1px solid #cbd5e1; 
          outline: none; 
          font-size: 16px; /* Exactly 16px prevents Safari Auto-Zoom */
          box-sizing: border-box;
          background: #ffffff;
          -webkit-appearance: none; /* Strips harsh default iOS styling */
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .settings-input:focus, .mobile-select:focus {
          border-color: #b58a3d;
          box-shadow: 0 0 0 2px rgba(181, 138, 61, 0.2);
        }

        /* Wrapper for momentum scrolling on iOS */
        .table-responsive-wrapper {
          overflow-x: auto;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          -webkit-overflow-scrolling: touch; 
        }
        
        .signout-btn {
          background: #1e293b; 
          color: #fff; 
          border: none; 
          padding: 12px 24px; 
          border-radius: 8px; 
          font-weight: bold; 
          cursor: pointer; 
          font-size: 14px; 
          transition: background 0.2s;
          margin-top: auto;
          -webkit-tap-highlight-color: transparent;
        }
        .signout-btn:hover {
          background: #334155;
        }

        .danger-btn {
          background: #ef4444; 
          color: #fff; 
          border: none; 
          padding: 14px 24px; 
          border-radius: 8px; 
          font-weight: bold; 
          cursor: pointer; 
          font-size: 14px; 
          transition: background 0.2s;
          white-space: nowrap;
          -webkit-tap-highlight-color: transparent;
        }
        .danger-btn:hover:not(:disabled) {
          background: #dc2626;
        }
        .danger-btn:disabled {
          background: #fca5a5;
          cursor: not-allowed;
        }
        
        @media (max-width: 768px) { 
          .main-wrapper { 
            /* Safely pads bottom accounting for iOS home bar, and ignores the sidebar padding on mobile */
            padding: max(80px, env(safe-area-inset-top, 80px)) 
                     max(16px, env(safe-area-inset-right, 16px)) 
                     max(24px, env(safe-area-inset-bottom, 24px)) 
                     max(16px, env(safe-area-inset-left, 16px)) !important; 
          }
          .settings-grid {
            grid-template-columns: 1fr;
          }
          .settings-card {
            padding: 20px;
          }
          .signout-btn, .danger-btn {
            width: 100%;
            padding: 14px; /* Slightly larger touch target on mobile */
          }
        }
      `}</style>
    </div>
  )
}