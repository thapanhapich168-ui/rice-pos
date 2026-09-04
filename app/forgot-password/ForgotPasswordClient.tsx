'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function ForgotPassword() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    setErrorMsg('')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    })

    if (error) {
      setErrorMsg(error.message)
    } else {
      setMessage('Recovery email sent! Check your inbox.')
    }
    setLoading(false)
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f8fafc', padding: '20px', fontFamily: 'Arial, sans-serif', boxSizing: 'border-box' }}>
      <div style={{ background: '#ffffff', padding: '40px', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', width: '100%', maxWidth: '380px' }}>
        <h2 style={{ textAlign: 'center', margin: '0 0 8px 0', color: '#111827', fontSize: '24px', fontWeight: 'bold' }}>Reset Password</h2>
        <p style={{ textAlign: 'center', color: '#64748b', margin: '0 0 30px 0', fontSize: '14px' }}>Enter your email to receive a reset link.</p>

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

        <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', fontSize: '12px', color: '#475569', textTransform: 'uppercase' }}>Email Address</label>
            <input 
              type="email" 
              required 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', outline: 'none', fontSize: '14px', color: '#333' }} 
              onFocus={e => e.target.style.borderColor = '#b58a3d'} 
              onBlur={e => e.target.style.borderColor = '#cbd5e1'} 
            />
          </div>

          <button 
            type="submit" 
            disabled={loading} 
            style={{ width: '100%', padding: '14px', background: '#b58a3d', color: 'white', border: 'none', borderRadius: '6px', fontSize: '15px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer', marginTop: '10px', transition: 'background 0.2s' }}
            onMouseOver={e => e.currentTarget.style.background = '#a17a36'}
            onMouseOut={e => e.currentTarget.style.background = '#b58a3d'}
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <button 
            onClick={() => router.push('/')} 
            style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Back to Login
          </button>
        </div>
      </div>
    </div>
  )
}