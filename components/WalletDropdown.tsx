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
    
    // Close on any background scroll to keep the floating portal anchored properly
    const handleScroll = () => setIsOpen(false);

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
      const menuHeight = Math.min(options.length * 45 + 16, 250); 
      const spaceBelow = window.innerHeight - rect.bottom;
      
      setMenuStyles({
        position: 'fixed',
        top: spaceBelow < menuHeight ? rect.top - menuHeight - 8 : rect.bottom + 8,
        left: rect.left,
        width: rect.width,
        zIndex: 2147483647 // Maximum z-index to overlay on top of any mobile modal
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
          background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(226, 232, 240, 0.8)', borderRadius: '14px', 
          boxShadow: '0 20px 40px -10px rgba(0,0,0,0.15), 0 10px 15px -5px rgba(0,0,0,0.05)', 
          overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '6px',
          animation: 'dropdownPop 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <div className="hide-scrollbar" style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
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