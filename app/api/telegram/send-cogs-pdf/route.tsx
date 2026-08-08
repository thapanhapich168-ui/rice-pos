// lib/cogsReportSender.ts

import { createClient } from '@supabase/supabase-js';
import { TELEGRAM_CONFIG } from '@/lib/telegramConfig';
import { parseOwner } from '@/utils/formatters';
// @ts-ignore
import puppeteer from 'puppeteer-core';
// @ts-ignore
import chromium from '@sparticuz/chromium';

const formatRiel = (val: number) => `${Math.round(val || 0).toLocaleString('en-US')} ៛`;

// --- 1. FRONTEND GROUPING MATH ---
function processSellerData(sellerSales: any[]) {
  const customerGroups: Record<string, any[]> = {};

  sellerSales.forEach((row) => {
    const customer = row.customer_name || 'Walk-in';
    if (!customerGroups[customer]) customerGroups[customer] = [];
    customerGroups[customer].push(row);
  });

  const finalRows: any[] = [];
  let sellerGrandTotal = 0;

  Object.keys(customerGroups).forEach((customer) => {
    const group = customerGroups[customer];
    let normalRows: any[] = [];
    let douRows: any[] = [];
    let consumedRows: any[] = [];
    let specialRows: any[] = [];

    group.forEach((item) => {
      const desc = item.custom_rice_type || item.rice_type || '';
      const price = Number(item.cogs_price || 0);

      if (desc.includes('សេវាដឹក')) return;
      if (desc.includes('បាវ') && price === 0) return;

      if (desc.includes('ដូរ') || desc.includes('បញ្ចុះតម្លៃ') || desc.includes('កក់')) douRows.push(item);
      else if (desc.includes('បានប្រើ') || desc.includes('អង្ករខ្វះ')) consumedRows.push(item);
      else if (desc.includes('ថ្លៃបាវ')) specialRows.push(item);
      else normalRows.push(item);
    });

    specialRows.sort((a, b) => (a.rice_type || '').localeCompare(b.rice_type || ''));
    const sortedGroup = [...normalRows, ...specialRows, ...douRows, ...consumedRows];

    sortedGroup.forEach((item, index) => {
      const qty = Number(item.qty || 0);
      const price = Number(item.cogs_price || 0);
      let amount = qty * price;

      const descForMath = item.custom_rice_type || item.rice_type || '';
      const isNegative = descForMath.includes('ដូរ') || descForMath.includes('បញ្ចុះតម្លៃ') || descForMath.includes('កក់');
      
      if (isNegative) amount = -Math.abs(amount);
      else amount = Math.abs(amount);

      sellerGrandTotal += amount;

      finalRows.push({
        ...item,
        calculatedAmount: amount,
        isNegative,
        isFirstOfCustomer: index === 0
      });
    });
  });

  return { rows: finalRows, sellerGrandTotal };
}

