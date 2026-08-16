exports.handler = async function(event) {
  const CORS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  };
  if(event.httpMethod === "OPTIONS") return { statusCode:200, headers:CORS, body:"" };

  const ACESS_TOKEN = process.env.ACESS_TOKEN || "ef7ceb75e9bab0fe36832dccc68e0e3c";
  const ACESS_API   = "https://api.acessorias.com";
  const SUPA_URL    = process.env.SUPA_URL    || "https://vnmuxxyucstbckbyitro.supabase.co";
  const SUPA_KEY    = process.env.SUPA_SERVICE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZubXV4eHl1Y3N0YmNrYnlpdHJvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjczNzQ5MiwiZXhwIjoyMTAyMzEzNDkyfQ.v8lIv1ALAtBFHxf9a-zTwhL2yznKxCi1t6s5Cbkco6g";

  const body       = event.body ? JSON.parse(event.body) : {};
  const params     = event.queryStringParameters || {};
  const compParam  = body.competencia || params.competencia || getCompAtual();
  const cnpjFiltro = body.cnpj || params.cnpj || null;

  const [ano, mes] = compParam.split("-");
  const dtIni = `${ano}-${mes}-01`;
  const dtFim = `${ano}-${mes}-${ultimoDia(ano, mes)}`;

  console.log(`Sync | comp=${compParam} | cnpj=${cnpjFiltro||'todos'}`);

  const logId = await dbInsertLog(SUPA_URL, SUPA_KEY, compParam);

  try {
    let empresas = cnpjFiltro ? [{ cnpj: cnpjFiltro }] : await buscarEmpresas(ACESS_API, ACESS_TOKEN);
    console.log(`Empresas: ${empresas.length}`);

    let totalEntregas = 0;
    let erros = [];

    for(const emp of empresas) {
      try {
        const entregas = await buscarEntregas(ACESS_API, ACESS_TOKEN, emp.cnpj, dtIni, dtFim);
        if(entregas.length > 0) {
          await salvarEntregas(SUPA_URL, SUPA_KEY, emp.cnpj, compParam, entregas);
          totalEntregas += entregas.length;
        }
      } catch(err) {
        console.error(`Erro ${emp.cnpj}:`, err.message);
        erros.push({ cnpj: emp.cnpj, erro: err.message });
      }
    }

    await dbUpdateLog(SUPA_URL, SUPA_KEY, logId, {
      finalizado_em:  new Date().toISOString(),
      total_empresas: empresas.length,
      total_entregas: totalEntregas,
      status:         erros.length === 0 ? "ok" : "parcial",
      erro_msg:       erros.length ? JSON.stringify(erros.slice(0,10)) : null
    });

    return {
      statusCode: 200, headers: CORS,
      body: JSON.stringify({ ok:true, competencia:compParam, total_empresas:empresas.length, total_entregas:totalEntregas, erros:erros.length })
    };

  } catch(err) {
    await dbUpdateLog(SUPA_URL, SUPA_KEY, logId, { status:"erro", erro_msg:err.message, finalizado_em:new Date().toISOString() });
    return { statusCode:500, headers:CORS, body: JSON.stringify({ erro:err.message }) };
  }
};

async function buscarEmpresas(api, token) {
  let todas = [], pagina = 1;
  while(pagina <= 200) {
    const res = await fetch(`${api}/companies/ListAll?ativa=S&Pagina=${pagina}`, {
      headers:{ Authorization:`Bearer ${token}` }
    });
    if(!res.ok) throw new Error(`Empresas HTTP ${res.status}`);
    const data = await res.json();
    if(!Array.isArray(data) || data.length === 0) break;
    todas = todas.concat(data.map(e => ({ cnpj: e.Identificador })));
    if(data.length < 20) break;
    pagina++;
  }
  return todas;
}

async function buscarEntregas(api, token, cnpj, dtIni, dtFim) {
  const url = `${api}/deliveries/${encodeURIComponent(cnpj)}?DtInitial=${dtIni}&DtFinal=${dtFim}&attachments&config`;
  const res  = await fetch(url, { headers:{ Authorization:`Bearer ${token}` } });
  if(res.status === 204) return [];
  if(!res.ok) throw new Error(`Entregas HTTP ${res.status}`);
  const data = await res.json();
  const emp  = Array.isArray(data) ? data[0] : data;
  return (emp && emp.Entregas) ? emp.Entregas : [];
}

async function salvarEntregas(supaUrl, supaKey, cnpj, competencia, entregas) {
  const rows = entregas.map(e => ({
    cnpj,
    competencia,
    obrigacao_nome:  e.Nome || "",
    status:          e.Status || "",
    dt_prazo:        e.EntDtPrazo && e.EntDtPrazo !== "0000-00-00" ? e.EntDtPrazo : null,
    dt_entrega:      e.EntDtEntrega && e.EntDtEntrega !== "0000-00-00" ? e.EntDtEntrega : null,
    dt_finalizacao:  e.EntDtFinalizacao || null,
    anexo_url:       (e.Anexos && e.Anexos[0]) ? e.Anexos[0].Url : null,
    responsavel:     e.RespEntrega || null,
    dpto_nome:       (e.Config && e.Config.DptoNome) ? e.Config.DptoNome : null,
    sincronizado_em: new Date().toISOString()
  }));

  const res = await fetch(`${supaUrl}/rest/v1/acessorias_entregas`, {
    method: "POST",
    headers: {
      "apikey":       supaKey,
      "Authorization":`Bearer ${supaKey}`,
      "Content-Type": "application/json",
      "Prefer":       "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify(rows)
  });
  if(!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0,200)}`);
}

async function dbInsertLog(supaUrl, supaKey, competencia) {
  const res = await fetch(`${supaUrl}/rest/v1/acessorias_sync_log`, {
    method: "POST",
    headers: {
      "apikey":       supaKey,
      "Authorization":`Bearer ${supaKey}`,
      "Content-Type": "application/json",
      "Prefer":       "return=representation"
    },
    body: JSON.stringify({ competencia, status:"running" })
  });
  const data = await res.json();
  return Array.isArray(data) ? data[0]?.id : null;
}

async function dbUpdateLog(supaUrl, supaKey, id, fields) {
  if(!id) return;
  await fetch(`${supaUrl}/rest/v1/acessorias_sync_log?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      "apikey":       supaKey,
      "Authorization":`Bearer ${supaKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(fields)
  });
}

function getCompAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function ultimoDia(ano, mes) {
  return new Date(+ano, +mes, 0).getDate();
}
