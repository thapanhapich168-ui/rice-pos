'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import * as htmlToImage from 'html-to-image'

export default function CogsReportPage() {
  const [sales, setSales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'mom' | 'others'>('mom')
  const [isDeviceMobile, setIsDeviceMobile] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  
  const reportRef = useRef<HTMLDivElement>(null)

  // Date filtering (Defaults to Today)
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')

  useEffect(() => {
    // Check mobile device for button rendering
    const isMobile = window.innerWidth < 1024 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    setIsDeviceMobile(isMobile);

    // Set initial dates to today
    const tzoffset = (new Date()).getTimezoneOffset() * 60000;
    const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, 10);
    setFromDate(localISOTime);
    setToDate(localISOTime);
  }, [])

  useEffect(() => {
    if (fromDate && toDate) fetchReportData();
  }, [fromDate, toDate])

  async function fetchReportData() {
    setLoading(true)
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .gte('created_at', `${fromDate}T00:00:00`)
      .lte('created_at', `${toDate}T23:59:59`)
      .order('invoice_id', { ascending: true })

    if (error) {
      console.error(error)
    } else {
      setSales(data || [])
    }
    setLoading(false)
  }

  // --- IMAGE EXPORT LOGIC ---
  const handleDownload = async () => {
    if (!reportRef.current) return;
    setIsCapturing(true);
    try {
      await document.fonts.ready;
      const dataUrl = await htmlToImage.toPng(reportRef.current, { pixelRatio: 2, backgroundColor: '#ffffff' });
      const link = document.createElement('a');
      link.download = `COGS-Report-${fromDate}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to download image', err);
    } finally {
      setIsCapturing(false);
    }
  }

  const handleMobileShare = async () => {
    if (!reportRef.current) return;
    setIsCapturing(true);
    try {
      await document.fonts.ready;
      const dataUrl = await htmlToImage.toPng(reportRef.current, { pixelRatio: 2, backgroundColor: '#ffffff' });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `COGS-Report-${fromDate}.png`, { type: 'image/png' });
      
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `COGS Report` });
      } else {
        const link = document.createElement('a');
        link.download = `COGS-Report-${fromDate}.png`;
        link.href = dataUrl;
        link.click();
      }
    } catch (err) {
      console.error('Failed to share image', err);
    } finally {
      setIsCapturing(false);
    }
  }

  const handleNativePrint = () => {
    window.print();
  }

  // --- DATA PROCESSING LOGIC ---
  const filteredSales = sales.filter(s => {
    const owner = (s.owner || '').toLowerCase().trim();
    if (activeTab === 'mom') {
      return owner === 'mom' || owner === '' || owner === 'none' || owner === 'null';
    } else {
      return owner === 'pich' || owner === 'jing' || owner === 'both';
    }
  });

  const groupedBySeller: Record<string, any[]> = {};
  filteredSales.forEach(s => {
    const seller = s.owner || 'Mom (Retail)';
    if (!groupedBySeller[seller]) groupedBySeller[seller] = [];
    groupedBySeller[seller].push(s);
  });

  const processSellerData = (sellerSales: any[]) => {
    const customerGroups: Record<string, any[]> = {};
    
    sellerSales.forEach(row => {
      const customer = row.customer_name || 'Walk-in';
      if (!customerGroups[customer]) customerGroups[customer] = [];
      customerGroups[customer].push(row);
    });

    const finalRows: any[] = [];
    let sellerGrandTotal = 0;

    Object.keys(customerGroups).forEach(customer => {
      const group = customerGroups[customer];
      let normalRows: any[] = [];
      let douRows: any[] = [];
      let specialRows: any[] = [];

      group.forEach(item => {
        const desc = item.rice_type || '';
        const price = Number(item.cogs_price || 0);

        if (desc.includes('សេវាដឹក')) return;
        if (desc.includes('បាវ') && price === 0) return;

        if (desc.startsWith('ដូរ') || desc.includes('បញ្ចុះតម្លៃ') || desc.includes('កក់')) {
          douRows.push(item);
        } else if (desc.includes('ថ្លៃបាវ ប្រ៊េន') || desc.includes('ថ្លៃបាវ ស')) {
          specialRows.push(item);
        } else {
          normalRows.push(item);
        }
      });

      specialRows.sort((a, b) => (a.rice_type || '').localeCompare(b.rice_type || ''));
      const sortedGroup = [...normalRows, ...specialRows, ...douRows];

      sortedGroup.forEach((item, index) => {
        const qty = Number(item.qty || 0);
        const price = Number(item.cogs_price || 0);
        let amount = qty * price;

        const isNegative = (item.rice_type || '').startsWith('ដូរ') || (item.rice_type || '').includes('បញ្ចុះតម្លៃ') || (item.rice_type || '').includes('កក់');
        if (isNegative) amount = -Math.abs(amount);

        sellerGrandTotal += amount;

        finalRows.push({
          ...item,
          calculatedAmount: amount,
          isNegative,
          isFirstOfCustomer: index === 0,
          rowSpan: index === 0 ? sortedGroup.length : 0
        });
      });
    });

    return { rows: finalRows, sellerGrandTotal };
  };

  let combinedGrandTotal = 0;

  return (
    <div className="main-wrapper">
      
      {/* HEADER & GLOBAL CONTROLS */}
      <div className="header-container" style={{ paddingRight: '20px' }}>
        <h1 className="page-title">🌾 COGS Accounting</h1>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          {isDeviceMobile ? (
            <button onClick={handleMobileShare} disabled={isCapturing} className="action-btn share-btn">
              {isCapturing ? '⏳...' : '📤 Share Report'}
            </button>
          ) : (
            <button onClick={handleDownload} disabled={isCapturing} className="action-btn download-btn">
              {isCapturing ? '⏳ Saving...' : '⬇️ Download A4'}
            </button>
          )}
          <button onClick={handleNativePrint} className="action-btn print-btn">
            🖨️ Print
          </button>
        </div>
      </div>

      {/* FILTER TOOLBAR */}
      <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px', display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ fontWeight: 'bold', fontSize: '13px', color: '#64748b' }}>From:</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', color: '#0f172a', fontSize: '13px' }} />
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ fontWeight: 'bold', fontSize: '13px', color: '#64748b' }}>To:</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', color: '#0f172a', fontSize: '13px' }} />
        </div>
        <div style={{ borderLeft: '1px solid #e2e8f0', height: '24px', margin: '0 5px' }} />
        
        <div style={{ display: 'flex', gap: '5px', background: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
          <button onClick={() => setActiveTab('mom')} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', background: activeTab === 'mom' ? '#10b981' : 'transparent', color: activeTab === 'mom' ? '#fff' : '#64748b', transition: 'all 0.2s' }}>
            Mom COGS (Retail)
          </button>
          <button onClick={() => setActiveTab('others')} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', background: activeTab === 'others' ? '#b58a3d' : 'transparent', color: activeTab === 'others' ? '#fff' : '#64748b', transition: 'all 0.2s' }}>
            Pich / Jing / Both COGS
          </button>
        </div>
      </div>

      {/* A4 PAPER CONTAINER */}
      <div className="a4-paper-container" ref={reportRef}>
        
        <img className="center-logo" src="https://i.imgur.com/s0hg3MQ.png" alt="Logo" crossOrigin="anonymous" />
        
        <div className="a4-content">
          <h1 style={{ textAlign: 'center', fontSize: '22px', color: 'green', margin: '0 0 20px 0', fontFamily: "'Noto Sans Khmer', Arial, sans-serif", fontWeight: 'bold' }}>
            🌾 អង្ករត្រូវទូទាត់ 🧾
          </h1>

          {loading ? (
            <p style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>Loading records...</p>
          ) : filteredSales.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#94a3b8', padding: '40px' }}>No sales records found for this date range.</p>
          ) : (
            <>
              {Object.keys(groupedBySeller).map((seller) => {
                const { rows, sellerGrandTotal } = processSellerData(groupedBySeller[seller]);
                combinedGrandTotal += sellerGrandTotal;

                return (
                  <div key={seller} style={{ marginBottom: '30px' }}>
                    <h2 style={{ fontSize: '16px', margin: '0 0 8px 0', color: '#333', fontFamily: "'Noto Sans Khmer', Arial, sans-serif", fontWeight: 'bold' }}>
                      ថៅកែ {seller.toUpperCase()}
                    </h2>
                    <table className="report-table">
                      <thead>
                        <tr style={{ backgroundColor: '#fffacd' }}>
                          <th style={{ width: '10%' }}>INV</th>
                          <th style={{ width: '20%' }}>អតិថិជន</th>
                          <th style={{ width: '20%' }}>ប្រភេទអង្ករ</th>
                          <th style={{ width: '20%' }}>ឈ្មោះក្នុងប៊ុង</th>
                          <th style={{ width: '10%' }}>ចំនួន</th>
                          <th style={{ width: '10%' }}>តម្លៃ</th>
                          <th style={{ width: '10%' }}>សរុប</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, idx) => (
                          <tr key={idx}>
                            <td style={{ textAlign: 'center' }}>
                              {row.invoice_id ? String(row.invoice_id).replace(/\D/g, '') : ''}
                            </td>
                            {row.isFirstOfCustomer && (
                              <td rowSpan={row.rowSpan} style={{ verticalAlign: 'middle' }}>
                                {row.customer_name}
                              </td>
                            )}
                            <td>
                              <div style={{ color: '#0f172a' }}>{row.rice_type}</div>
                            </td>
                            <td>{row.custom_rice_type || ''}</td>
                            <td style={{ textAlign: 'center' }}>{row.qty.toLocaleString('en-US')}</td>
                            <td style={{ textAlign: 'center' }}>{Number(row.cogs_price).toLocaleString('en-US')}</td>
                            <td style={{ textAlign: 'center', color: row.isNegative ? 'red' : 'inherit' }}>
                              {Math.round(row.calculatedAmount).toLocaleString('en-US')}
                            </td>
                          </tr>
                        ))}
                        
                        {/* COMBINED GRAND TOTAL ROW FOR SELLER */}
                        <tr style={{ backgroundColor: '#fffacd', fontWeight: 'bold' }}>
                          <td colSpan={6} style={{ textAlign: 'right', paddingRight: '15px' }}>សរុប</td>
                          <td style={{ textAlign: 'center', fontSize: '14px' }}>
                            {Math.round(sellerGrandTotal).toLocaleString('en-US')}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })}

              {/* FINAL COMBINED TOTAL FOR ALL SELLERS ON TAB */}
              <div style={{ marginTop: '40px' }}>
                <table className="combined-summary-table" style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #000' }}>
                  <tbody>
                    <tr style={{ backgroundColor: '#fffacd' }}>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', width: '80%', padding: '12px', border: '1px solid #000', fontSize: '16px' }}>
                        សរុបរួមទាំងអស់
                      </td>
                      <td style={{ width: '20%', fontSize: '18px', fontWeight: 'bold', textAlign: 'center', border: '1px solid #000', padding: '12px', color: '#b58a3d' }}>
                        {Math.round(combinedGrandTotal).toLocaleString('en-US')} ៛
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div style={{ textAlign: 'right', marginTop: '20px', fontSize: '12px', color: '#64748b' }}>
                Generated on: {new Date().toLocaleString('en-GB')}
              </div>
            </>
          )}
        </div>
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
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .page-title { 
          font-size: 24px; 
          font-weight: bold; 
          color: #4a3b1b; 
          margin: 0; 
        }

        /* --- ACTION BUTTONS --- */
        .action-btn {
          padding: 10px 16px;
          border-radius: 8px;
          border: none;
          font-weight: bold;
          font-size: 13px;
          cursor: pointer;
          color: #fff;
          transition: background 0.2s;
        }
        .download-btn { background: #b58a3d; }
        .share-btn { background: #3b82f6; }
        .print-btn { background: #10b981; }

        /* --- A4 PAPER STYLING --- */
        .a4-paper-container {
          width: 100%;
          max-width: 794px; /* A4 Width at 96 PPI */
          min-height: 1123px; /* A4 Height */
          margin: 0 auto;
          background: #ffffff;
          padding: 40px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.1);
          border-radius: 4px;
          position: relative;
          overflow: hidden;
          box-sizing: border-box;
        }
        .center-logo {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 300px;
          opacity: 0.05;
          z-index: 0;
          pointer-events: none;
        }
        .a4-content {
          position: relative;
          z-index: 1;
        }
        .report-table {
          width: 100%;
          border-collapse: collapse;
          font-family: 'Noto Sans Khmer', Arial, sans-serif;
          font-size: 13px;
        }
        .report-table th, .report-table td {
          border: 1px solid #000;
          padding: 8px 10px;
        }
        .report-table th {
          font-weight: bold;
          text-align: center;
        }
        .report-table td {
          font-weight: normal; /* Ensures body text is not bold */
        }

        @media print {
          body * { visibility: hidden; }
          .a4-paper-container, .a4-paper-container * { visibility: visible; }
          .a4-paper-container {
            position: absolute;
            left: 0;
            top: 0;
            margin: 0;
            padding: 20px;
            box-shadow: none;
            width: 100%;
          }
          @page { size: A4 portrait; margin: 10mm; }
        }

        @media (max-width: 1023px) { 
          .main-wrapper { 
            padding: max(80px, env(safe-area-inset-top, 80px)) 16px 16px 16px !important; 
          }
          .header-container {
            flex-direction: column;
            align-items: flex-start;
            gap: 16px;
          }
          .a4-paper-container {
            padding: 16px;
            min-height: auto;
          }
        }
      `}</style>
    </div>
  )
}