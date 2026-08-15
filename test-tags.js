const URL = 'https://vnmuxxyucstbckbyitro.supabase.co/functions/v1/sync-acessorias';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZubXV4eHl1Y3N0YmNrYnlpdHJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3Mzc0OTIsImV4cCI6MjEwMjMxMzQ5Mn0.MEzR1o4VuGOVJ95j9psgy2du61b5-tKj8fLUkfmzcgE';

fetch(URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
  body: JSON.stringify({ modo: 'tags', pagInicio: 1, pagFim: 10 })
}).then(r => r.json()).then(d => console.log(JSON.stringify(d))).catch(console.error);
