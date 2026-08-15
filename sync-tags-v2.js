// Sincroniza tags: primeiro lista todas, depois busca empresas de cada uma
const URL = 'https://vnmuxxyucstbckbyitro.supabase.co/functions/v1/sync-acessorias';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZubXV4eHl1Y3N0YmNrYnlpdHJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3Mzc0OTIsImV4cCI6MjEwMjMxMzQ5Mn0.MEzR1o4VuGOVJ95j9psgy2du61b5-tKj8fLUkfmzcgE';
const SUPA_URL = 'https://vnmuxxyucstbckbyitro.supabase.co';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(body) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
    body: JSON.stringify(body)
  });
  const text = await r.text();
  try { return JSON.parse(text); } catch(e) { return { ok: false, erro: text.substring(0,200) }; }
}

async function main() {
  console.log('=== Sync Tags v2 ===\n');

  // 1. busca todas as tags do banco (já sincronizadas)
  const tagsResp = await fetch(`${SUPA_URL}/rest/v1/tags?select=id,nome&order=id&limit=500`, {
    headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY }
  });
  const tags = await tagsResp.json();
  console.log(`Tags no banco: ${tags.length}`);

  if (!tags.length) {
    // sincroniza as tags primeiro
    console.log('Sincronizando tags...');
    for (let p = 1; p <= 10; p += 5) {
      const r = await call({ modo: 'tags', pagInicio: p, pagFim: p+4 });
      console.log(`  p${p}-${p+4}: ${r.tags || 0} tags`);
      if (!r.tags) break;
      await sleep(2000);
    }
  }

  // 2. busca empresas de cada tag individualmente
  console.log('\nBuscando empresas por tag...');
  let totalVinculos = 0;
  for (const tag of tags) {
    process.stdout.write(`  Tag ${tag.id} (${tag.nome.substring(0,20)})... `);
    const r = await call({ modo: 'tag-empresas', pagInicio: tag.id });
    if (r.ok) {
      totalVinculos += r.empresas || 0;
      console.log(`✓ ${r.empresas} empresas`);
    } else {
      console.log(`ERRO: ${r.erro}`);
    }
    await sleep(800);
  }

  console.log(`\n✅ Total vínculos: ${totalVinculos}`);
}

main().catch(console.error);
