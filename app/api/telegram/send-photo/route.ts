import { NextResponse } from 'next/server';
import { TELEGRAM_CONFIG } from '@/lib/telegramConfig';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const photo = formData.get('photo') as File;
    const caption = (formData.get('caption') as string) || '';

    if (!photo) {
      return NextResponse.json({ error: 'No photo provided' }, { status: 400 });
    }

    const botToken = TELEGRAM_CONFIG.botToken || process.env.TELEGRAM_BOT_TOKEN;
    const chatId = TELEGRAM_CONFIG.chatId || process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      return NextResponse.json(
        { error: 'Telegram credentials missing in environment variables or config' },
        { status: 500 }
      );
    }

    const tgFormData = new FormData();
    tgFormData.append('chat_id', chatId);
    tgFormData.append('photo', photo);
    tgFormData.append('caption', caption);
    tgFormData.append('parse_mode', 'HTML');

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: 'POST',
      body: tgFormData,
    });

    const data = await res.json();

    if (!data.ok) {
      throw new Error(data.description || 'Failed to send photo to Telegram');
    }

    return NextResponse.json({ success: true, result: data });
  } catch (error: any) {
    console.error('Telegram Upload Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}