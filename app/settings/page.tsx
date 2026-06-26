'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUser(user)
      setLoading(false)
    })
  }, [])

  const handleSignOut = async () => {
    if(!confirm("Are you sure you want to sign out?")) return;
    
    await supabase.auth.signOut();
    router.push('/');
  }

  return (
    <div className="main-wrapper">
      <div className="header-container">
        <h1 className="page-title">⚙️ Access & Settings</h1>
      </div>

      <div className="settings-card">
        <h2 className="card-subtitle">Active Session Details</h2>
        
        <div className="session-info-box">
          <div className="info-label">Currently Authenticated As:</div>
          <div className="info-value">
            {loading ? 'Loading...' : (currentUser?.email || 'Unknown User')}
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
      
      <style jsx global>{`
        .main-wrapper { 
          padding: 24px 24px 24px 75px; 
          background: #f8fafc; 
          min-height: 100vh; 
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
        .settings-card {
          background: #fff; 
          padding: 30px; 
          border-radius: 12px; 
          border: 1px solid #e2e8f0; 
          max-width: 600px; 
          box-shadow: 0 4px 6px rgba(0,0,0,0.02);
        }
        .card-subtitle {
          margin: 0 0 16px 0; 
          font-size: 16px; 
          color: #0f172a;
        }
        .session-info-box {
          background: #f8fafc; 
          padding: 16px; 
          border-radius: 8px; 
          border: 1px solid #e2e8f0; 
          margin-bottom: 24px;
        }
        .info-label {
          font-size: 13px; 
          color: #64748b; 
          margin-bottom: 4px;
          font-weight: bold;
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
        .section-title {
          margin: 0 0 12px 0; 
          font-size: 14px; 
          color: #111827;
        }
        .section-text {
          font-size: 13px; 
          color: #64748b; 
          margin-bottom: 16px; 
          line-height: 1.5;
        }
        .signout-btn {
          background: #111827; 
          color: #fff; 
          border: none; 
          padding: 12px 24px; 
          border-radius: 8px; 
          font-weight: bold; 
          cursor: pointer; 
          font-size: 14px; 
          transition: background 0.2s;
        }
        .signout-btn:hover {
          background: #334155;
        }
        
        @media (max-width: 768px) { 
          .main-wrapper { 
            padding: max(80px, env(safe-area-inset-top, 80px)) 16px 16px 16px !important; 
          }
          .settings-card {
            padding: 20px;
          }
          .signout-btn {
            width: 100%;
          }
        }
      `}</style>
    </div>
  )
}