import { createClient } from '@supabase/supabase-js'

// Reads from .env.local on your laptop, or from Vercel when deployed online
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️ Missing Supabase environment variables. Please check your .env.local file or Vercel settings.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)