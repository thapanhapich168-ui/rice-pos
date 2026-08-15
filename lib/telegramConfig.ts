// lib/telegramConfig.ts

export const TELEGRAM_CONFIG = {
  // Replace with your actual Bot Token from @BotFather
  botToken: process.env.TELEGRAM_BOT_TOKEN || '8456983531:AAFtJFEQKQrvRQ9XitoItMKCYbfGkcf2cyU',

  // Replace with your actual Telegram Chat ID
  chatId: process.env.TELEGRAM_CHAT_ID || '-5356267187',

  newGroupChatId: process.env.TELEGRAM_STOCK_CHAT_ID || '-5395498078',

  // Set default fallback toggles if you aren't reading from Supabase
  autoSendDaily: true,
  autoSendMonthly: true,
}