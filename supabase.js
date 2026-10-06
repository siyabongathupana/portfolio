// supabase.js
const SUPABASE_URL = 'https://nisecbxtspozeqlpqtbd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pc2VjYnh0c3BvemVxbHBxdGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyOTExODUsImV4cCI6MjEwNjg2NzE4NX0.TOogQFKCtp-b_XKhMkXg03mB0LCFvjlvspmosPjigeg';   // the anon key

window.supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
