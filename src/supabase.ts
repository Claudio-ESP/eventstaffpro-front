import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://xwclwrcggvmsngflbpcq.supabase.co'
const supabaseKey = 'sb_publishable_0vdlsU_29JAmF8u2U_LWig_02NeAGvr'

export const supabase = createClient(supabaseUrl, supabaseKey)