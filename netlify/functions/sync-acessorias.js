const https = require('https');

module.exports.handler = async function(event) {
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  };

  if(event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "ok" };
  }

  // Loga o que recebeu
  console.log("Method:", event.httpMethod);
  console.log("Body:", event.body);

  let cnpj, comp;
  try {
    const b = event.body ? JSON.parse(event.body) : {};
    cnpj = b.cnpj || (event.queryStringParameters||{}).cnpj;
    comp = b.competencia || (event.queryStringParameters||{}).competencia || getComp();
  } catch(e) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({erro: "body invalido: "+e.message}) };
  }

  console.log("cnpj="+cnpj+" comp="+comp);

  if(!cnpj) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({erro: "cnpj obrigatorio", recebido: event.body}) };
  }

  try {
    const TOKEN = "ef7ceb75e9bab0fe36832dccc68e0e3c";
    const SUPA  = "vnmuxxyucstbckbyitro.supabase.co";
    const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZubXV4eHl1Y3N0YmNrYnlpdHJvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjczNzQ5MiwiZXhwIjoyMTAyMzEzNDkyfQ.v8lIv1ALAtBFHxf9a-zTwhL2yznKxCi1t6s5Cbkco6g";

    const [ano, mes] = comp.split("-");
    const dtIni = ano+"-"+mes+"-01";
    const dtFim = ano+"-"+mes+"-"+new Date(+ano,+mes,0).getDate();
    const path  = "/deliveries/"+encodeURIComponent(cnpj)+"?DtInitial="+dtIni+"&DtFinal="+dtFim+"&attachments&config";

    // Busca entregas
    const r1 = await req("api.acessorias.com", path, {"Authorization":"Bearer "+TOKEN});
    console.log("Acessorias:", r1.status, r1.body.slice(0,100));

    if(r1.status === 204) {
      return { statusCode:200, headers:CORS, body: JSON.stringify({ok:true, total_entregas:0}) };
    }
    if(r1.status !== 200) {
      throw new Error("Acessorias "+r1.status+": "+r1.body.slice(0,200));
    }

    const data = JSON.parse(r1.body);
    const emp  = Array.isArray(data) ? data[0] : data;
    const ents = (emp && emp.Entregas) ? emp.Entregas : [];
    console.log("Entregas:", ents.length);

    if(ents.length > 0) {
      const rows = ents.map(e => ({
        cnpj, competencia: comp,
        obrigacao_nome: e.Nome||"",
        status: e.Status||"",
        dt_prazo: e.EntDtPrazo && e.EntDtPrazo!=="0000-00-00" ? e.EntDtPrazo : null,
        dt_entrega: e.EntDtEntrega && e.EntDtEntrega!=="0000-00-00" ? e.EntDtEntrega : null,
        dt_finalizacao: e.EntDtFinalizacao||null,
        anexo_url: (e.Anexos&&e.Anexos[0]) ? e.Anexos[0].Url : null,
        responsavel: e.RespEntrega||null,
        dpto_nome: (e.Config&&e.Config.DptoNome) ? e.Config.DptoNome : null,
        sincronizado_em: new Date().toISOString()
      }));

      const r2 = await post(SUPA, "/rest/v1/acessorias_entregas", {
        "apikey": SUPA_KEY,
        "Authorization": "Bearer "+SUPA_KEY,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal"
      }, JSON.stringify(rows));
      console.log("Supabase:", r2.status);
      if(r2.status >= 400) throw new Error("Supabase "+r2.status+": "+r2.body.slice(0,200));
    }

    return { statusCode:200, headers:CORS, body: JSON.stringify({ok:true, total_entregas:ents.length}) };

  } catch(err) {
    console.error("ERRO FINAL:", err.message);
    return { statusCode:500, headers:CORS, body: JSON.stringify({erro: err.message}) };
  }
};

function req(host, path, hdrs) {
  return new Promise((res, rej) => {
    const r = https.request({hostname:host, path, method:"GET", headers:hdrs}, resp => {
      let d = ""; resp.on("data", c=>d+=c); resp.on("end", ()=>res({status:resp.statusCode,body:d}));
    });
    r.on("error", rej);
    r.setTimeout(8000, ()=>{r.destroy();rej(new Error("Timeout GET"));});
    r.end();
  });
}

function post(host, path, hdrs, body) {
  return new Promise((res, rej) => {
    const r = https.request({hostname:host, path, method:"POST", headers:{...hdrs,"Content-Length":Buffer.byteLength(body)}}, resp => {
      let d = ""; resp.on("data", c=>d+=c); resp.on("end", ()=>res({status:resp.statusCode,body:d}));
    });
    r.on("error", rej);
    r.setTimeout(8000, ()=>{r.destroy();rej(new Error("Timeout POST"));});
    r.write(body); r.end();
  });
}

function getComp() {
  const d = new Date();
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
}
