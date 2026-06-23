'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function LoginPage() {
  const router = useRouter()
  const [checkingAuth, setCheckingAuth] = useState(true)
  
  // Login Form States
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    // Check initial login state, push to POS if session exists
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.push('/pos')
      } else {
        setCheckingAuth(false)
      }
    })

    // Listen for auth adjustments
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        router.push('/pos')
      } else {
        setCheckingAuth(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  // Handle Login submission
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setErrorMsg(error.message)
      setLoading(false)
    } else {
      // Successful login automatically triggers onAuthStateChange above, sending them to /pos
    }
  }

  if (checkingAuth) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'Arial' }}>
        <h3>Checking authentication...</h3>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh', 
      background: '#f3f4f6',
      fontFamily: 'Arial, sans-serif',
      color: '#111'
    }}>
      <div style={{
        background: '#ffffff',
        padding: '40px',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        width: '100%',
        maxWidth: '400px'
      }}>
        <h2 style={{ textAlign: 'center', marginBottom: '10px' }}>🌾 Rice POS</h2>
        <p style={{ textAlign: 'center', color: '#666', marginBottom: '30px' }}>Sign in to manage your business</p>

        {errorMsg && (
          <div style={{ 
            background: '#fee2e2', 
            color: '#b91c1c', 
            padding: '10px', 
            borderRadius: '6px', 
            marginBottom: '20px',
            fontSize: '14px',
            textAlign: 'center'
          }}>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Email Address</label>
            <input 
              type="email" 
              required
              placeholder="admin@ricepos.com" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '6px',
                border: '1px solid #ccc',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: '30px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Password</label>
            <input 
              type="password" 
              required
              placeholder="••••••••" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '6px',
                border: '1px solid #ccc',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              background: '#111827',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}