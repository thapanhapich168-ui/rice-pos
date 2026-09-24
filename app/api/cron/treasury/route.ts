import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TELEGRAM_CONFIG } from '@/lib/telegramConfig';

export async function GET(request: Request) {
  try {
    // 1. Initialize Backend Supabase Connection (Using Service Role Key to bypass RLS)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Hardcode to SMC Branch (Branch 1)
    const branchId = 1; 
    
    // Automatically pulls Thread 88 from your config
    const targetThreadId = (TELEGRAM_CONFIG as any).treasuryTopics?.[branchId]; 

    // 2. Fetch Live Balances directly from the database (without strict branch filtering to catch all active wallets safely)
    const { data: wallets, error } = await supabase
      .from('wallets')
      .select('*')
      .order('id', { ascending: true });

    if (error) throw error;
    if (!wallets || wallets.length === 0) throw new Error("No wallets found");

    const khrList = wallets.filter((w: any) => w.currency === 'KHR');
    const usdList = wallets.filter((w: any) => w.currency === 'USD');

    // 3. Format the Daily Telegram Message (🔥 Switched to HTML tags to protect the $ symbol)
    const dateStr = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Phnom_Penh' });
    
    let msg = `🏛️ <b>DAILY TREASURY CLOSING SNAPSHOT</b>\n`;
    msg += `🏬 Branch: <b>SMC (Branch ${branchId})</b>\n`;
    msg += `📅 Date: ${dateStr}\n\n`;

    msg += `🇰🇭 <b>RIEL WALLETS (KHR)</b>\n`;
    if (khrList.length === 0) msg += `- None\n`;
    khrList.forEach((w: any) => {
      const cleanName = w.name.replace(/[៛\$]/g, '').trim();
      msg += `• ${cleanName}: <b>${new Intl.NumberFormat('en-US').format(w.balance)} ៛</b>\n`;
    });

    msg += `\n🇺🇸 <b>DOLLAR WALLETS (USD)</b>\n`;
    if (usdList.length === 0) msg += `- None\n`;
    usdList.forEach((w: any) => {
      const cleanName = w.name.replace(/[៛\$]/g, '').trim();
      // 🔥 The $ symbol is now perfectly safe to use
      msg += `• ${cleanName}: <b>$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(w.balance)}</b>\n`;
    });

    // 4. Dispatch to Telegram Thread 88
    const botToken = TELEGRAM_CONFIG.botToken || process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;
    const masterChatId = TELEGRAM_CONFIG.chatId || process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID;

    if (!botToken || !masterChatId) throw new Error("Missing Telegram Keys");

    const payload: any = {
      chat_id: masterChatId,
      text: msg,
      parse_mode: 'HTML' // 🔥 Changed from Markdown to HTML
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