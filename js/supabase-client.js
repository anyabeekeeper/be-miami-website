// Shared Supabase client for the public site and the admin dashboard.
// The anon key is safe to expose client-side — access is enforced by
// Row Level Security policies in Postgres, not by keeping this key secret.
//
const SUPABASE_URL = "https://znqptcldczqneaqjuqvu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_y95yRNjl6Bg_cacmEOE-1A_GqsG0YbN";

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
