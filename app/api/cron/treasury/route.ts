import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TELEGRAM_CONFIG } from '@/lib/telegramConfig';

export async function GET(request: Request) {
  try {
    // 1. Initialize Backend Supabase Connection
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    
    // 🔥 THE FIX: Try Service Role first (for Vercel), fall back to Anon Key (for Local testing)
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Hardcode to SMC Branch (Branch 1)
    const branchId = 1; 
    
    // Automatically pulls Thread 88 from your config
    const targetThreadId = (TELEGRAM_CONFIG as any).treasuryTopics?.[branchId]; 

    // 2. Fetch Live Balances directly from the database
    const { data: wallets, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('branch_id', branchId) // 🔥 FIX 1: Isolate specifically to this branch!
      .order('id', { ascending: true });

    if (error) throw error;
    if (!wallets || wallets.length === 0) throw new Error("No wallets found");

    // Combine KHR and USD wallets with the same name
    const combinedWallets: Record<string, { khr: number, usd: number }> = {};

    wallets.forEach((w: any) => {
      // 🔥 FIX 2: Filter out "Accounts Receivable" just like the frontend UI does
      if ((w.name || '').toLowerCase().includes('receiv')) return;

      // Remove the ៛ or $ symbols to get the base name (e.g., "ABA Both")
      const cleanName = w.name.replace(/[៛\$]/g, '').trim();
      
      if (!combinedWallets[cleanName]) {
        combinedWallets[cleanName] = { khr: 0, usd: 0 };
      }
      
      if (w.currency === 'KHR') {
        combinedWallets[cleanName].khr = w.balance || 0;
      } else {
        combinedWallets[cleanName].usd = w.balance || 0;
      }
    });

    // 3. Format the Stacked Telegram Message
    const dateStr = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Phnom_Penh' });
    
    let msg = `🏛️ <b>DAILY TREASURY CLOSING SNAPSHOT</b>\n`;
    msg += `🏬 Branch: <b>SMC (Branch ${branchId})</b>\n`;
    msg += `📅 Date: ${dateStr}\n\n`;

    msg += `💼 <b>ACCOUNT BALANCES</b>\n\n`;
    
    const accountNames = Object.keys(combinedWallets);
    if (accountNames.length === 0) {
      msg += `- None\n`;
    } else {
      accountNames.forEach(name => {
        const acc = combinedWallets[name];
        const khrStr = `${new Intl.NumberFormat('en-US').format(acc.khr)} ៛`;
        // 🔥 Using "USD" instead of "$" completely blocks the Telegram math formatting bug
        const usdStr = `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(acc.usd)} USD`;
        
        msg += `🏦 <b>${name}</b>\n`;
        msg += ` ├ 🇰🇭 ${khrStr}\n`;
        msg += ` └ 🇺🇸 ${usdStr}\n\n`;
      });
    }

    // 4. Dispatch to Telegram
    const botToken = TELEGRAM_CONFIG.botToken || process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;
    const masterChatId = TELEGRAM_CONFIG.chatId || process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID;

    if (!botToken || !masterChatId) throw new Error("Missing Telegram Keys");

    const payload: any = {
      chat_id: masterChatId,
      text: msg,
      parse_mode: 'HTML' // Enforcing HTML
    };

    if (targetThreadId) {
      payload.message_thread_id = targetThreadId;
    }

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('Failed to dispatch Telegram message');

    return NextResponse.json({ success: true, message: 'Automated Treasury report sent successfully!' });

  } catch (error: any) {
    console.error('CRON ERROR:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}