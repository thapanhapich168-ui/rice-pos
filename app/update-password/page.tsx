'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function UpdatePassword() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    setErrorMsg('')

    const { error } = await supabase.auth.updateUser({
      password: password
    })

    if (error) {
      setErrorMsg(error.message)
      setLoading(false)
    } else {
      setMessage('Password updated! Sending you to login...')
      setTimeout(() => {
        router.push('/')
      }, 2000)
    }
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f8fafc', padding: '20px', fontFamily: 'Arial, sans-serif', boxSizing: 'border-box' }}>
      <div style={{ background: '#ffffff', padding: '40px', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', width: '100%', maxWidth: '380px' }}>
        <h2 style={{ textAlign: 'center', margin: '0 0 8px 0', color: '#111827', fontSize: '24px', fontWeight: 'bold' }}>New Password</h2>
        <p style={{ textAlign: 'center', color: '#64748b', margin: '0 0 30px 0', fontSize: '14px' }}>Please type your new secure password.</p>

        {message && (
          <div style={{ background: '#dcfce7', color: '#166534', padding: '10px', borderRadius: '6px', marginBottom: '20px', fontSize: '13px', textAlign: 'center', fontWeight: 'bold' }}>
            {message}
          </div>
        )}
        
        {errorMsg && (
          <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '10px', borderRadius: '6px', marginBottom: '20px', fontSize: '13px', textAlign: 'center', fontWeight: 'bold' }}>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleUpdatePassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', fontSize: '12px', color: '#475569', textTransform: 'uppercase' }}>New Password</label>
            <div style={{ position: 'relative' }}>
              <input 
                type={showPassword ? "text" : "password"} 
                required 
                minLength={6}
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                style={{ width: '100%', padding: '12px', paddingRight: '40px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', outline: 'none', fontSize: '14px', color: '#333' }} 
                onFocus={e => e.target.style.borderColor = '#b58a3d'} 
                onBlur={e => e.target.style.borderColor = '#cbd5e1'} 
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" y1="2" x2="22" y2="22" /></svg>
                )}
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading} 
            style={{ width: '100%', padding: '14px', background: '#22c55e', color: 'white', border: 'none', borderRadius: '6px', fontSize: '15px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer', marginTop: '10px', transition: 'background 0.2s' }}
            onMouseOver={e => e.currentTarget.style.background = '#16a34a'}
            onMouseOut={e => e.currentTarget.style.background = '#22c55e'}
          >
            {loading ? 'Saving...' : 'Save Password'}
          </button>
        </form>
      </div>
    </div>
  )
}