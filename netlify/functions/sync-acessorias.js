/**
 * Netlify Function: sync-acessorias
 * - Chamada manual (POST) ou agendada (cron diário)
 * - Busca entregas do mês atual na API do Acessórias
 * - Salva no Supabase (upsert)
 */

const ACESS_TOKEN = process.env.ACESS_TOKEN || "ef7ceb75e9bab0fe36832dccc68e0e3c";
const ACESS_API   = "https://api.acessorias.com";
const SUPA_URL    = process.env.SUPA_URL    || "https://vnmuxxyucstbckbyitro.supabase.co";
const SUPA_KEY    = process.env.SUPA_SERVICE_KEY; // service_role key — nunca anon

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};

exports.handler = async function(event) {
  if(event.httpMethod === "OPTIONS") return { statusCode:200, headers:CORS, body:"" };

  // Parâmetros: competencia (YYYY-MM), cnpj opcional (para forçar 1 empresa)
  const body     = event.body ? JSON.parse(event.body) : {};
  const params   = event.queryStringParameters || {};
  const compParam = body.competencia || params.competencia || getCompAtual();
  const cnpjFiltro = body.cnpj || params.cnpj || null;

  const [ano, mes] = compParam.split("-");
  const dtIni = `${ano}-${mes}-01`;
  const dtFim = `${ano}-${mes}-${ultimoDia(ano, mes)}`;

  console.log(`Sync Acessórias | comp=${compParam} | cnpj=${cnpjFiltro||'todos'}`);

  // Registra log de início
  const logId = await dbInsertLog(compParam);

  try {
    // 1. Busca lista de empresas (se não filtrou por CNPJ específico)
    let empresas = [];
    if(cnpjFiltro) {
      empresas = [{ cnpj: cnpjFiltro }];
    } else {
      empresas = await buscarEmpresas();
    }

    console.log(`Empresas: ${empresas.length}`);

    let totalEntregas = 0;
    let erros = [];

    // 2. Para cada empresa, busca entregas do período
    for(const emp of empresas) {
      try {
        const entregas = await buscarEntregas(emp.cnpj, dtIni, dtFim);
        if(entregas.length > 0) {
          await salvarEntregas(emp.cnpj, compParam, entregas);
          totalEntregas += entregas.length;
        }
      } catch(err) {
        console.error(`Erro empresa ${emp.cnpj}:`, err.message);
        erros.push({ cnpj: emp.cnpj, erro: err.message });
      }
    }

    // 3. Atualiza log
    await dbUpdateLog(logId, {
      finalizado_em: new Date().toISOString(),
      total_empresas: empresas.length,
      total_entregas: totalEntregas,
      status: erros.length === 0 ? "ok" : "parcial",
      erro_msg: erros.length ? JSON.stringify(erros.slice(0,10)) : null
    });

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        ok: true,
        competencia: compParam,
        total_empresas: empresas.length,
        total_entregas: totalEntregas,
        erros: erros.length
      })
    };

  } catch(err) {
    await dbUpdateLog(logId, { status:"erro", erro_msg: err.message, finalizado_em: new Date().toISOString() });
    return { statusCode:500, headers:CORS, body: JSON.stringify({ erro: err.message }) };
  }
};

/* ── API Acessórias ── */

async function buscarEmpresas() {
  let todas = [], pagina = 1;
  while(true) {
    const url = `${ACESS_API}/companies/ListAll?ativa=S&Pagina=${pagina}`;
    const res = await fetch(url, { headers:{ Authorization:`Bearer ${ACESS_TOKEN}` } });
    if(!res.ok) throw new Error(`Empresas HTTP ${res.status}`);
    const data = await res.json();
    if(!Array.isArray(data) || data.length === 0) break;
    todas = todas.concat(data.map(e => ({ cnpj: e.Identificador, razao: e.Razao })));
    if(data.length < 20) break;
    pagina++;
    if(pagina > 200) break; // segurança
  }
  return todas;
}

async function buscarEntregas(cnpj, dtIni, dtFim) {
  const cnpjEnc = encodeURIComponent(cnpj);
  const url = `${ACESS_API}/deliveries/${cnpjEnc}?DtInitial=${dtIni}&DtFinal=${dtFim}&attachments&config`;
  const res = await fetch(url, { headers:{ Authorization:`Bearer ${ACESS_TOKEN}` } });
  if(res.status === 204) return [];
  if(!res.ok) throw new Error(`Entregas HTTP ${res.status}`);
  const data = await res.json();
  const emp = Array.isArray(data) ? data[0] : data;
  return (emp && emp.Entregas) ? emp.Entregas : [];
}

/* ── Supabase ── */

async function salvarEntregas(cnpj, competencia, entregas) {
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

  const url = `${SUPA_URL}/rest/v1/acessorias_entregas`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "apikey":       SUPA_KEY,
      "Authorization":`Bearer ${SUPA_KEY}`,
      "Content-Type": "application/json",
      "Prefer":       "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify(rows)
  });
  if(!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase upsert ${res.status}: ${err.slice(0,200)}`);
  }
}

async function dbInsertLog(competencia) {
  const url = `${SUPA_URL}/rest/v1/acessorias_sync_log`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "apikey":       SUPA_KEY,
      "Authorization":`Bearer ${SUPA_KEY}`,
      "Content-Type": "application/json",
      "Prefer":       "return=representation"
    },
    body: JSON.stringify({ competencia, status:"running" })
  });
  const data = await res.json();
  return data[0]?.id;
}

async function dbUpdateLog(id, fields) {
  if(!id) return;
  const url = `${SUPA_URL}/rest/v1/acessorias_sync_log?id=eq.${id}`;
  await fetch(url, {
    method: "PATCH",
    headers: {
      "apikey":       SUPA_KEY,
      "Authorization":`Bearer ${SUPA_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(fields)
  });
}

/* ── Helpers ── */

function getCompAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function ultimoDia(ano, mes) {
  return new Date(+ano, +mes, 0).getDate();
}
