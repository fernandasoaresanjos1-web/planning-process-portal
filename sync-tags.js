// Sincroniza tags com a nova versão da Edge Function
const URL = 'https://vnmuxxyucstbckbyitro.supabase.co/functions/v1/sync-acessorias';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZubXV4eHl1Y3N0YmNrYnlpdHJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3Mzc0OTIsImV4cCI6MjEwMjMxMzQ5Mn0.MEzR1o4VuGOVJ95j9psgy2du61b5-tKj8fLUkfmzcgE';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function syncTags() {
  console.log('=== Sincronizando Tags ===\n');
  
  // busca em lotes de 50 tags por vez (cada tag faz 1 chamada extra para empresas)
  let totalTags = 0;
  let totalPivots = 0;
  
  for (let pag = 1; pag <= 20; pag += 5) {
    const fim = pag + 4;
    process.stdout.write(`Tags páginas ${pag}-${fim}... `);
    
    const r = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
      body: JSON.stringify({ modo: 'tags', pagInicio: pag, pagFim: fim })
    });
    const data = await r.json();
    
    if (!data.ok) { console.log('ERRO:', data.erro); break; }
    
    totalTags += data.tags || 0;
    totalPivots += data.pivots || 0;
    console.log(`✓ ${data.tags} tags | ${data.pivots} vínculos`);
    
    if ((data.tags || 0) === 0) { console.log('Fim das tags.'); break; }
    await sleep(3000);
  }
  
  console.log(`\n✅ Total: ${totalTags} tags | ${totalPivots} vínculos empresa-tag`);
}

syncTags().catch(console.error);
