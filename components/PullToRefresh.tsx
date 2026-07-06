'use client'

import React, { useState, useEffect } from 'react'

export default function PullToRefresh({ children }: { children: React.ReactNode }) {
  const [startY, setStartY] = useState(0)
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Maximum pixels the user can drag down
  const MAX_PULL = 80;
  // Pixels required to trigger the refresh
  const TRIGGER_THRESHOLD = 60;

  const handleTouchStart = (e: React.TouchEvent) => {
    // Only allow pull-to-refresh if the user is at the absolute top of the page
    if (window.scrollY <= 0) {
      setStartY(e.touches[0].clientY);
    } else {
      setStartY(0);
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startY === 0 || isRefreshing) return;

    const currentY = e.touches[0].clientY;
    const diff = currentY - startY;

    // If pulling down
    if (diff > 0 && window.scrollY <= 0) {
      // Add "resistance" to the pull so it feels heavy and native
      const distance = Math.min(diff / 2.5, MAX_PULL);
      setPullDistance(distance);
    }
  }

  const handleTouchEnd = () => {
    if (pullDistance >= TRIGGER_THRESHOLD) {
      setIsRefreshing(true);
      // Vibrate the phone slightly for native haptic feedback (if supported)
      if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
      // Hard reload the page to fetch fresh database data
      window.location.reload();
    } else {
      // Snap back if they didn't pull far enough
      setPullDistance(0);
    }
  }

  return (
    <div 
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ minHeight: '100vh', position: 'relative' }}
    >
      {/* 🔄 Visual Refresh Indicator */}
      <div 
        style={{
          height: `${pullDistance}px`,
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-end',
          overflow: 'hidden',
          backgroundColor: '#f8fafc',
          transition: isRefreshing ? 'height 0.3s ease' : 'none',
        }}
      >
        <div 
          style={{ 
            marginBottom: '15px',
            background: '#ffffff',
            borderRadius: '50%',
            width: '36px',
            height: '36px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
            // Rotates the icon as you pull it down
            transform: `rotate(${pullDistance * 5}deg)`,
            opacity: pullDistance / MAX_PULL
          }}
        >
          {isRefreshing ? (
            <span style={{ fontSize: '18px', animation: 'spin 1s linear infinite' }}>⏳</span>
          ) : (
            <span style={{ fontSize: '18px', color: '#3b82f6' }}>🔄</span>
          )}
        </div>
      </div>

      {/* The rest of your app renders here */}
      <div style={{ transform: isRefreshing ? `translateY(0px)` : 'none' }}>
        {children}
      </div>

      <style jsx>{`
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}