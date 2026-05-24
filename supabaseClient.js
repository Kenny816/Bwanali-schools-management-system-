const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://bnfuesqzwtubnarknivp.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnVlc3F6d3R1Ym5hcmtuaXZwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTU3NzA0NSwiZXhwIjoyMDk1MTUzMDQ1fQ.qPMZdxYjqDXlLE6bsgwF0JfMyT3IlRejcRQX5KEkM2U';
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
module.exports = { supabaseAdmin };
