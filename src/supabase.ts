import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://alqvsxsfdhouhznaolby.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFscXZzeHNmZGhvdWh6bmFvbGJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3Mzg1NDAsImV4cCI6MjEwNDMxNDU0MH0.78U007OZQIoobarZU3jKu5u1s-FashXuRVd3ITvtcM8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);