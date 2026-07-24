'use client'

import React, { useState, useEffect, useRef } from 'react';

interface AirtableHeaderProps {
  label: string;
  onSortAsc?: () => void;
  onSortDesc?: () => void;
  onFilter?: () => void;
}

export default function AirtableHeader({ label, onSortAsc, onSortDesc, onFilter }: AirtableHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="airtable-th-content">
      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {/* Airtable "A" text icon placeholder */}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.6 }}>
          <path d="M6.9 2.5L2.2 13.5h1.6l1.3-3.1h5.8l1.3 3.1h1.6L9.1 2.5H6.9zm1.3 2l2.3 5.4H5.5l2.7-5.4z"/>
        </svg>
        {label}
      </span>

      <div style={{ position: 'relative' }} ref={menuRef}>
        <div 
          className="airtable-chevron" 
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.8 5.8l4.2 4.2 4.2-4.2 1.1 1.1-5.3 5.3-5.3-5.3z"/>
          </svg>
        </div>

        {isOpen && (
          <div className="airtable-dropdown-menu" onClick={(e) => e.stopPropagation()}>
            <div className="airtable-menu-item">
              <svg viewBox="0 0 16 16"><path d="M12.9 4.5l-1.4-1.4c-.4-.4-1-.4-1.4 0L3 10.2V13h2.8l7.1-7.1c.4-.4.4-1 0-1.4zm-8.8 7.3v-1.6l5.7-5.7 1.6 1.6-5.7 5.7H4.1z"/></svg>
              Edit field
            </div>
            <div className="airtable-menu-item">
              <svg viewBox="0 0 16 16"><path d="M11 2H3c-.6 0-1 .4-1 1v8h1.5V3.5h6.5V2zm2 2.5H5c-.6 0-1 .4-1 1v8c0 .6.4 1 1 1h8c.6 0 1-.4 1-1v-8c0-.6-.4-1-1-1zM13 13H5.5V6.5H13V13z"/></svg>
              Duplicate field
            </div>
            
            <div className="airtable-menu-divider"></div>
            
            <div className="airtable-menu-item disabled">
              <svg viewBox="0 0 16 16"><path d="M12.5 7.2H5.4l2.9-2.9L7.2 3.2 2.4 8l4.8 4.8 1.1-1.1-2.9-2.9h7.1v-1.6z"/></svg>
              Insert left
            </div>
            <div className="airtable-menu-item">
              <svg viewBox="0 0 16 16"><path d="M3.5 8.8h7.1l-2.9 2.9 1.1 1.1L13.6 8 8.8 3.2 7.7 4.3l2.9 2.9H3.5v1.6z"/></svg>
              Insert right
            </div>
            <div className="airtable-menu-item">
              <svg viewBox="0 0 16 16"><path d="M12.5 7.2H5.4l2.9-2.9L7.2 3.2 2.4 8l4.8 4.8 1.1-1.1-2.9-2.9h7.1v-1.6z"/></svg>
              Change primary field
            </div>

            <div className="airtable-menu-divider"></div>

            <div className="airtable-menu-item"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="2"/><circle cx="3" cy="8" r="2"/><circle cx="13" cy="8" r="2"/></svg> Create overview for company</div>
            <div className="airtable-menu-item"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="2"/><circle cx="3" cy="8" r="2"/><circle cx="13" cy="8" r="2"/></svg> Find basic info for company</div>
            <div className="airtable-menu-item"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="2"/><circle cx="3" cy="8" r="2"/><circle cx="13" cy="8" r="2"/></svg> Pull financial info for company</div>

            <div className="airtable-menu-divider"></div>

            <div className="airtable-menu-item"><svg viewBox="0 0 16 16"><path d="M6 10H4c-1.1 0-2-.9-2-2s.9-2 2-2h2V4H4c-2.2 0-4 1.8-4 4s1.8 4 4 4h2v-2zm8-6h-2v2h2c1.1 0 2 .9 2 2s-.9 2-2 2h-2v2h2c2.2 0 4-1.8 4-4s-1.8-4-4-4zm-8.5 5h5v-1.5h-5V9z"/></svg> Copy field URL</div>
            <div className="airtable-menu-item"><svg viewBox="0 0 16 16"><path d="M8 2C4.7 2 2 4.7 2 8s2.7 6 6 6 6-2.7 6-6-2.7-6-6-6zm1 9H7V7h2v4zm0-5H7V4h2v2z"/></svg> Edit field description</div>
            <div className="airtable-menu-item"><svg viewBox="0 0 16 16"><path d="M11 6V4.5C11 2.6 9.4 1 7.5 1S4 2.6 4 4.5V6H3v8h9V6h-1zm-5.5-1.5c0-1.1.9-2 2-2s2 .9 2 2V6h-4V4.5z"/></svg> Edit field permissions</div>

            <div className="airtable-menu-divider"></div>

            <div className="airtable-menu-item" onClick={() => { onSortAsc?.(); setIsOpen(false); }}>
              <svg viewBox="0 0 16 16"><path d="M1.5 4h5v1.5h-5zM1.5 7h8v1.5h-8zM1.5 10h11v1.5h-11z"/></svg> Sort A → Z
            </div>
            <div className="airtable-menu-item" onClick={() => { onSortDesc?.(); setIsOpen(false); }}>
              <svg viewBox="0 0 16 16"><path d="M1.5 10h5v1.5h-5zM1.5 7h8v1.5h-8zM1.5 4h11v1.5h-11z"/></svg> Sort Z → A
            </div>
            <div className="airtable-menu-item" onClick={() => { onFilter?.(); setIsOpen(false); }}>
              <svg viewBox="0 0 16 16"><path d="M14 3H2l4.8 5.6v4.9l2.4-1.2V8.6L14 3z"/></svg> Filter by this field
            </div>
            <div className="airtable-menu-item"><svg viewBox="0 0 16 16"><path d="M2 3h12v1.5H2zM2 7h12v1.5H2zM2 11h12v1.5H2z"/></svg> Group by this field</div>
            <div className="airtable-menu-item"><svg viewBox="0 0 16 16"><path d="M12 8V6H8V4h2L7.5 1 5 4h2v2H3v2H1v5h5v-5H4V8h8v2h-2l2.5 3 2.5-3h-2V8z"/></svg> Show dependencies</div>

            <div className="airtable-menu-divider"></div>

            <div className="airtable-menu-item disabled"><svg viewBox="0 0 16 16"><path d="M8 3c-4.4 0-8 5-8 5s3.6 5 8 5 8-5 8-5-3.6-5-8-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5S6.1 4.5 8 4.5s3.5 1.6 3.5 3.5S9.9 11.5 8 11.5z"/></svg> Hide field</div>
            <div className="airtable-menu-item danger"><svg viewBox="0 0 16 16"><path d="M13 4h-2.5V2.5c0-.8-.7-1.5-1.5-1.5H7c-.8 0-1.5.7-1.5 1.5V4H3v1.5h1v8C4 14.3 4.7 15 5.5 15h5c.8 0 1.5-.7 1.5-1.5v-8h1V4zM7 2.5h2V4H7V2.5zM10.5 13.5h-5v-8h5v8z"/></svg> Delete field</div>
          </div>
        )}
      </div>
    </div>
  );
}