// --- 2. HTML A4 TEMPLATE GENERATOR ---
function generateHtmlReport(
  groupedBySeller: Record<string, any[]>,
  combinedGrandTotal: number,
  fromDate: string,
  toDate: string,
  tabLabel: string
): string {
  let sellersHtml = '';

  Object.keys(groupedBySeller).forEach((seller) => {
    const sellerSales = groupedBySeller[seller];
    
    const customerGroups: Record<string, any[]> = {};
    sellerSales.forEach((row) => {
      const customer = row.customer_name || 'Walk-in';
      if (!customerGroups[customer]) customerGroups[customer] = [];
      customerGroups[customer].push(row);
    });

    let sellerRowsHtml = '';
    let sellerGrandTotal = 0;

    Object.keys(customerGroups).forEach((customer) => {
      const group = customerGroups[customer];
      let normalRows: any[] = [];
      let douRows: any[] = [];
      let consumedRows: any[] = [];
      let specialRows: any[] = [];

      group.forEach((item) => {
        const desc = item.custom_rice_type || item.rice_type || '';
        const price = Number(item.cogs_price || 0);

        if (desc.includes('សេវាដឹក')) return;
        if (desc.includes('បាវ') && price === 0) return;

        if (desc.includes('ដូរ') || desc.includes('បញ្ចុះតម្លៃ') || desc.includes('កក់')) douRows.push(item);
        else if (desc.includes('បានប្រើ') || desc.includes('អង្ករខ្វះ')) consumedRows.push(item);
        else if (desc.includes('ថ្លៃបាវ')) specialRows.push(item);
        else normalRows.push(item);
      });

      specialRows.sort((a, b) => (a.rice_type || '').localeCompare(b.rice_type || ''));
      const sortedGroup = [...normalRows, ...specialRows, ...douRows, ...consumedRows];

      sortedGroup.forEach((item, index) => {
        const qty = Number(item.qty || 0);
        const price = Number(item.cogs_price || 0);
        let amount = qty * price;

        const descForMath = item.custom_rice_type || item.rice_type || '';
        const isNegative = descForMath.includes('ដូរ') || descForMath.includes('បញ្ចុះតម្លៃ') || descForMath.includes('កក់');
        
        if (isNegative) amount = -Math.abs(amount);
        else amount = Math.abs(amount);

        sellerGrandTotal += amount;

        const invNum = item.invoice_id ? String(item.invoice_id).replace(/\D/g, '') : '-';
        const riceDesc = item.custom_rice_type ? `<div style="color:#0f172a">${item.rice_type}</div><div style="font-size:11px; color:#b58a3d">${item.custom_rice_type}</div>` : (item.rice_type || '-');
        const amountColor = isNegative ? 'color: red;' : '';

        sellerRowsHtml += `
          <tr>
            <td style="text-align: center; font-weight: bold;">${invNum}</td>
            ${index === 0 ? `<td rowspan="${sortedGroup.length}" style="vertical-align: middle; font-weight: bold;">${customer}</td>` : ''}
            <td>${riceDesc}</td>
            <td>${item.custom_rice_type || '-'}</td>
            <td style="text-align: center;">${qty.toLocaleString('en-US')}</td>
            <td style="text-align: right;">${price.toLocaleString('en-US')}</td>
            <td style="text-align: right; font-weight: bold; ${amountColor}">${Math.round(amount).toLocaleString('en-US')}</td>
          </tr>
        `;
      });
    });

    sellersHtml += `
      <div class="seller-section">
        <h2 style="font-size: 15px; margin: 20px 0 8px 0; color: #333;">ថៅកែ ${seller.toUpperCase()}</h2>
        <table class="report-table">
          <thead>
            <tr style="background-color: #fffacd;">
              <th style="width: 10%;">INV</th>
              <th style="width: 20%;">អតិថិជន</th>
              <th style="width: 20%;">ប្រភេទអង្ករ</th>
              <th style="width: 18%;">ឈ្មោះក្នុងប៊ុង</th>
              <th style="width: 8%;">ចំនួន</th>
              <th style="width: 12%;">តម្លៃ</th>
              <th style="width: 12%;">សរុប</th>
            </tr>
          </thead>
          <tbody>
            ${sellerRowsHtml}
            <tr style="background-color: #fffacd; font-weight: bold;">
              <td colspan="6" style="text-align: right; padding-right: 15px;">សរុប</td>
              <td style="text-align: right; color: #b58a3d;">${Math.round(sellerGrandTotal).toLocaleString('en-US')} ៛</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  });

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@400;700&display=swap" rel="stylesheet">
      <style>
        body {
          font-family: 'Noto Sans Khmer', Arial, sans-serif;
          font-size: 12px;
          color: #0f172a;
          margin: 0;
          padding: 20px;
          background: #ffffff;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid #15803d;
          padding-bottom: 12px;
          margin-bottom: 20px;
        }
        .title { font-size: 20px; font-weight: bold; color: #15803d; margin: 0; }
        .subtitle { font-size: 11px; color: #64748b; margin-top: 4px; }
        .date-info { text-align: right; font-size: 12px; font-weight: bold; }
        .report-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 15px;
          page-break-inside: avoid;
        }
        .report-table th, .report-table data, .report-table td {
          border: 1px solid #000;
          padding: 6px 8px;
        }
        .report-table th {
          text-align: center;
          font-weight: bold;
        }
        .grand-total-box {
          display: flex;
          justify-content: space-between;
          background-color: #fffacd;
          border: 1.5px solid #000;
          padding: 12px 16px;
          margin-top: 30px;
          font-weight: bold;
          font-size: 15px;
          page-break-inside: avoid;
        }
        .footer {
          position: fixed;
          bottom: 10px;
          left: 20px;
          right: 20px;
          display: flex;
          justify-content: space-between;
          font-size: 9px;
          color: #94a3b8;
          border-top: 0.5px solid #e2e8f0;
          padding-top: 5px;
        }
        @media print {
          @page { size: A4 portrait; margin: 15mm; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1 class="title">អង្ករត្រូវទូទាត់</h1>
          <div class="subtitle">${tabLabel} Breakdown Report</div>
        </div>
        <div>
          <div class="date-info">Date: ${fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`}</div>
          <div style="font-size: 10px; color: #64748b; text-align: right; margin-top: 2px;">Phnom Penh, Cambodia</div>
        </div>
      </div>

      ${Object.keys(groupedBySeller).length === 0 ? '<div style="text-align: center; color: #64748b; padding: 40px;">No COGS sales recorded for this date range.</div>' : sellersHtml}

      <div class="grand-total-box">
        <div>សរុបរួមទាំងអស់</div>
        <div style="color: #b58a3d;">${Math.round(combinedGrandTotal).toLocaleString('en-US')} ៛</div>
      </div>

      <div class="footer">
        <div>Generated by COGS Automated Engine • Web DOM Print Engine</div>
        <div>Phnom Penh, Cambodia</div>
      </div>
    </body>
    </html>
  `;
}

// --- 3. MAIN REPORT SENDER FUNCTION ---
export async function generateAndSendCogsReport({
  fromDate,
  toDate,
  ownerTab,
  downloadOnly = false
}: {
  fromDate: string;
  toDate: string;
  ownerTab: 'mom' | 'others';
  downloadOnly?: boolean;
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const [{ data: sales }, { data: retailSales }] = await Promise.all([
    supabase.from('sales').select('*').order('created_at', { ascending: false }).limit(3000),
    supabase.from('retail_sales').select('*').order('created_at', { ascending: false }).limit(3000)
  ]);

  const isMomTab = ownerTab === 'mom';

  const rawSales = [...(sales || []), ...(retailSales || [])].filter((s) => {
    if (!s.created_at) return false;
    const d = s.created_at.substring(0, 10);
    const matchesDate = d >= fromDate && d <= toDate;
    const owner = parseOwner(s.owner || s.customer_name);
    const isMomRow = owner.toLowerCase() === 'mom';
    const matchesOwner = isMomTab ? isMomRow : !isMomRow;
    return matchesDate && matchesOwner;
  });

  const groupedBySeller: Record<string, any[]> = {};
  let combinedGrandTotal = 0;

  rawSales.forEach((s) => {
    let seller = parseOwner(s.owner || s.customer_name);
    seller = seller.charAt(0).toUpperCase() + seller.slice(1);
    if (!groupedBySeller[seller]) groupedBySeller[seller] = [];
    groupedBySeller[seller].push(s);
  });

  Object.keys(groupedBySeller).forEach((seller) => {
    const { sellerGrandTotal } = processSellerData(groupedBySeller[seller]);
    combinedGrandTotal += sellerGrandTotal;
  });

  const tabLabel = isMomTab ? 'Mom COGS' : 'Pich / Jing / Both COGS';
  const htmlContent = generateHtmlReport(groupedBySeller, combinedGrandTotal, fromDate, toDate, tabLabel);

  // --- LAUNCH HEADLESS BROWSER (PUPPETEER + SPARTICUZ CHROMIUM) ---
  const isLocal = process.env.NODE_ENV === 'development';
  let browser: any;

  if (isLocal) {
    // @ts-ignore - Ignores missing local types if puppeteer is not installed locally
    const puppeteerMod: any = await import('puppeteer').catch(() => null);
    const localPuppeteer = puppeteerMod?.default || puppeteerMod;
    if (!localPuppeteer) {
      throw new Error('Please run "npm install -D puppeteer" to test PDF generation locally on localhost.');
    }
    browser = await localPuppeteer.launch({ headless: true });
  } else {
    // Production / Vercel Serverless launch with clean viewport object
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1200, height: 800 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
  
  const rawPdfBytes = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }
  });

  await browser.close();

  const pdfBuffer = Buffer.from(rawPdfBytes);

  if (downloadOnly) {
    return { success: true, pdfBuffer, filename: `COGS-${ownerTab.toUpperCase()}-${fromDate}.pdf` };
  }

  const botToken = TELEGRAM_CONFIG.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = TELEGRAM_CONFIG.chatId || process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    throw new Error('Telegram credentials missing');
  }

  const pdfBlob = new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' });
  const tgFormData = new FormData();
  tgFormData.append('chat_id', chatId);
  tgFormData.append('document', pdfBlob, `COGS-${ownerTab.toUpperCase()}-${fromDate}.pdf`);
  tgFormData.append(
    'caption',
    `🌾 <b>${tabLabel} A4 REPORT</b>\n📅 Date: <b>${fromDate} to ${toDate}</b>\n💰 Total Due: <b>${Math.round(combinedGrandTotal).toLocaleString('en-US')} ៛</b>\n✅ Attached: Multi-page A4 PDF`
  );
  tgFormData.append('parse_mode', 'HTML');

  const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
    method: 'POST',
    body: tgFormData
  });

  const tgResult = await tgRes.json();
  if (!tgRes.ok) {
    throw new Error(`Telegram Upload Error: ${JSON.stringify(tgResult)}`);
  }

  return { success: true, messageId: tgResult.result?.message_id };
}