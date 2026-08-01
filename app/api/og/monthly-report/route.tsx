import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

const formatRiel = (val: number) => `${Math.round(val || 0).toLocaleString()}៛`
const formatUSD = (val: number) => `$${Number(val || 0).toFixed(2)}`

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const cardType = searchParams.get('card') || 'summary'
  
  const sales = Number(searchParams.get('sales') || 0)
  const profit = Number(searchParams.get('profit') || 0)
  const expenseRiel = Number(searchParams.get('expRiel') || 0)
  const expenseUsd = Number(searchParams.get('expUsd') || 0)
  const monthName = searchParams.get('month') || 'Current Month'

  // --- IMAGE 1: EXECUTIVE FINANCIAL SUMMARY (VIBRANT COLOR THEME) ---
  if (cardType === 'summary') {
    const margin = sales > 0 ? ((profit / sales) * 100).toFixed(1) : '0.0'
    const totalExpEq = expenseRiel + (expenseUsd * 4100)
    const netCashFlow = profit - totalExpEq

    return new ImageResponse(
      (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          padding: '40px',
          background: '#f8fafc',
          color: '#0f172a',
          fontFamily: 'sans-serif'
        }}>
          {/* Top Banner */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '3px solid #2563eb', paddingBottom: 16, marginBottom: 28 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 20, color: '#2563eb', fontWeight: 'bold', textTransform: 'uppercase' }}>
                Rice Business — Monthly Report
              </span>
              <span style={{ fontSize: 40, fontWeight: 'bold', color: '#0f172a', marginTop: 4 }}>
                {monthName} Executive Summary
              </span>
            </div>
            <div style={{ background: '#2563eb', color: '#ffffff', padding: '10px 24px', borderRadius: 50, fontSize: 18, fontWeight: 'bold' }}>
              Official Scorecard
            </div>
          </div>

          {/* Key Metric Highlights */}
          <div style={{ display: 'flex', gap: '20px', marginBottom: 24 }}>
            <div style={{ flex: 1, background: '#ecfdf5', padding: '24px', borderRadius: '16px', border: '2px solid #a7f3d0', borderLeft: '8px solid #10b981', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 18, color: '#047857', fontWeight: 'bold' }}>Gross Profit Margin</span>
              <span style={{ fontSize: 48, fontWeight: 'bold', color: '#065f46', marginTop: 8 }}>{margin}%</span>
            </div>
            <div style={{ flex: 1, background: '#eff6ff', padding: '24px', borderRadius: '16px', border: '2px solid #bfdbfe', borderLeft: '8px solid #3b82f6', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 18, color: '#1d4ed8', fontWeight: 'bold' }}>Net Retained Cash Flow</span>
              <span style={{ fontSize: 42, fontWeight: 'bold', color: netCashFlow >= 0 ? '#1e40af' : '#dc2626', marginTop: 8 }}>{formatRiel(netCashFlow)}</span>
            </div>
          </div>

          {/* Financial Breakdown Grid */}
          <div style={{ display: 'flex', gap: '20px' }}>
            <div style={{ flex: 1, background: '#ffffff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 16, color: '#64748b', fontWeight: 'bold' }}>GROSS SALES</span>
              <span style={{ fontSize: 34, fontWeight: 'bold', color: '#2563eb', marginTop: 8 }}>{formatRiel(sales)}</span>
            </div>
            <div style={{ flex: 1, background: '#ffffff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 16, color: '#64748b', fontWeight: 'bold' }}>GROSS PROFIT</span>
              <span style={{ fontSize: 34, fontWeight: 'bold', color: '#10b981', marginTop: 8 }}>{formatRiel(profit)}</span>
            </div>
            <div style={{ flex: 1, background: '#ffffff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 16, color: '#64748b', fontWeight: 'bold' }}>OUTFLOW EXPENSES</span>
              <span style={{ fontSize: 28, fontWeight: 'bold', color: '#ef4444', marginTop: 8 }}>{formatRiel(expenseRiel)}</span>
              <span style={{ fontSize: 20, fontWeight: 'bold', color: '#ef4444' }}>{formatUSD(expenseUsd)}</span>
            </div>
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    )
  }

  // --- IMAGE 2: OWNER ALLOCATION SCORECARD (VIBRANT COLOR THEME) ---
  if (cardType === 'owners') {
    const pichProfit = Number(searchParams.get('pichP') || 0)
    const jingProfit = Number(searchParams.get('jingP') || 0)
    const bothProfit = Number(searchParams.get('bothP') || 0)

    return new ImageResponse(
      (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          padding: '40px',
          background: '#f8fafc',
          color: '#0f172a',
          fontFamily: 'sans-serif'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '3px solid #10b981', paddingBottom: 16, marginBottom: 36 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 20, color: '#10b981', fontWeight: 'bold', textTransform: 'uppercase' }}>
                Rice Business — Monthly Report
              </span>
              <span style={{ fontSize: 40, fontWeight: 'bold', color: '#0f172a', marginTop: 4 }}>
                {monthName} Owner Profit Allocation
              </span>
            </div>
            <div style={{ background: '#10b981', color: '#ffffff', padding: '10px 24px', borderRadius: 50, fontSize: 18, fontWeight: 'bold' }}>
              Partner Shares
            </div>
          </div>

          <div style={{ display: 'flex', gap: '24px' }}>
            <div style={{ flex: 1, background: '#ffffff', padding: '32px', borderRadius: '20px', border: '1px solid #e2e8f0', borderTop: '10px solid #10b981', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 26, fontWeight: 'bold', color: '#047857' }}>🟢 Pich (Partner)</span>
              <span style={{ fontSize: 18, color: '#64748b', marginTop: 24, fontWeight: 'bold' }}>Profit Earned</span>
              <span style={{ fontSize: 38, fontWeight: 'bold', color: '#0f172a', marginTop: 8 }}>{formatRiel(pichProfit)}</span>
            </div>
            <div style={{ flex: 1, background: '#ffffff', padding: '32px', borderRadius: '20px', border: '1px solid #e2e8f0', borderTop: '10px solid #3b82f6', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 26, fontWeight: 'bold', color: '#1d4ed8' }}>🔵 Jing (Partner)</span>
              <span style={{ fontSize: 18, color: '#64748b', marginTop: 24, fontWeight: 'bold' }}>Profit Earned</span>
              <span style={{ fontSize: 38, fontWeight: 'bold', color: '#0f172a', marginTop: 8 }}>{formatRiel(jingProfit)}</span>
            </div>
            <div style={{ flex: 1, background: '#ffffff', padding: '32px', borderRadius: '20px', border: '1px solid #e2e8f0', borderTop: '10px solid #f59e0b', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 26, fontWeight: 'bold', color: '#b45309' }}>🟡 Both (Shared)</span>
              <span style={{ fontSize: 18, color: '#64748b', marginTop: 24, fontWeight: 'bold' }}>Profit Earned</span>
              <span style={{ fontSize: 38, fontWeight: 'bold', color: '#0f172a', marginTop: 8 }}>{formatRiel(bothProfit)}</span>
            </div>
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    )
  }

  // --- IMAGE 3: TOP EXPENSE CATEGORY (VIBRANT COLOR THEME) ---
  const topCat = searchParams.get('topCat') || 'Inventory Stock'
  const topCatAmt = Number(searchParams.get('topCatAmt') || 0)

  return new ImageResponse(
    (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        padding: '40px',
        background: '#f8fafc',
        color: '#0f172a',
        fontFamily: 'sans-serif'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '3px solid #ef4444', paddingBottom: 16, marginBottom: 36 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 20, color: '#ef4444', fontWeight: 'bold', textTransform: 'uppercase' }}>
              Rice Business — Monthly Report
            </span>
            <span style={{ fontSize: 40, fontWeight: 'bold', color: '#0f172a', marginTop: 4 }}>
              {monthName} Expense Breakdown
            </span>
          </div>
          <div style={{ background: '#ef4444', color: '#ffffff', padding: '10px 24px', borderRadius: 50, fontSize: 18, fontWeight: 'bold' }}>
            Cost Analysis
          </div>
        </div>

        <div style={{ background: '#ffffff', padding: '40px', borderRadius: '20px', border: '2px solid #fecaca', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <span style={{ fontSize: 20, color: '#b91c1c', textTransform: 'uppercase', fontWeight: 'bold' }}>
            Largest Outflow Category
          </span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #f1f5f9', paddingBottom: '24px' }}>
            <span style={{ fontSize: 40, fontWeight: 'bold', color: '#0f172a' }}>{topCat}</span>
            <span style={{ fontSize: 42, fontWeight: 'bold', color: '#dc2626' }}>{formatRiel(topCatAmt)}</span>
          </div>
          <span style={{ fontSize: 18, color: '#64748b', fontWeight: 'bold' }}>
            Total operational & personal expenses combined: {formatRiel(expenseRiel)} / {formatUSD(expenseUsd)}
          </span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}