import * as XLSX from "xlsx";

export type ParsedRow = {
  ano: number;
  mes: number;
  indicador_chave: string;
  indicador_rotulo: string;
  valor: number;
  unidade: string;
};

const MES_MAP: Record<string, number> = {
  jan: 1, janeiro: 1, fev: 2, fevereiro: 2, mar: 3, marco: 3, março: 3,
  abr: 4, abril: 4, mai: 5, maio: 5, jun: 6, junho: 6,
  jul: 7, julho: 7, ago: 8, agosto: 8, set: 9, setembro: 9,
  out: 10, outubro: 10, nov: 11, novembro: 11, dez: 12, dezembro: 12,
};

function normalize(s: string) {
  return String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function slugify(s: string) {
  return normalize(s).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
function parseNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const s = String(v).trim().replace(/%/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return isNaN(n) ? null : n;
}
function parsePeriod(s: string): { ano: number; mes: number } | null {
  const txt = normalize(s);
  let m = txt.match(/(\d{4})[-\/](\d{1,2})/);
  if (m) return { ano: +m[1], mes: +m[2] };
  m = txt.match(/(\d{1,2})[-\/](\d{4})/);
  if (m) return { ano: +m[2], mes: +m[1] };
  m = txt.match(/([a-z]+)[\s\/-]*(\d{4})/);
  if (m && MES_MAP[m[1]]) return { ano: +m[2], mes: MES_MAP[m[1]] };
  return null;
}

/** Extrai período do nome do arquivo: S3D_empresas_YYYYMMDD... */
function periodFromFilename(name: string): { ano: number; mes: number } | null {
  const m = name.match(/(\d{4})(\d{2})(\d{2})/);
  if (m) return { ano: +m[1], mes: +m[2] };
  return null;
}

/** Detecta export S3D pelo cabeçalho e devolve indicadores agregados. */
function parseS3DEmpresas(
  json: Record<string, unknown>[],
  ano: number,
  mes: number,
): ParsedRow[] {
  const total = json.length;
  const regimes: Record<string, number> = {};
  let semRegime = 0;
  let comFone = 0;
  let comNomeFantasia = 0;
  for (const r of json) {
    const reg = String(r["Regime"] ?? "").trim();
    if (!reg) semRegime++;
    else regimes[reg] = (regimes[reg] ?? 0) + 1;
    if (String(r["Fone"] ?? "").trim()) comFone++;
    const nf = String(r["Nome fantasia"] ?? "").trim();
    if (nf && nf !== "#NAME?") comNomeFantasia++;
  }

  const rows: ParsedRow[] = [
    { ano, mes, indicador_chave: "total_empresas", indicador_rotulo: "Total de empresas", valor: total, unidade: "num" },
    { ano, mes, indicador_chave: "empresas_sem_regime", indicador_rotulo: "Empresas sem regime", valor: semRegime, unidade: "num" },
    { ano, mes, indicador_chave: "empresas_com_telefone", indicador_rotulo: "Empresas com telefone", valor: comFone, unidade: "num" },
    { ano, mes, indicador_chave: "empresas_com_nome_fantasia", indicador_rotulo: "Empresas com nome fantasia", valor: comNomeFantasia, unidade: "num" },
  ];
  for (const [reg, n] of Object.entries(regimes)) {
    rows.push({
      ano, mes,
      indicador_chave: `regime_${slugify(reg)}`,
      indicador_rotulo: `Regime: ${reg}`,
      valor: n,
      unidade: "num",
    });
  }
  return rows;
}

export async function parseSpreadsheet(file: File): Promise<ParsedRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (!json.length) return [];

  const headers = Object.keys(json[0]);
  const hSet = new Set(headers.map((h) => h.trim()));

  // === Export S3D de empresas ===
  if (hSet.has("Razão social") && hSet.has("CNPJ")) {
    const p = periodFromFilename(file.name);
    if (!p) {
      throw new Error(
        "Não consegui ler a data do nome do arquivo. Use o nome original do export (ex.: S3D_empresas_20260617213138_*.xlsx).",
      );
    }
    return parseS3DEmpresas(json, p.ano, p.mes);
  }

  const hNorm = headers.map(normalize);
  const colPeriodo = headers[hNorm.findIndex((h) => /(periodo|mes.*ano|ano.*mes|data|competencia)/.test(h))];
  const colIndicador = headers[hNorm.findIndex((h) => /(indicador|metrica|kpi|nome)/.test(h))];
  const colValor = headers[hNorm.findIndex((h) => /(valor|quantidade|qtd|total|numero)/.test(h))];
  const colUnidade = headers[hNorm.findIndex((h) => /(unidade|tipo|formato)/.test(h))];
  const colAno = headers[hNorm.findIndex((h) => /^ano$/.test(h))];
  const colMes = headers[hNorm.findIndex((h) => /^mes$/.test(h))];

  const rows: ParsedRow[] = [];

  if (colIndicador && colValor && (colPeriodo || (colAno && colMes))) {
    for (const r of json) {
      let ano: number | null = null;
      let mes: number | null = null;
      if (colPeriodo) {
        const p = parsePeriod(String(r[colPeriodo]));
        if (p) { ano = p.ano; mes = p.mes; }
      } else if (colAno && colMes) {
        ano = Number(r[colAno]);
        const mv = String(r[colMes]);
        mes = MES_MAP[normalize(mv)] ?? Number(mv);
      }
      const valor = parseNumber(r[colValor]);
      const rotulo = String(r[colIndicador] ?? "").trim();
      if (!ano || !mes || valor == null || !rotulo) continue;
      rows.push({
        ano, mes,
        indicador_chave: slugify(rotulo),
        indicador_rotulo: rotulo,
        valor,
        unidade: colUnidade ? String(r[colUnidade] ?? "num") : "num",
      });
    }
    return rows;
  }

  // Pivot
  const indicadorKey = headers[0];
  const periodCols = headers.slice(1)
    .map((h) => ({ header: h, period: parsePeriod(h) }))
    .filter((x) => x.period);
  if (periodCols.length) {
    for (const r of json) {
      const rotulo = String(r[indicadorKey] ?? "").trim();
      if (!rotulo) continue;
      for (const { header, period } of periodCols) {
        const valor = parseNumber(r[header]);
        if (valor == null) continue;
        rows.push({
          ano: period!.ano,
          mes: period!.mes,
          indicador_chave: slugify(rotulo),
          indicador_rotulo: rotulo,
          valor,
          unidade: "num",
        });
      }
    }
  }
  return rows;
}
