'use client'

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface WalletDropdownProps {
  value: string;
  options: string[];
  onChange: (val: string) => void;
  style?: React.CSSProperties;
  placeholder?: string;
  disabled?: boolean;
}

export default function WalletDropdown({ 
  value, 
  options, 
  onChange, 
  style, 
  placeholder = "-- Select Wallet --", 
  disabled = false 
}: WalletDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [menuStyles, setMenuStyles] = useState<React.CSSProperties>({});

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (document.getElementById('universal-wallet-portal')?.contains(event.target as Node)) return;
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    
    // Close on background scroll, but ALLOW scrolling inside the portal itself!
    const handleScroll = (event: Event) => {
      if (document.getElementById('universal-wallet-portal')?.contains(event.target as Node)) return;
      setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScroll, true); 
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen]);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;

    if (!isOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - 16; // Leave a safe 16px buffer from screen bottom
      const spaceAbove = rect.top - 16;
      
      // If space below is tight, figure out whether to flip up or clamp the height
      const showAbove = spaceBelow < 200 && spaceAbove > spaceBelow;
      const calculatedMaxHeight = showAbove ? Math.min(spaceAbove, 220) : Math.min(spaceBelow, 220);

      setMenuStyles({
        position: 'fixed',
        top: showAbove ? rect.top - calculatedMaxHeight - 6 : rect.bottom + 6,
        left: rect.left,
        width: rect.width,
        maxHeight: `${calculatedMaxHeight}px`,
        zIndex: 2147483647 // Maximum z-index to break out of any mobile modal
      });
    }
    setIsOpen(!isOpen);
  };

  const getIcon = (val: string) => {
    if (!val) return '🔍';
    if (val.includes('ABA')) return '📱';
    if (val.includes('Chest')) return '🗄️';
    if (val.includes('Cash')) return '💵';
    if (val.includes('Availability') || val.includes('Mom')) return '👩';
    if (val.includes('Debt')) return '📉';
    return '💳';
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%', ...style }}>
      <div 
        onClick={handleToggle}
        style={{ 
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 14px', background: disabled ? '#f1f5f9' : '#ffffff', 
          border: isOpen ? '2px solid #3b82f6' : '1px solid #cbd5e1', 
          borderRadius: '10px', cursor: disabled ? 'not-allowed' : 'pointer', 
          height: '100%', minHeight: '44px', fontSize: '14px', 
          fontWeight: '600', color: disabled ? '#94a3b8' : '#1e293b',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: isOpen ? '0 0 0 3px rgba(59, 130, 246, 0.1)' : 'inset 0 2px 4px rgba(0,0,0,0.02)'
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: '16px' }}>{getIcon(value)}</span> {value || placeholder}
        </span>
        <span style={{ 
          fontSize: '10px', color: '#64748b', 
          transform: isOpen ? 'rotate(180deg)' : 'none', 
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 
          flexShrink: 0, marginLeft: '8px' 
        }}>▼</span>
      </div>
      
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div id="universal-wallet-portal" style={{ 
          ...menuStyles,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', 
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)', 
          display: 'flex', flexDirection: 'column', padding: '4px', overflow: 'hidden'
        }}>
          <div className="hide-scrollbar" style={{ flex: 1, maxHeight: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch', display: 'flex', flexDirection: 'column', gap: '2px', paddingRight: '2px' }}>
            {options.map((opt: string) => (
              <div 
                key={opt}
                onClick={(e) => { e.stopPropagation(); onChange(opt); setIsOpen(false); }}
                style={{ 
                  padding: '12px 14px', cursor: 'pointer', fontSize: '14px',
                  display: 'flex', alignItems: 'center', gap: '10px',
                  background: value === opt ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                  borderRadius: '10px', color: value === opt ? '#1d4ed8' : '#334155',
                  fontWeight: value === opt ? '700' : '500', transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap'
                }}
                onMouseEnter={(e) => {
                  if (value !== opt) e.currentTarget.style.background = 'rgba(241, 245, 249, 0.8)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = value === opt ? 'rgba(59, 130, 246, 0.1)' : 'transparent';
                }}
              >
                <span style={{ fontSize: '16px' }}>{getIcon(opt)}</span> {opt}
              </div>
            ))}
          </div>
          <style>{`
            @keyframes dropdownPop {
              from { opacity: 0; transform: scale(0.95) translateY(-5px); }
              to { opacity: 1; transform: scale(1) translateY(0); }
            }
          `}</style>
        </div>,
        document.body
      )}
    </div>
  );
}