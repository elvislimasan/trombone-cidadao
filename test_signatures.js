
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    'Variáveis ausentes: defina SUPABASE_URL e SUPABASE_ANON_KEY (ou VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY).'
  );
}

async function checkTable() {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/signatures?select=*&limit=1`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    
    if (response.ok) {
      console.log('Table signatures exists!');
      const data = await response.json();
      console.log('Data:', data);
    } else {
      console.log('Error querying signatures:', response.status, response.statusText);
      const text = await response.text();
      console.log('Body:', text);
    }
  } catch (error) {
    console.error('Fetch error:', error);
  }
}

checkTable();
