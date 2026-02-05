
const SUPABASE_URL = 'https://mrejgpcxaevooofyenzq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yZWpncGN4YWV2b29vZnllbnpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg0NzI3OTYsImV4cCI6MjA3NDA0ODc5Nn0.mfMzOixO1AUWPb6O6cFKNTbLHvYA2GBBAT8QW2WSsWU';

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
