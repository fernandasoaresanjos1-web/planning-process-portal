// Netlify Function - CommonJS - Node 18+
const https = require('https');

const ACESS_TOKEN = process.env.ACESS_TOKEN || "ef7ceb75e9bab0fe36832dccc68e0e3c";
const ACESS_API   = "api.acessorias.com";
const SUPA_URL    = "vnmuxxyucstbckbyitro.supabase.co";
const SUPA_KEY    = process.env.SUPA_SERVICE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZubXV4eHl1Y3N0YmNrYnlpdHJvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjczNzQ5MiwiZXhwIjoyMTAyMzEzNDkyfQ.v8lIv1ALAtBFHxf9a-zTwhL2yznKxCi1t6s5Cbkco6g";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};

// HTTP request usando módulo nativo do Node (sem depender de fetch)
function httpGet(hostname, path, headers) {
  return new Promise((resolve, reject) => {
    const options = { hostname, path, method: 'GET', headers: headers || {} };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

function httpPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const opts = {
      hostname, path, method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(bodyStr) }
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(bodyStr);
    req.end();
  });
}

module.exports.handler = async function(event) {
  if(event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "ok" };
  }

  let cnpj, comp;
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const params = event.queryStringParameters || {};
    comp = body.competencia || params.competencia || getCompAtual();
    cnpj = body.cnpj || params.cnpj || null;
  } catch(e) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ erro: "body invalido" }) };
  }

  if(!cnpj) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ erro: "cnpj obrigatorio" }) };
  }

  console.log("Sync cnpj=" + cnpj + " comp=" + comp);

  try {
    const [ano, mes] = comp.split("-");
    const dtIni = ano + "-" + mes + "-01";
    const dtFim = ano + "-" + mes + "-" + new Date(+ano, +mes, 0).getDate();

    const cnpjEnc = encodeURIComponent(cnpj);
    const path = "/deliveries/" + cnpjEnc + "?DtInitial=" + dtIni + "&DtFinal=" + dtFim + "&attachments&config";

    const r = await httpGet(ACESS_API, path, {
      "Authorization": "Bearer " + ACESS_TOKEN,
      "Accept": "application/json"
    });

    console.log("Acessorias status:", r.status);

    if(r.status === 204) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, cnpj, competencia: comp, total_entregas: 0 }) };
    }
    if(r.status !== 200) {
      throw new Error("Acessorias HTTP " + r.status + ": " + r.body.slice(0, 100));
    }

    const data = JSON.parse(r.body);
    const emp = Array.isArray(data) ? data[0] : data;
    const entregas = (emp && emp.Entregas) ? emp.Entregas : [];
    console.log("Entregas:", entregas.length);

    if(entregas.length > 0) {
      const rows = entregas.map(e => ({
        cnpj, competencia: comp,
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

      const sr = await httpPost(SUPA_URL, "/rest/v1/acessorias_entregas", {
        "apikey":        SUPA_KEY,
        "Authorization": "Bearer " + SUPA_KEY,
        "Content-Type":  "application/json",
        "Prefer":        "resolution=merge-duplicates,return=minimal"
      }, rows);

      console.log("Supabase status:", sr.status);
      if(sr.status >= 400) throw new Error("Supabase " + sr.status + ": " + sr.body.slice(0, 200));
    }

    return {
      statusCode: 200, headers: CORS,
      body: JSON.stringify({ ok: true, cnpj, competencia: comp, total_entregas: entregas.length })
    };

  } catch(err) {
    console.error("ERRO:", err.message);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ erro: err.message }) };
  }
};

function getCompAtual() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
