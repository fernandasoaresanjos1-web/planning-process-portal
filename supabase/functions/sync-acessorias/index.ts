import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" },
    });
  }

  const ACESSORIAS_TOKEN = Deno.env.get("ACESSORIAS_TOKEN") ?? "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? "";

  if (!SUPABASE_URL || !SERVICE_KEY || !ACESSORIAS_TOKEN) {
    return new Response(JSON.stringify({ ok: false, erro: "Secrets ausentes" }), { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const apiHeaders = { Authorization: `Bearer ${ACESSORIAS_TOKEN}` };
  const BASE = "https://api.acessorias.com";
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // lê parâmetros do body: { modo: "empresas"|"tags"|"grupos", pagInicio, pagFim }
  let modo = "empresas";
  let pagInicio = 1;
  let pagFim = 25; // 25 páginas × 20 registros = 500 por execução

  try {
    const body = await req.json().catch(() => ({}));
    if (body.modo) modo = body.modo;
    if (body.pagInicio) pagInicio = Number(body.pagInicio);
    if (body.pagFim) pagFim = Number(body.pagFim);
  } catch (_) { /* usa defaults */ }

  console.log(`Modo: ${modo} | Páginas: ${pagInicio}-${pagFim}`);

  try {
    if (modo === "empresas") {
      const empresas: Record<string, unknown>[] = [];
      for (let page = pagInicio; page <= pagFim; page++) {
        const res = await fetch(`${BASE}/companies/ListAll?ativa=S&registrationData&Pagina=${page}`, { headers: apiHeaders });
        if (!res.ok) { console.log(`Página ${page} retornou ${res.status} — parando`); break; }
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) { console.log(`Página ${page} vazia — fim`); break; }
        empresas.push(...data);
        console.log(`Página ${page}: ${data.length} empresas`);
        if (data.length < 20) break;
        await sleep(650);
      }

      const rows = empresas.map((e) => ({
        cnpj: String(e.Identificador ?? "").replace(/\D/g, ""),
        razao: e.Razao ?? null,
        regime: e.Regime ?? null,
        uf: e.UF ?? null,
        cidade: e.Cidade ?? e.cidade ?? null,
        status: e.Status ?? "Ativa",
        grupo: e.GrupoDeEmpresas ?? null,
        sincronizado_em: new Date().toISOString(),
      })).filter((r) => r.cnpj.length > 0);

      for (let i = 0; i < rows.length; i += 200) {
        const res = await supabase.from("empresas").upsert(rows.slice(i, i + 200), { onConflict: "cnpj", ignoreDuplicates: false });
        if (res.error) {
          console.log(`Aviso lote ${i}: ${res.error.message} — continuando`);
          // tenta um por um para não perder o lote inteiro
          for (const row of rows.slice(i, i + 200)) {
            const r2 = await supabase.from("empresas").upsert([row], { onConflict: "cnpj", ignoreDuplicates: true });
            if (r2.error) console.log(`Skip ${row.cnpj}: ${r2.error.message}`);
          }
        }
      }

      return new Response(JSON.stringify({ ok: true, modo, paginas: `${pagInicio}-${pagFim}`, inseridas: rows.length }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }

    if (modo === "tags") {
      // 1. lista todas as tags (sem companies)
      const tags: Record<string, unknown>[] = [];
      for (let page = pagInicio; page <= pagFim; page++) {
        const res = await fetch(`${BASE}/tags/ListAll?Pagina=${page}`, { headers: apiHeaders });
        if (!res.ok) break;
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) break;
        tags.push(...data);
        if (data.length < 20) break;
        await sleep(650);
      }
      console.log(`Tags listadas: ${tags.length}`);

      // 2. upsert das tags
      const tagRows = tags.map((t) => ({ id: Number(t.id), nome: String(t.nome ?? ""), status: String(t.status ?? "Ativo"), sincronizado_em: new Date().toISOString() }));
      for (let i = 0; i < tagRows.length; i += 200) {
        const res = await supabase.from("tags").upsert(tagRows.slice(i, i + 200), { onConflict: "id" });
        if (res.error) throw new Error(`upsert tags: ${res.error.message}`);
      }

      return new Response(JSON.stringify({ ok: true, modo, tags: tagRows.length, pivots: 0 }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }

    // modo "tag-empresas": busca empresas de UMA tag específica
    if (modo === "tag-empresas") {
      const tagId = Number(pagInicio); // pagInicio = id da tag
      const res = await fetch(`${BASE}/tags/${tagId}?companies`, { headers: apiHeaders });
      if (!res.ok) throw new Error(`API ${res.status} tag ${tagId}`);
      const data = await res.json();
      const tagData = Array.isArray(data) ? data[0] : data;
      const companies = (tagData?.companies ?? tagData?.Empresas ?? []) as Array<Record<string, unknown>>;
      
      const pivots = companies.map((c) => ({
        cnpj: String(c.cnpj ?? c.Identificador ?? c.CNPJ ?? "").replace(/\D/g, ""),
        tag_id: tagId
      })).filter((p) => p.cnpj.length > 0);

      if (pivots.length > 0) {
        await supabase.from("empresa_tags").delete().eq("tag_id", tagId);
        const res2 = await supabase.from("empresa_tags").insert(pivots);
        if (res2.error) throw new Error(`insert empresa_tags: ${res2.error.message}`);
      }

      return new Response(JSON.stringify({ ok: true, modo, tag_id: tagId, empresas: pivots.length }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }

    if (modo === "grupos") {
      const grupos: Record<string, unknown>[] = [];
      for (let page = pagInicio; page <= pagFim; page++) {
        const res = await fetch(`${BASE}/company_groups/ListAll?Pagina=${page}`, { headers: apiHeaders });
        if (!res.ok) break;
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) break;
        grupos.push(...data);
        if (data.length < 20) break;
        await sleep(650);
      }

      const rows = grupos.map((g) => ({ id: Number(g.id), nome: String(g.nome ?? ""), status: String(g.status ?? "Ativo"), sincronizado_em: new Date().toISOString() }));
      for (let i = 0; i < rows.length; i += 200) {
        const res = await supabase.from("grupos").upsert(rows.slice(i, i + 200), { onConflict: "id" });
        if (res.error) throw new Error(`upsert grupos: ${res.error.message}`);
      }

      return new Response(JSON.stringify({ ok: true, modo, grupos: rows.length }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }

    return new Response(JSON.stringify({ ok: false, erro: "modo inválido" }), { status: 400 });

  } catch (err) {
    console.error("ERRO:", (err as Error).message);
    return new Response(JSON.stringify({ ok: false, erro: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  }
});
