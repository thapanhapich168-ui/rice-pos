// app/api/cron/send-cogs-a4/route.tsx

import { NextResponse } from 'next/server';
import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';
import { TELEGRAM_CONFIG } from '@/lib/telegramConfig';

export const runtime = 'edge'; // Optional: Edge runtime is super fast for ImageResponse

const EXCHANGE_RATE = 4000;
const formatRiel = (val: number) => `${Math.round(val || 0).toLocaleString()} ៛`;

function parseOwner(owner?: string): 'Mom' | 'Pich' | 'Jing' | 'Both' | 'Others' {
  if (!owner) return 'Others';
  const clean = owner.toLowerCase().trim();
  if (clean.includes('mom')) return 'Mom';
  if (clean.includes('pich')) return 'Pich';
  if (clean.includes('jing')) return 'Jing';
  if (clean.includes('both')) return 'Both';
  return 'Others';
}

export async function GET(request: Request) {
  try {
    // 1. Security Check (Cron Secret)
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Initialize Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 3. Cambodia Timezone Date (Asia/Phnom_Penh | UTC+7)
    const tzOffset = 7 * 60 * 60 * 1000;
    const todayCambodia = new Date(Date.now() + tzOffset).toISOString().slice(0, 10);

    // 4. Fetch Wholesale and Retail sales for Today
    const [{ data: sales }, { data: retailSales }] = await Promise.all([
      supabase.from('sales').select('*').gte('created_at', `${todayCambodia}T00:00:00`),
      supabase.from('retail_sales').select('*').gte('created_at', `${todayCambodia}T00:00:00`)
    ]);

    const allSales = [...(sales || []), ...(retailSales || [])];

    // 5. Group and Calculate COGS by Owner
    const ownersList = ['Mom', 'Pich', 'Jing', 'Both'] as const;
    const cogsByOwner: Record<string, { total: number; count: number }> = {
      Mom: { total: 0, count: 0 },
      Pich: { total: 0, count: 0 },
      Jing: { total: 0, count: 0 },
      Both: { total: 0, count: 0 },
      Others: { total: 0, count: 0 }
    };

    let grandTotal = 0;

    allSales.forEach((item) => {
      const owner = parseOwner(item.owner);
      const desc = item.custom_rice_type || item.rice_type || '';
      const price = Number(item.cogs_price || 0);
      const qty = Number(item.qty || 0);

      // Skip delivery service or $0 bag items
      if (desc.includes('សេវាដឹក') || (desc.includes('បាវ') && price === 0)) return;

      let amount = Math.abs(qty * price);
      if (desc.includes('ដូរ') || desc.includes('បញ្ចុះតម្លៃ') || desc.includes('កក់')) {
        amount = -amount;
      }

      cogsByOwner[owner].total += amount;
      cogsByOwner[owner].count += 1;
      grandTotal += amount;
    });

    // 6. 🔥 GENERATE A4 VISUAL IMAGE (1200 x 1698 px | A4 Ratio 1:1.415)
    // Note: next/og uses Satori, which requires display: 'flex' for all layouts
    const imageResponse = new ImageResponse(
      (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            backgroundColor: '#ffffff',
            padding: '60px',
            fontFamily: 'sans-serif',
            color: '#0f172a',
            border: '12px solid #f8fafc',
            boxSizing: 'border-box'
          }}
        >
          {/* Document Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '4px solid #15803d', paddingBottom: '24px', marginBottom: '40px' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#15803d' }}>
                🌾 COGS ACCOUNTING SHEET
              </div>
              <div style={{ fontSize: '18px', color: '#64748b', marginTop: '8px' }}>
                Daily Cost of Goods Sold Breakdown by Owner
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#0f172a' }}>
                📅 {todayCambodia}
              </div>
              <div style={{ fontSize: '16px', color: '#64748b', marginTop: '4px' }}>
                Phnom Penh, Cambodia
              </div>
            </div>
          </div>

          {/* Table Header Row */}
          <div
            style={{
              display: 'flex',
              backgroundColor: '#fef9c3',
              border: '2px solid #000000',
              padding: '16px 24px',
              fontWeight: 'bold',
              fontSize: '20px',
              marginBottom: '12px'
            }}
          >
            <div style={{ width: '35%' }}>ACCOUNT OWNER</div>
            <div style={{ width: '25%', textAlign: 'center' }}>TRANSACTIONS</div>
            <div style={{ width: '40%', textAlign: 'right' }}>COGS AMOUNT (៛)</div>
          </div>

          {/* Table Rows for Mom, Pich, Jing, Both */}
          {ownersList.map((ownerName) => {
            const data = cogsByOwner[ownerName];
            return (
              <div
                key={ownerName}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  borderBottom: '2px solid #cbd5e1',
                  borderLeft: '2px solid #000000',
                  borderRight: '2px solid #000000',
                  padding: '24px',
                  fontSize: '24px',
                  backgroundColor: '#ffffff'
                }}
              >
                <div style={{ width: '35%', fontWeight: 'bold', color: '#1e293b' }}>
                  {ownerName === 'Mom' ? '👩 Mom' : ownerName === 'Pich' ? '🟢 Pich' : ownerName === 'Jing' ? '🔵 Jing' : '🟡 Both'}
                </div>
                <div style={{ width: '25%', textAlign: 'center', color: '#64748b' }}>
                  {data.count} items
                </div>
                <div style={{ width: '40%', textAlign: 'right', fontWeight: 'bold', color: '#b58a3d' }}>
                  {formatRiel(data.total)}
                </div>
              </div>
            );
          })}

          {/* Others Row (Only if non-zero) */}
          {cogsByOwner.Others.total !== 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                borderBottom: '2px solid #cbd5e1',
                borderLeft: '2px solid #000000',
                borderRight: '2px solid #000000',
                padding: '24px',
                fontSize: '24px'
              }}
            >
              <div style={{ width: '35%', fontWeight: 'bold' }}>⚪ Others</div>
              <div style={{ width: '25%', textAlign: 'center', color: '#64748b' }}>{cogsByOwner.Others.count} items</div>
              <div style={{ width: '40%', textAlign: 'right', fontWeight: 'bold', color: '#64748b' }}>{formatRiel(cogsByOwner.Others.total)}</div>
            </div>
          )}

          {/* Grand Total Box */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#fef9c3',
              border: '3px solid #000000',
              padding: '28px',
              marginTop: '40px',
              fontSize: '28px',
              fontWeight: 'bold'
            }}
          >
            <div style={{ color: '#0f172a' }}>TOTAL COGS DUE</div>
            <div style={{ color: '#b58a3d', fontSize: '34px' }}>{formatRiel(grandTotal)}</div>
          </div>

          {/* Footer Watermark */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto', borderTop: '1px solid #e2e8f0', paddingTop: '20px', fontSize: '16px', color: '#94a3b8' }}>
            <div>Generated by COGS Automated Engine</div>
            <div>A4 Accounting Document • Verified</div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 1698 // 1 : 1.415 A4 Aspect Ratio
      }
    );

    // 7. Convert ImageResponse to Blob for Telegram Upload
    const arrayBuffer = await imageResponse.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: 'image/png' });

    // 8. Upload Directly to Telegram Group
    const botToken = TELEGRAM_CONFIG.botToken;
    const chatId = TELEGRAM_CONFIG.chatId;

    const tgFormData = new FormData();
    tgFormData.append('chat_id', chatId);
    tgFormData.append('photo', blob, `COGS-A4-${todayCambodia}.png`);
    tgFormData.append(
      'caption',
      `🌾 <b>A4 COGS REPORT (${todayCambodia})</b>\n💰 Total Due: <b>${formatRiel(grandTotal)}</b>`
    );
    tgFormData.append('parse_mode', 'HTML');

    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: 'POST',
      body: tgFormData
    });

    const tgResult = await tgRes.json();

    if (!tgRes.ok) {
      throw new Error(`Telegram Upload Error: ${JSON.stringify(tgResult)}`);
    }

    return NextResponse.json({
      success: true,
      date: todayCambodia,
      totals: cogsByOwner,
      telegramMessageId: tgResult.result?.message_id
    });

  } catch (error: any) {
    console.error('COGS A4 Telegram Cron Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}