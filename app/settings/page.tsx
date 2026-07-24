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
      style={{ ...style, fontWeight: 'bold' }}
      className={className || "saas-input"}
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
        <div className="saas-card red" style={{ textAlign: 'center', maxWidth: '400px', margin: '0 auto' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🛑</div>
          <h1 style={{ margin: '0 0 8px 0', color: '#be123c', fontSize: '24px', fontWeight: 'bold' }}>Access Denied</h1>
          <p style={{ color: '#64748b', marginBottom: '24px', fontSize: '14px', lineHeight: 1.5 }}>
            You do not have administrative permissions to view or change business settings. Please contact the Master Admin.
          </p>
          <button onClick={() => router.push('/pos')} className="saas-btn saas-btn-primary" style={{ width: '100%', padding: '12px' }}>
            Return to POS
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="main-wrapper">
      
      {/* HEADER CONTAINER */}
      <div className="header-container">
        <div className="header-left">
          <h1 className="saas-page-title">⚙️ Access & Settings</h1>
        </div>
      </div>

      <div className="settings-grid">
        
        {/* === CARD 1: ACCOUNT === */}
        <div className="saas-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h2 className="saas-card-title" style={{ fontSize: '16px', color: '#0f172a' }}>🔐 Active Session Details</h2>
          
          <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
            <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', fontWeight: 'bold', textTransform: 'uppercase' }}>Currently Authenticated As:</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#10b981', wordBreak: 'break-all' }}>
              {currentUser?.email || 'Unknown User'}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>Session ID: {currentUser?.id || 'N/A'}</div>
          </div>

          <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 'bold', color: '#111827' }}>Account Management</h3>
          <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px', lineHeight: 1.5 }}>
            Signing out will safely end your current session on this device. All your inventory, sales, and customer data will remain completely intact in the database.
          </p>

          <button onClick={handleSignOut} className="saas-btn saas-btn-secondary" style={{ marginTop: 'auto', padding: '12px 24px' }}>
            Sign Out
          </button>
        </div>

        {/* === CARD 2: SYSTEM CONSTANTS === */}
        <div className="saas-card">
          <h2 className="saas-card-title" style={{ fontSize: '16px', color: '#0f172a' }}>🌐 Global Business Constants</h2>
          <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px', lineHeight: 1.5 }}>
            These values affect the mathematical formulas across your entire Point of Sale and Accounting platform.
          </p>

          <div style={{ background: '#fefcf3', border: '1px solid #fde047', padding: '16px', borderRadius: '8px' }}>
            <div style={{ marginBottom: '12px' }}>
              <label className="saas-card-title" style={{ color: '#854d0e', display: 'block', fontSize: '11px', marginBottom: '4px' }}>Master Exchange Rate (៛ per $1)</label>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '8px' }}>Updates POS & COGS calculations globally.</div>
            </div>
            <CurrencyInput 
              value={exchangeRate} 
              onChange={(v: any) => setExchangeRate(Number(v) || 0)} 
              onBlur={() => updateSetting('exchange_rate', exchangeRate)} 
              className="saas-input"
              style={{ border: '2px solid #b58a3d', color: '#b58a3d', fontSize: '18px', padding: '12px' }} 
            />
          </div>
        </div>

        {/* === CARD 3: USER PERMISSIONS === */}
        <div className="saas-card" style={{ gridColumn: '1 / -1' }}>
          <h2 className="saas-card-title" style={{ fontSize: '16px', color: '#0f172a' }}>👥 User Permissions & Roles</h2>
          <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px', lineHeight: 1.5 }}>
            Change the access level for your staff. <br/>
            <strong style={{ color: '#b45309' }}>To Add Users:</strong> Create them securely in your <i>Supabase Auth Dashboard</i>. They will instantly appear below so you can assign their role.
          </div>

          <div className="saas-table-wrapper">
            <div className="saas-table-responsive">
              <table className="saas-table">
                <thead>
                  <tr>
                    <th className="saas-th">Name / Account</th>
                    <th className="saas-th" style={{ width: '150px' }}>Current Access</th>
                    <th className="saas-th" style={{ width: '200px' }}>Change Permission</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map(p => (
                     <tr key={p.id} className="saas-tr">
                       <td className="saas-td" style={{ fontWeight: 'bold', color: '#1e293b' }}>
                         {p.full_name || 'New Staff Member'}
                         <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', fontWeight: 'normal' }}>ID: {p.id.split('-')[0]}...</div>
                       </td>
                       <td className="saas-td">
                          <span style={{
                             padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', display: 'inline-block',
                             background: p.role === 'admin' ? '#fef3c7' : p.role === 'manager' ? '#e0f2fe' : p.role === 'cashier' ? '#f3e8ff' : '#f1f5f9',
                             color: p.role === 'admin' ? '#b45309' : p.role === 'manager' ? '#0369a1' : p.role === 'cashier' ? '#7e22ce' : '#475569'
                          }}>
                             {p.role ? String(p.role).toUpperCase() : 'NO ACCESS'}
                          </span>
                       </td>
                       <td className="saas-td">
                         <select
                           className="saas-input"
                           value={p.role || ''}
                           onChange={(e) => handleRoleUpdate(p.id, e.target.value)}
                           disabled={p.id === currentUser?.id}
                           style={{ cursor: p.id === currentUser?.id ? 'not-allowed' : 'pointer' }}
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
        </div>

        {/* === CARD 4: STARTING BALANCES === */}
        <div className="saas-card" style={{ gridColumn: '1 / -1' }}>
          <h2 className="saas-card-title" style={{ fontSize: '16px', color: '#0f172a' }}>⚖️ Manual Starting Balances</h2>
          <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px', lineHeight: 1.5 }}>
            These base values are added to your live Business Dashboard asset tracking. Click outside the box to save.
          </p>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '8px' }}>
              <label className="saas-card-title" style={{ display: 'block', fontSize: '11px', marginBottom: '8px' }}>Base Capital (៛)</label>
              <CurrencyInput value={baseCapital} onChange={(v: any) => setBaseCapital(Number(v) || 0)} onBlur={() => updateSetting('base_capital', baseCapital)} className="saas-input" />
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '8px' }}>
              <label className="saas-card-title" style={{ display: 'block', fontSize: '11px', marginBottom: '8px' }}>Initial Cash (៛)</label>
              <CurrencyInput value={initCashRiel} onChange={(v: any) => setInitCashRiel(Number(v) || 0)} onBlur={() => updateSetting('initial_cash_riel', initCashRiel)} className="saas-input" />
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '8px' }}>
              <label className="saas-card-title" style={{ display: 'block', fontSize: '11px', marginBottom: '8px' }}>Initial Cash ($)</label>
              <CurrencyInput value={initCashUsd} onChange={(v: any) => setInitCashUsd(Number(v) || 0)} onBlur={() => updateSetting('initial_cash_usd', initCashUsd)} className="saas-input" />
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '8px' }}>
              <label className="saas-card-title" style={{ display: 'block', fontSize: '11px', marginBottom: '8px' }}>Initial QR (៛)</label>
              <CurrencyInput value={initQrRiel} onChange={(v: any) => setInitQrRiel(Number(v) || 0)} onBlur={() => updateSetting('initial_qr_riel', initQrRiel)} className="saas-input" />
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '8px' }}>
              <label className="saas-card-title" style={{ display: 'block', fontSize: '11px', marginBottom: '8px' }}>Initial QR ($)</label>
              <CurrencyInput value={initQrUsd} onChange={(v: any) => setInitQrUsd(Number(v) || 0)} onBlur={() => updateSetting('initial_qr_usd', initQrUsd)} className="saas-input" />
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '8px' }}>
              <label className="saas-card-title" style={{ display: 'block', fontSize: '11px', marginBottom: '8px' }}>Family Owes Me (៛)</label>
              <CurrencyInput value={familyOweRiel} onChange={(v: any) => setFamilyOweRiel(Number(v) || 0)} onBlur={() => updateSetting('family_owe_riel', familyOweRiel)} className="saas-input" />
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '8px' }}>
              <label className="saas-card-title" style={{ display: 'block', fontSize: '11px', marginBottom: '8px' }}>Family Owes Me ($)</label>
              <CurrencyInput value={familyOweUsd} onChange={(v: any) => setFamilyOweUsd(Number(v) || 0)} onBlur={() => updateSetting('family_owe_usd', familyOweUsd)} className="saas-input" />
            </div>
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '16px', borderRadius: '8px' }}>
              <label className="saas-card-title" style={{ color: '#991b1b', display: 'block', fontSize: '11px', marginBottom: '8px' }}>Mom Starting Owe (៛)</label>
              <CurrencyInput value={persOweRiel} onChange={(v: any) => setPersOweRiel(Number(v) || 0)} onBlur={() => updateSetting('personal_owe_riel', persOweRiel)} className="saas-input" />
            </div>
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '16px', borderRadius: '8px' }}>
              <label className="saas-card-title" style={{ color: '#991b1b', display: 'block', fontSize: '11px', marginBottom: '8px' }}>Mom Starting Owe ($)</label>
              <CurrencyInput value={persOweUsd} onChange={(v: any) => setPersOweUsd(Number(v) || 0)} onBlur={() => updateSetting('personal_owe_usd', persOweUsd)} className="saas-input" />
            </div>
          </div>
        </div>

        {/* === CARD 5: SYSTEM MAINTENANCE === */}
        <div className="saas-card red" style={{ gridColumn: '1 / -1', background: '#fff1f2' }}>
          <h2 className="saas-card-title" style={{ color: '#be123c', fontSize: '16px' }}>🛠️ System Maintenance</h2>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginTop: '16px' }}>
            <div style={{ flex: 1, minWidth: '250px' }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 'bold', color: '#991b1b' }}>Reset UI Layouts</h3>
              <p style={{ fontSize: '13px', color: '#ef4444', margin: 0, lineHeight: 1.5 }}>
                If your tables disappear or column widths get completely broken because of accidental dragging, click this button to factory reset all table views across the app.
              </p>
            </div>
            <button onClick={handleResetLayouts} disabled={isResetting} className="saas-btn saas-btn-danger" style={{ padding: '12px 24px', whiteSpace: 'nowrap' }}>
              {isResetting ? 'Processing...' : '⚠️ Reset All Tables'}
            </button>
          </div>
        </div>

      </div>
      
      <style jsx global>{`
        /* 🔥 DESKTOP LAYOUT */
        .main-wrapper { 
          padding: max(20px, env(safe-area-inset-top, 20px)) 24px 24px 24px; 
          background: #f8fafc; 
          font-family: Arial, sans-serif; 
          box-sizing: border-box; 
          color: #333;
          width: 100%;
          
          /* 👇 SCROLL FIX 👇 */
          height: 100dvh; 
          overflow-y: auto; 
          -webkit-overflow-scrolling: touch;
        }

        .header-container { 
          display: flex;
          justify-content: flex-start;
          align-items: center; 
          margin-bottom: 24px; 
          margin-top: 0;
          margin-left: 60px; 
          gap: 12px;
          min-height: 42px;
          width: 100%;
          max-width: 1600px;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .settings-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr));
          gap: 24px;
          /* Screen Fill Bounds */
          width: 100%;
          max-width: 1600px;
          margin-left: auto;
          margin-right: auto;
        }

        /* 🔥 MATCHED MOBILE OVERRIDES */
        @media (max-width: 1023px) { 
          .main-wrapper { 
            padding: max(20px, env(safe-area-inset-top, 20px)) 16px 16px 16px !important; 
            
            /* 👇 MOBILE SCROLL FIX 👇 */
            height: 100dvh !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch !important;
          }
          .header-container { 
            margin-left: 54px !important; 
            margin-right: 0 !important; 
            margin-bottom: 24px !important; 
            margin-top: 0 !important;
            display: flex !important;
            flex-direction: row !important;
            justify-content: flex-start !important;
            align-items: center !important; 
            min-height: 44px !important;
            width: calc(100% - 54px) !important;
          }
          .header-left {
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            gap: 12px !important;
          }

          .settings-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  )
}