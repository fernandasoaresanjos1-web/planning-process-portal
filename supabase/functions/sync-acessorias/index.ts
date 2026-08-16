import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const ACESS_TOKEN = Deno.env.get("ACESS_TOKEN") || "ef7ceb75e9bab0fe36832dccc68e0e3c";
const ACESS_API   = "https://api.acessorias.com";
const SUPA_URL    = Deno.env.get("SUPABASE_URL")!;
const SUPA_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body       = req.method === "POST" ? await req.json() : {};
    const url        = new URL(req.url);
    const compParam  = body.competencia || url.searchParams.get("competencia") || getCompAtual();
    const cnpjFiltro = body.cnpj        || url.searchParams.get("cnpj")        || null;

    const [ano, mes] = compParam.split("-");
    const dtIni = `${ano}-${mes}-01`;
    const dtFim = `${ano}-${mes}-${ultimoDia(ano, mes)}`;

    const supabase = createClient(SUPA_URL, SUPA_KEY);

    // Log início
    const { data: logData } = await supabase
      .from("acessorias_sync_log")
      .insert({ competencia: compParam, status: "running" })
      .select("id").single();
    const logId = logData?.id;

    // Empresas
    const empresas = cnpjFiltro
      ? [{ cnpj: cnpjFiltro }]
      : await buscarEmpresas();

    let totalEntregas = 0;
    const erros: { cnpj: string; erro: string }[] = [];

    for (const emp of empresas) {
      try {
        const entregas = await buscarEntregas(emp.cnpj, dtIni, dtFim);
        if (entregas.length > 0) {
          const rows = entregas.map((e: any) => ({
            cnpj:           emp.cnpj,
            competencia:    compParam,
            obrigacao_nome: e.Nome || "",
            status:         e.Status || "",
            dt_prazo:       e.EntDtPrazo && e.EntDtPrazo !== "0000-00-00" ? e.EntDtPrazo : null,
            dt_entrega:     e.EntDtEntrega && e.EntDtEntrega !== "0000-00-00" ? e.EntDtEntrega : null,
            dt_finalizacao: e.EntDtFinalizacao || null,
            anexo_url:      e.Anexos?.[0]?.Url || null,
            responsavel:    e.RespEntrega || null,
            dpto_nome:      e.Config?.DptoNome || null,
            sincronizado_em: new Date().toISOString(),
          }));

          const { error } = await supabase
            .from("acessorias_entregas")
            .upsert(rows, { onConflict: "cnpj,competencia,obrigacao_nome" });

          if (error) throw new Error(error.message);
          totalEntregas += rows.length;
        }
      } catch (err: any) {
        erros.push({ cnpj: emp.cnpj, erro: err.message });
      }
    }

    // Log fim
    await supabase.from("acessorias_sync_log").update({
      finalizado_em:  new Date().toISOString(),
      total_empresas: empresas.length,
      total_entregas: totalEntregas,
      status:         erros.length === 0 ? "ok" : "parcial",
      erro_msg:       erros.length ? JSON.stringify(erros.slice(0, 10)) : null,
    }).eq("id", logId);

    return new Response(
      JSON.stringify({ ok: true, competencia: compParam, total_empresas: empresas.length, total_entregas: totalEntregas, erros: erros.length }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ erro: err.message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});

async function buscarEmpresas() {
  const todas: { cnpj: string }[] = [];
  let pagina = 1;
  while (pagina <= 200) {
    const res  = await fetch(`${ACESS_API}/companies/ListAll?ativa=S&Pagina=${pagina}`, {
      headers: { Authorization: `Bearer ${ACESS_TOKEN}` },
    });
    if (!res.ok) throw new Error(`Empresas HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    todas.push(...data.map((e: any) => ({ cnpj: e.Identificador })));
    if (data.length < 20) break;
    pagina++;
  }
  return todas;
}

async function buscarEntregas(cnpj: string, dtIni: string, dtFim: string) {
  const url = `${ACESS_API}/deliveries/${encodeURIComponent(cnpj)}?DtInitial=${dtIni}&DtFinal=${dtFim}&attachments&config`;
  const res  = await fetch(url, { headers: { Authorization: `Bearer ${ACESS_TOKEN}` } });
  if (res.status === 204) return [];
  if (!res.ok) throw new Error(`Entregas HTTP ${res.status}`);
  const data = await res.json();
  const emp  = Array.isArray(data) ? data[0] : data;
  return emp?.Entregas || [];
}

function getCompAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function ultimoDia(ano: string, mes: string) {
  return new Date(+ano, +mes, 0).getDate();
}
