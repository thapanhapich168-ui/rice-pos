import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://bdotkekdwpliyvxljlqn.supabase.co'
const supabaseKey = 'sb_publishable_wkf0NTcq5SnrU1cl-sVkBw_cnwE9nUx'

export const supabase = createClient(supabaseUrl, supabaseKey)