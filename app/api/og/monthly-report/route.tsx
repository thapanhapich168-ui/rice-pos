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

  // --- IMAGE 1: EXECUTIVE FINANCIAL SUMMARY ---
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
          background: '#0f172a',
          color: '#ffffff',
          fontFamily: 'sans-serif'
        }}>
          <div style={{ fontSize: 24, color: '#38bdf8', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 8 }}>
            Rice Business — Monthly Report
          </div>
          <div style={{ fontSize: 42, fontWeight: 'bold', color: '#f8fafc', marginBottom: 32 }}>
            {monthName} Executive Summary
          </div>

          <div style={{ display: 'flex', gap: '20px', marginBottom: 32 }}>
            <div style={{ flex: 1, background: '#1e293b', padding: '24px', borderRadius: '16px', borderLeft: '6px solid #10b981', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 18, color: '#94a3b8' }}>Gross Profit Margin</span>
              <span style={{ fontSize: 44, fontWeight: 'bold', color: '#10b981', marginTop: 8 }}>{margin}%</span>
            </div>
            <div style={{ flex: 1, background: '#1e293b', padding: '24px', borderRadius: '16px', borderLeft: '6px solid #3b82f6', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 18, color: '#94a3b8' }}>Net Retained Cash Flow</span>
              <span style={{ fontSize: 38, fontWeight: 'bold', color: netCashFlow >= 0 ? '#10b981' : '#ef4444', marginTop: 8 }}>{formatRiel(netCashFlow)}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '20px' }}>
            <div style={{ flex: 1, background: '#1e293b', padding: '24px', borderRadius: '16px', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 16, color: '#94a3b8' }}>Gross Sales</span>
              <span style={{ fontSize: 32, fontWeight: 'bold', color: '#38bdf8', marginTop: 8 }}>{formatRiel(sales)}</span>
            </div>
            <div style={{ flex: 1, background: '#1e293b', padding: '24px', borderRadius: '16px', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 16, color: '#94a3b8' }}>Gross Profit</span>
              <span style={{ fontSize: 32, fontWeight: 'bold', color: '#10b981', marginTop: 8 }}>{formatRiel(profit)}</span>
            </div>
            <div style={{ flex: 1, background: '#1e293b', padding: '24px', borderRadius: '16px', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 16, color: '#94a3b8' }}>Outflow Expenses</span>
              <span style={{ fontSize: 28, fontWeight: 'bold', color: '#ef4444', marginTop: 8 }}>{formatRiel(expenseRiel)}</span>
              <span style={{ fontSize: 20, fontWeight: 'bold', color: '#ef4444' }}>{formatUSD(expenseUsd)}</span>
            </div>
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    )
  }

  // --- IMAGE 2: OWNER ALLOCATION SCORECARD ---
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
          background: '#0f172a',
          color: '#ffffff',
          fontFamily: 'sans-serif'
        }}>
          <div style={{ fontSize: 24, color: '#38bdf8', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 8 }}>
            Rice Business — Monthly Report
          </div>
          <div style={{ fontSize: 42, fontWeight: 'bold', color: '#f8fafc', marginBottom: 40 }}>
            {monthName} Owner Profit Allocation
          </div>

          <div style={{ display: 'flex', gap: '24px' }}>
            <div style={{ flex: 1, background: '#1e293b', padding: '32px', borderRadius: '20px', borderTop: '8px solid #10b981', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 26, fontWeight: 'bold', color: '#4ade80' }}>🟢 Pich (Partner)</span>
              <span style={{ fontSize: 18, color: '#94a3b8', marginTop: 24 }}>Profit Earned</span>
              <span style={{ fontSize: 38, fontWeight: 'bold', color: '#ffffff', marginTop: 8 }}>{formatRiel(pichProfit)}</span>
            </div>
            <div style={{ flex: 1, background: '#1e293b', padding: '32px', borderRadius: '20px', borderTop: '8px solid #3b82f6', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 26, fontWeight: 'bold', color: '#60a5fa' }}>🔵 Jing (Partner)</span>
              <span style={{ fontSize: 18, color: '#94a3b8', marginTop: 24 }}>Profit Earned</span>
              <span style={{ fontSize: 38, fontWeight: 'bold', color: '#ffffff', marginTop: 8 }}>{formatRiel(jingProfit)}</span>
            </div>
            <div style={{ flex: 1, background: '#1e293b', padding: '32px', borderRadius: '20px', borderTop: '8px solid #f59e0b', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 26, fontWeight: 'bold', color: '#facc15' }}>🟡 Both (Shared)</span>
              <span style={{ fontSize: 18, color: '#94a3b8', marginTop: 24 }}>Profit Earned</span>
              <span style={{ fontSize: 38, fontWeight: 'bold', color: '#ffffff', marginTop: 8 }}>{formatRiel(bothProfit)}</span>
            </div>
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    )
  }

  // --- IMAGE 3: TOP EXPENSE CATEGORY ---
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
        background: '#0f172a',
        color: '#ffffff',
        fontFamily: 'sans-serif'
      }}>
        <div style={{ fontSize: 24, color: '#38bdf8', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 8 }}>
          Rice Business — Monthly Report
        </div>
        <div style={{ fontSize: 42, fontWeight: 'bold', color: '#f8fafc', marginBottom: 40 }}>
          {monthName} Expense Breakdown
        </div>

        <div style={{ background: '#1e293b', padding: '36px', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <span style={{ fontSize: 22, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 'bold' }}>
            Largest Outflow Category
          </span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #334155', paddingBottom: '20px' }}>
            <span style={{ fontSize: 36, fontWeight: 'bold', color: '#f8fafc' }}>{topCat}</span>
            <span style={{ fontSize: 38, fontWeight: 'bold', color: '#ef4444' }}>{formatRiel(topCatAmt)}</span>
          </div>
          <span style={{ fontSize: 18, color: '#64748b' }}>
            Total operational & personal expenses combined: {formatRiel(expenseRiel)} / {formatUSD(expenseUsd)}
          </span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}