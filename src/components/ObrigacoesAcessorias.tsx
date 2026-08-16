// ObrigacoesAcessorias.tsx
// Cole em src/components/ObrigacoesAcessorias.tsx
// Dependência: npm install xlsx

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";


// ─── TIPOS ───────────────────────────────────────────────────────────────────

interface Obrigacao {
  nome: string;
  mininome: string;
  dept: string;
  deptFull: string;
  responsavel: string;
  qtde: number;
  prazos: string[];
  diasAntes: string;
  tipoDias: string;
  prazoNaoUtil: string;
  sabadoUtil: string;
  competencia: string;
  robo: boolean;
  multa: boolean;
  alertaGuia: boolean;
  ativa: boolean;
}

type TabId = "visao" | "fiscal" | "contabil" | "folha" | "doc" | "outros";

// ─── CONSTANTES ──────────────────────────────────────────────────────────────

const MESES_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const PER = 50;

const C = {
  green:"#0AE18C", greenDark:"#00BF63", greenLt:"rgba(10,225,140,0.10)",
  black:"#0C0C0C", charcoal:"#1A1A1A", ink:"#2C2C2C",
  gray70:"#4A4A4A", gray50:"#646464", gray30:"#CDCDCD",
  gray10:"#E8E8E8", gray05:"#F5F5F5", offWhite:"#FAFAFA",
  white:"#FFFFFF", border:"#E2E2E2",
  red:"#FF4444", redLt:"rgba(255,68,68,0.10)",
  amber:"#FFD600", amberLt:"rgba(255,214,0,0.12)",
  blue:"#14C8FA", blueLt:"rgba(20,200,250,0.10)",
  purple:"#A78BFA", purpleLt:"rgba(167,139,250,0.10)",
  teal:"#0AE18C", tealLt:"rgba(10,225,140,0.10)",
};

const DEPT_COLORS: Record<string,{bg:string;color:string;dot:string}> = {
  "Fiscal":           { bg:"rgba(255,164,64,0.10)",  color:"#C2410C", dot:"#EA580C" },
  "Contábil":         { bg:"rgba(10,225,140,0.10)",  color:"#00BF63", dot:"#0AE18C" },
  "Pessoal":          { bg:"rgba(20,200,250,0.10)",  color:"#0284C7", dot:"#14C8FA" },
  "DOC":              { bg:"rgba(167,139,250,0.10)", color:"#6D28D9", dot:"#A78BFA" },
  "Financeiro":       { bg:"rgba(255,214,0,0.10)",   color:"#92620A", dot:"#FFD600" },
  "Controladoria":    { bg:"rgba(10,225,140,0.10)",  color:"#0F766E", dot:"#0AE18C" },
  "Auditoria Externa":{ bg:"rgba(255,68,68,0.10)",   color:"#BE123C", dot:"#FF4444" },
  "Societário":       { bg:"rgba(100,116,139,0.10)", color:"#475569", dot:"#64748B" },
};
const getDC = (dept: string) => DEPT_COLORS[dept] || { bg:C.gray05, color:C.gray70, dot:C.gray50 };

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function parseBool(v: unknown) { return String(v||"").trim().toLowerCase() === "sim"; }

function parseRow(row: unknown[]): Obrigacao | null {
  const nome = String(row[0]||"").trim();
  if (!nome) return null;
  if (!parseBool(row[24])) return null; // só ativas
  const deptFull = String(row[2]||"").trim();
  const parts = deptFull.split(" - ");
  return {
    nome,
    mininome: String(row[1]||"").trim(),
    dept: parts[0]?.trim() || "",
    deptFull,
    responsavel: parts.slice(1).join(" - ").trim() || "Indefinido",
    qtde: Number(row[3])||0,
    prazos: Array.from({length:12},(_,i) => String(row[4+i]||"—").trim()),
    diasAntes: String(row[16]||"").trim(),
    tipoDias: String(row[17]||"").trim(),
    prazoNaoUtil: String(row[18]||"").trim(),
    sabadoUtil: String(row[19]||"").trim(),
    competencia: String(row[20]||"").trim(),
    robo: parseBool(row[21]),
    multa: parseBool(row[22]),
    alertaGuia: parseBool(row[23]),
    ativa: true,
  };
}

function paginate<T>(data:T[], page:number) {
  return { slice: data.slice((page-1)*PER, page*PER), total: data.length };
}

function exportXlsx(filename:string, headers:string[], rows:unknown[][]) {
  const ws = XLSX.utils.aoa_to_sheet([headers,...rows]);
  ws["!cols"] = headers.map((h,ci)=>{ let max=h.length; rows.forEach(r=>{const v=String(r[ci]||"");if(v.length>max)max=v.length;}); return{wch:Math.min(max+2,50)}; });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Obrigações");
  XLSX.writeFile(wb, filename);
}

// ─── UI COMPONENTS ───────────────────────────────────────────────────────────

function Chip({type,children}:{type:"r"|"ok"|"a"|"gr"|"t"|"p";children:React.ReactNode}) {
  const s={r:{bg:C.redLt,c:C.red},ok:{bg:C.greenLt,c:C.greenDark},a:{bg:C.amberLt,c:C.amber},gr:{bg:C.gray10,c:C.gray70},t:{bg:C.tealLt,c:C.teal},p:{bg:C.purpleLt,c:C.purple}}[type];
  return <span style={{fontSize:10,fontWeight:600,padding:"2px 9px",borderRadius:20,whiteSpace:"nowrap",background:s.bg,color:s.c,display:"inline-block"}}>{children}</span>;
}

function DeptBadge({dept}:{dept:string}) {
  const dc=getDC(dept);
  return <span style={{fontSize:10,fontWeight:700,padding:"2px 10px",borderRadius:20,background:dc.bg,color:dc.color,whiteSpace:"nowrap",display:"inline-flex",alignItems:"center",gap:5}}>
    <span style={{width:6,height:6,borderRadius:"50%",background:dc.dot,display:"inline-block"}}/>
    {dept}
  </span>;
}

function Pager({page,total,onPage}:{page:number;total:number;onPage:(p:number)=>void}) {
  const pages=Math.ceil(total/PER); if(!total)return null;
  const s=(page-1)*PER+1,e=Math.min(page*PER,total);
  const btns:number[]=[]; for(let p=Math.max(1,page-3);p<=Math.min(pages,page+3);p++) btns.push(p);
  return <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderTop:`1px solid ${C.border}`,background:C.gray05}}>
    <span style={{fontSize:11,color:C.gray50}}>{s.toLocaleString("pt-BR")}–{e.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")}</span>
    <div style={{display:"flex",gap:3}}>
      <Pb disabled={page<=1} onClick={()=>onPage(page-1)}>‹</Pb>
      {btns.map(p=><Pb key={p} act={p===page} onClick={()=>onPage(p)}>{p}</Pb>)}
      <Pb disabled={page>=pages} onClick={()=>onPage(page+1)}>›</Pb>
    </div>
  </div>;
}
function Pb({children,onClick,disabled,act}:{children:React.ReactNode;onClick?:()=>void;disabled?:boolean;act?:boolean}) {
  return <button onClick={onClick} disabled={disabled} style={{fontFamily:"inherit",fontSize:11,fontWeight:600,padding:"4px 9px",borderRadius:6,border:`1px solid ${C.border}`,background:act?C.charcoal:C.white,color:act?"#fff":C.gray70,cursor:disabled?"default":"pointer",opacity:disabled?.35:1}}>{children}</button>;
}

function Empty() {
  return <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"44px",gap:9,color:C.gray50}}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="36" height="36" style={{opacity:.3}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <strong style={{fontSize:13,color:C.charcoal}}>Nenhum resultado</strong>
  </div>;
}

function SI({value,onChange,placeholder}:{value:string;onChange:(v:string)=>void;placeholder:string}) {
  return <div style={{position:"relative",flex:1,minWidth:180,maxWidth:320}}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13" style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",opacity:.4,pointerEvents:"none"}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{width:"100%",fontFamily:"inherit",fontSize:12,padding:"8px 10px 8px 32px",border:`1px solid ${C.border}`,borderRadius:10,background:C.white,color:C.ink,outline:"none",caretColor:"#0AE18C"}}/>
  </div>;
}

function Sel({value,onChange,children}:{value:string;onChange:(v:string)=>void;children:React.ReactNode}) {
  return <select value={value} onChange={e=>onChange(e.target.value)} style={{fontFamily:"inherit",fontSize:12,padding:"7px 10px",border:`1px solid ${C.border}`,borderRadius:10,background:C.white,color:C.ink,outline:"none",cursor:"pointer"}}>{children}</select>;
}

function BtnEx({onClick}:{onClick:()=>void}) {
  return <button onClick={onClick} style={{display:"inline-flex",alignItems:"center",gap:5,fontFamily:"inherit",fontSize:11,fontWeight:600,padding:"7px 13px",borderRadius:10,border:`1px solid ${C.border}`,background:C.white,color:C.gray70,cursor:"pointer",whiteSpace:"nowrap"}}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
    Exportar Excel
  </button>;
}

// ─── TABELA SIMPLES ──────────────────────────────────────────────────────────

function Tabela({data,showDept}:{data:Obrigacao[];showDept:boolean}) {
  const cols = showDept
    ? "24px 1fr 140px 130px 90px 90px"
    : "24px 1fr 130px 90px 90px";
  const headers = showDept
    ? ["","Nome da Obrigação / Mininome","Departamento","Responsável","Multa?","Robô?"]
    : ["","Nome da Obrigação / Mininome","Responsável","Multa?","Robô?"];

  return (
    <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:16,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
      <div style={{display:"grid",gridTemplateColumns:cols,padding:"0 14px",background:C.gray05,borderBottom:`1px solid ${C.border}`}}>
        {headers.map(h=><div key={h} style={{padding:"9px 7px",fontSize:10,fontWeight:700,color:C.gray50,textTransform:"uppercase",letterSpacing:".5px"}}>{h}</div>)}
      </div>
      {!data.length ? <Empty/> : data.map((ob,i)=>{
        const dc=getDC(ob.dept);
        const risk = ob.multa && !ob.robo; // risco: multa sem robô
        return (
          <div key={i} style={{display:"grid",gridTemplateColumns:cols,padding:"0 14px",borderBottom:`1px solid ${C.border}`,alignItems:"center",background:risk?"rgba(255,68,68,0.05)":"transparent"}}>
            {/* Barra de cor dept */}
            <div style={{display:"flex",justifyContent:"center"}}>
              <div style={{width:3,height:32,borderRadius:2,background:dc.dot}}/>
            </div>
            {/* Nome + mininome */}
            <div style={{padding:"9px 7px",minWidth:0}}>
              <div title={ob.nome} style={{fontSize:12,fontWeight:600,color:C.charcoal,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ob.nome}</div>
              {ob.mininome
                ? <div style={{fontSize:10,color:C.gray50,marginTop:2}}>{ob.mininome}</div>
                : <div style={{fontSize:10,color:C.gray30,marginTop:2,fontStyle:"italic"}}>sem mininome</div>
              }
            </div>
            {/* Dept (só na aba outros) */}
            {showDept && <div style={{padding:"9px 7px"}}><DeptBadge dept={ob.dept}/></div>}
            {/* Responsável */}
            <div style={{padding:"9px 7px"}}>
              <span style={{fontSize:11,color:C.gray70}}>{ob.responsavel}</span>
            </div>
            {/* Multa */}
            <div style={{padding:"9px 7px",textAlign:"center"}}>
              {ob.multa
                ? <Chip type="r">⚠ Sim</Chip>
                : <span style={{fontSize:10,color:C.gray30}}>Não</span>}
            </div>
            {/* Robô */}
            <div style={{padding:"9px 7px",textAlign:"center"}}>
              {ob.robo
                ? <Chip type="t">🤖 Sim</Chip>
                : ob.multa
                  ? <Chip type="a">⚠ Não</Chip>   // multa SEM robô — destaque
                  : <span style={{fontSize:10,color:C.gray30}}>Não</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── VISÃO GERAL ─────────────────────────────────────────────────────────────

function VisaoGeral({todas}:{todas:Obrigacao[]}) {
  // Análise principal: multa sem robô
  const multaSemRobo   = todas.filter(o => o.multa && !o.robo);
  const multaComRobo   = todas.filter(o => o.multa && o.robo);
  const totalMulta     = todas.filter(o => o.multa);
  const pctRisco       = totalMulta.length ? Math.round(multaSemRobo.length / totalMulta.length * 100) : 0;

  // Por departamento
  const depts = useMemo(()=>{
    const map: Record<string,{total:number;multa:number;robo:number;multaSemRobo:number}> = {};
    todas.forEach(ob=>{
      if(!map[ob.dept]) map[ob.dept]={total:0,multa:0,robo:0,multaSemRobo:0};
      map[ob.dept].total++;
      if(ob.multa) map[ob.dept].multa++;
      if(ob.robo)  map[ob.dept].robo++;
      if(ob.multa && !ob.robo) map[ob.dept].multaSemRobo++;
    });
    return Object.entries(map).sort((a,b)=>b[1].multaSemRobo-a[1].multaSemRobo);
  },[todas]);

  // Top 10 multa sem robô
  const [paginaMSR, setPaginaMSR] = useState(1);
  const [searchMSR, setSearchMSR] = useState("");
  const filtMSR = multaSemRobo.filter(o =>
    !searchMSR || o.nome.toLowerCase().includes(searchMSR.toLowerCase()) || o.dept.toLowerCase().includes(searchMSR.toLowerCase())
  );
  const {slice:sliceMSR,total:totalMSR} = paginate(filtMSR, paginaMSR);

  return (
    <div>
      <div style={{fontSize:10,fontWeight:700,color:C.gray50,textTransform:"uppercase",letterSpacing:".8px",marginBottom:4}}>Acessórias · Obrigações</div>
      <div style={{fontSize:19,fontWeight:800,color:C.charcoal,marginBottom:3}}>Visão Geral das Obrigações</div>
      <div style={{fontSize:12,color:C.gray50,marginBottom:20}}>Todas as obrigações ativas — análise de risco: multa sem automação</div>

      {/* Cards globais */}
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:20}}>
        {[
          {color:C.charcoal,n:todas.length,label:"Total de obrigações",sub:"Somente ativas"},
          {color:C.red,n:totalMulta.length,label:"Passíveis de multa",sub:Math.round(totalMulta.length/todas.length*100)+"% do total"},
          {color:C.teal,n:todas.filter(o=>o.robo).length,label:"Com automação",sub:Math.round(todas.filter(o=>o.robo).length/todas.length*100)+"% do total"},
        ].map(card=>(
          <div key={card.label} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:14,overflow:"hidden",minWidth:130,flex:1}}>
            <div style={{height:4,background:card.color}}/>
            <div style={{padding:"12px 15px"}}>
              <div style={{fontSize:22,fontWeight:800,color:card.color,marginBottom:2}}>{typeof card.n==="number"?card.n.toLocaleString("pt-BR"):card.n}</div>
              <div style={{fontSize:12,fontWeight:700,color:C.charcoal}}>{card.label}</div>
              <div style={{fontSize:10,color:C.gray50,marginTop:2}}>{card.sub}</div>
            </div>
          </div>
        ))}

        {/* Card destaque: multa SEM robô */}
        <div style={{background:C.white,border:`1.5px solid ${C.red}`,borderRadius:14,overflow:"hidden",minWidth:200,flex:2}}>
          <div style={{height:4,background:C.red}}/>
          <div style={{padding:"12px 15px"}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
              <div>
                <div style={{fontSize:26,fontWeight:800,color:C.red,marginBottom:2}}>{multaSemRobo.length}</div>
                <div style={{fontSize:13,fontWeight:700,color:C.charcoal}}>⚠ Multa SEM robô</div>
                <div style={{fontSize:11,color:C.gray50,marginTop:2}}>{pctRisco}% das obrigações com multa não têm automação</div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontSize:11,color:C.greenDark,fontWeight:600}}>{multaComRobo.length} com robô ✓</div>
                <div style={{marginTop:8,width:100,height:7,background:C.gray10,borderRadius:4,overflow:"hidden"}}>
                  <div style={{height:7,background:C.red,borderRadius:4,width:`${pctRisco}%`}}/>
                </div>
                <div style={{fontSize:10,color:C.gray50,marginTop:3}}>risco / total multa</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Por departamento — só os 4 principais */}
      <div style={{fontSize:13,fontWeight:700,color:C.charcoal,marginBottom:12}}>Por Departamento — Multa sem Robô</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12,marginBottom:28}}>
        {depts.filter(([dept])=>["Fiscal","Contábil","Pessoal","DOC"].includes(dept)).map(([dept,stats])=>{
          const dc=getDC(dept||"Outro");
          const pctMSR = stats.multa ? Math.round(stats.multaSemRobo/stats.multa*100) : 0;
          const deptLabel = dept === "Pessoal" ? "Folha" : dept;
          return (
            <div key={dept} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:14,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
              <div style={{height:4,background:dc.dot}}/>
              <div style={{padding:"12px 14px"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <DeptBadge dept={deptLabel}/>
                  <span style={{fontSize:11,color:C.gray50,fontWeight:600}}>{stats.total} obrigações</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                  {[
                    {label:"Com multa",n:stats.multa,color:C.red},
                    {label:"Com robô",n:stats.robo,color:C.teal},
                    {label:"⚠ Multa s/ robô",n:stats.multaSemRobo,color:stats.multaSemRobo>0?C.red:C.gray30},
                  ].map(item=>(
                    <div key={item.label} style={{background:C.gray05,borderRadius:8,padding:"6px 8px",textAlign:"center"}}>
                      <div style={{fontSize:15,fontWeight:800,color:item.color}}>{item.n}</div>
                      <div style={{fontSize:9,color:C.gray50,lineHeight:1.3}}>{item.label}</div>
                    </div>
                  ))}
                </div>
                {stats.multa > 0 && (
                  <div style={{marginTop:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.gray50,marginBottom:3}}>
                      <span>Risco (multa s/ robô)</span>
                      <span style={{color:pctMSR>50?C.red:pctMSR>20?C.amber:C.greenDark,fontWeight:700}}>{pctMSR}%</span>
                    </div>
                    <div style={{height:5,background:C.gray10,borderRadius:3,overflow:"hidden"}}>
                      <div style={{height:5,background:pctMSR>50?C.red:pctMSR>20?C.amber:C.greenDark,width:`${pctMSR}%`,borderRadius:3}}/>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Lista: multa SEM robô */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexWrap:"wrap"}}>
        <div style={{fontSize:13,fontWeight:700,color:C.charcoal}}>
          Lista: Multa sem Robô
          <span style={{marginLeft:8,fontSize:11,fontWeight:600,padding:"2px 9px",borderRadius:12,background:C.redLt,color:C.red}}>{multaSemRobo.length}</span>
        </div>
        <SI value={searchMSR} onChange={v=>{setSearchMSR(v);setPaginaMSR(1);}} placeholder="Buscar obrigação ou departamento..."/>
        <div style={{flex:1}}/>
        <BtnEx onClick={()=>{exportXlsx("multa_sem_robo.xlsx",["Nome da Obrigação","Mininome","Departamento","Responsável"],multaSemRobo.map(o=>[o.nome,o.mininome,o.dept,o.responsavel]));}}/>
      </div>
      <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:16,overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:"24px 1fr 140px 160px",padding:"0 14px",background:"rgba(255,68,68,0.07)",borderBottom:"1px solid rgba(255,68,68,0.2)"}}>
          {["","Nome da Obrigação / Mininome","Departamento","Responsável"].map(h=>
            <div key={h} style={{padding:"9px 7px",fontSize:10,fontWeight:700,color:C.red,textTransform:"uppercase",letterSpacing:".5px"}}>{h}</div>
          )}
        </div>
        {!sliceMSR.length ? <Empty/> : sliceMSR.map((ob,i)=>{
          const dc=getDC(ob.dept);
          return (
            <div key={i} style={{display:"grid",gridTemplateColumns:"24px 1fr 140px 160px",padding:"0 14px",borderBottom:`1px solid ${C.border}`,alignItems:"center"}}>
              <div style={{display:"flex",justifyContent:"center"}}><div style={{width:3,height:32,borderRadius:2,background:dc.dot}}/></div>
              <div style={{padding:"9px 7px",minWidth:0}}>
                <div title={ob.nome} style={{fontSize:12,fontWeight:600,color:C.charcoal,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ob.nome}</div>
                {ob.mininome && <div style={{fontSize:10,color:C.gray50,marginTop:2}}>{ob.mininome}</div>}
              </div>
              <div style={{padding:"9px 7px"}}><DeptBadge dept={ob.dept}/></div>
              <div style={{padding:"9px 7px",fontSize:11,color:C.gray70}}>{ob.responsavel}</div>
            </div>
          );
        })}
        <Pager page={paginaMSR} total={totalMSR} onPage={setPaginaMSR}/>
      </div>
    </div>
  );
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

export default function ObrigacoesAcessorias() {
  const [todas, setTodas] = useState<Obrigacao[]>([]);
  const [fileName, setFileName] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("visao");
  const [toast, setToast] = useState({msg:"",show:false});
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Filtros compartilhados por aba
  const [search, setSearch] = useState("");
  const [filtRobo, setFiltRobo] = useState("");
  const [filtMulta, setFiltMulta] = useState("");
  const [page, setPage] = useState(1);

  const showToast = useCallback((msg:string)=>{
    setToast({msg,show:true});
    clearTimeout(toastTimer.current);
    toastTimer.current=setTimeout(()=>setToast(t=>({...t,show:false})),2800);
  },[]);

  // Carregar do banco ao montar
  useEffect(() => {
    (async () => {
      setCarregando(true);
      const [{ data: rows }, { data: meta }] = await Promise.all([
        supabase.from("acessorias_obrigacoes" as never).select("*").order("dept").order("nome"),
        supabase.from("acessorias_obrigacoes_meta" as never).select("*").eq("id", 1).maybeSingle(),
      ]);
      if (rows && Array.isArray(rows)) {
        const parsed: Obrigacao[] = (rows as unknown as Array<Record<string, unknown>>).map(r => ({
          nome: String(r.nome||""),
          mininome: String(r.mininome||""),
          dept: String(r.dept||""),
          deptFull: String(r.dept_full||""),
          responsavel: String(r.responsavel||""),
          qtde: Number(r.qtde)||0,
          prazos: Array.isArray(r.prazos) ? (r.prazos as string[]) : [],
          diasAntes: String(r.dias_antes||""),
          tipoDias: String(r.tipo_dias||""),
          prazoNaoUtil: String(r.prazo_nao_util||""),
          sabadoUtil: String(r.sabado_util||""),
          competencia: String(r.competencia||""),
          robo: !!r.robo, multa: !!r.multa, alertaGuia: !!r.alerta_guia, ativa: !!r.ativa,
        }));
        setTodas(parsed);
      }
      if (meta) setFileName(String((meta as { file_name?: string }).file_name || ""));
      setCarregando(false);
    })();
  }, []);

  const persistir = useCallback(async (obrigacoes: Obrigacao[], nomeArquivo: string) => {
    // Limpa e regrava
    await supabase.from("acessorias_obrigacoes" as never).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const rows = obrigacoes.map(o => ({
      nome: o.nome, mininome: o.mininome, dept: o.dept, dept_full: o.deptFull,
      responsavel: o.responsavel, qtde: o.qtde, prazos: o.prazos,
      dias_antes: o.diasAntes, tipo_dias: o.tipoDias, prazo_nao_util: o.prazoNaoUtil,
      sabado_util: o.sabadoUtil, competencia: o.competencia,
      robo: o.robo, multa: o.multa, alerta_guia: o.alertaGuia, ativa: o.ativa,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from("acessorias_obrigacoes" as never).insert(rows.slice(i, i + 500) as never);
      if (error) throw error;
    }
    await supabase.from("acessorias_obrigacoes_meta" as never).upsert({
      id: 1, file_name: nomeArquivo, imported_at: new Date().toISOString(), total_ativas: obrigacoes.length,
    } as never);
  }, []);

  const handleFile = useCallback((file:File|null)=>{
    if(!file)return;
    setCarregando(true);
    showToast("Lendo planilha...");
    const reader=new FileReader();
    reader.onload=async (ev)=>{
      try{
        const wb=XLSX.read(ev.target?.result,{type:"binary"});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const raw=XLSX.utils.sheet_to_json(ws,{header:1,defval:""}) as unknown[][];
        const obrigacoes:Obrigacao[]=[];
        raw.slice(3).forEach(row=>{ const ob=parseRow(row as unknown[]); if(ob)obrigacoes.push(ob); });
        showToast("Salvando no banco...");
        await persistir(obrigacoes, file.name);
        setTodas(obrigacoes);
        setFileName(file.name);
        setActiveTab("visao");
        showToast(`✓ ${obrigacoes.length.toLocaleString("pt-BR")} obrigações salvas no banco!`);
      }catch(ex:unknown){
        let msg = "Erro desconhecido";
        if (ex instanceof Error) msg = ex.message;
        else if (ex && typeof ex === "object") {
          const e = ex as { message?: string; details?: string; hint?: string; code?: string };
          msg = e.message || e.details || e.hint || e.code || JSON.stringify(ex);
        } else msg = String(ex);
        showToast("Erro: " + msg);
        console.error("Erro upload planilha:", ex);
      }
      setCarregando(false);
    };
    reader.readAsBinaryString(file);
  },[showToast, persistir]);


  const DEPT_FILTER: Record<TabId,string[]> = {
    visao:[], fiscal:["Fiscal"], contabil:["Contábil"],
    folha:["Pessoal"], doc:["DOC"],
    outros:["Financeiro","Controladoria","Auditoria Externa","Societário",""],
  };

  const filtradas = useMemo(()=>{
    const df=DEPT_FILTER[activeTab];
    const q=search.toLowerCase();
    return todas.filter(ob=>{
      if(df.length && !df.includes(ob.dept)) return false;
      if(q && !ob.nome.toLowerCase().includes(q) && !ob.mininome.toLowerCase().includes(q) && !ob.responsavel.toLowerCase().includes(q)) return false;
      if(filtRobo==="sim" && !ob.robo) return false;
      if(filtRobo==="nao" && ob.robo) return false;
      if(filtMulta==="sim" && !ob.multa) return false;
      if(filtMulta==="nao" && ob.multa) return false;
      if(filtMulta==="risco" && !(ob.multa && !ob.robo)) return false;
      return true;
    });
  },[todas,activeTab,search,filtRobo,filtMulta]);

  const deptCount=useMemo(()=>{
    const m={fiscal:0,contabil:0,folha:0,doc:0,outros:0};
    todas.forEach(ob=>{
      if(ob.dept==="Fiscal")m.fiscal++;
      else if(ob.dept==="Contábil")m.contabil++;
      else if(ob.dept==="Pessoal")m.folha++;
      else if(ob.dept==="DOC")m.doc++;
      else m.outros++;
    });
    return m;
  },[todas]);

  const handleExport=()=>{
    const label=activeTab==="fiscal"?"Fiscal":activeTab==="contabil"?"Contábil":activeTab==="folha"?"Folha":activeTab==="doc"?"DOC":"Outros";
    exportXlsx(`obrigacoes_${label}.xlsx`,
      ["Nome da Obrigação","Mininome","Departamento","Responsável","Passível de Multa?","Exige Robô?"],
      filtradas.map(ob=>[ob.nome,ob.mininome,ob.dept,ob.responsavel,ob.multa?"Sim":"Não",ob.robo?"Sim":"Não"])
    );
    showToast("Excel exportado!");
  };

  const TH:React.CSSProperties={fontFamily:"inherit",fontSize:12,fontWeight:600,padding:"10px 16px",border:"none",background:"none",cursor:"pointer",borderBottom:"2px solid transparent",marginBottom:-2,display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap"};
  const tabs:[TabId,string,number|string][]=[
    ["visao","Visão Geral",""],
    ["fiscal","Fiscal",deptCount.fiscal||"—"],
    ["contabil","Contábil",deptCount.contabil||"—"],
    ["folha","Folha",deptCount.folha||"—"],
    ["doc","DOC",deptCount.doc||"—"],
    ["outros","Outros",deptCount.outros||"—"],
  ];

  // Tela de upload inicial
  if(!todas.length){
    return (
      <div style={{fontFamily:"'Poppins',sans-serif",background:C.offWhite,minHeight:"100vh"}}>
        <div style={{background:C.black,height:54,display:"flex",alignItems:"center",padding:"0 22px",gap:10}}>
          <div style={{width:30,height:30,background:C.green,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,color:C.black}}>P</div>
          <strong style={{color:"#fff",fontSize:13}}>Portal · Controle de Obrigações</strong>
        </div>
        <div style={{maxWidth:560,margin:"80px auto",padding:"0 22px",textAlign:"center"}}>
          <div style={{fontSize:48,marginBottom:16}}>📋</div>
          <div style={{fontSize:22,fontWeight:800,color:C.charcoal,marginBottom:8}}>Controle de Obrigações</div>
          <div style={{fontSize:13,color:C.gray50,marginBottom:32,lineHeight:1.6}}>Carregue a planilha exportada do S3D. Somente as obrigações <strong>ativas</strong> serão exibidas.</div>
          <label style={{display:"inline-flex",alignItems:"center",gap:8,fontFamily:"inherit",fontSize:14,fontWeight:700,padding:"14px 28px",borderRadius:14,border:"none",background:C.green,color:C.black,cursor:"pointer",boxShadow:"0 2px 12px rgba(10,225,140,.3)"}}>
            {carregando?"⏳ Carregando...":"📂 Carregar planilha S3D"}
            <input type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={e=>handleFile(e.target.files?.[0]??null)} disabled={carregando}/>
          </label>
          <div style={{marginTop:16,fontSize:11,color:C.gray30}}>S3D_obrigacoes_*.xlsx</div>
        </div>
        <div style={{position:"fixed",bottom:22,right:22,background:C.charcoal,color:"#fff",padding:"11px 16px",borderRadius:10,fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:7,zIndex:999,transition:"all .3s",transform:toast.show?"translateY(0)":"translateY(80px)",opacity:toast.show?1:0,pointerEvents:"none"}}>
          <svg viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" width="13" height="13"><polyline points="20 6 9 17 4 12"/></svg>
          {toast.msg}
        </div>
      </div>
    );
  }

  return (
    <div style={{fontFamily:"'Poppins',sans-serif",background:C.offWhite,minHeight:"100vh",fontSize:14}}>
      {/* TOPBAR */}
      <div style={{background:C.black,height:54,display:"flex",alignItems:"center",padding:"0 22px",gap:10,position:"sticky",top:0,zIndex:100}}>
        <div style={{width:30,height:30,background:C.green,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,color:C.black}}>P</div>
        <strong style={{color:"#fff",fontSize:13}}>Portal · Controle de Obrigações</strong>
        <span style={{fontSize:10,color:"rgba(255,255,255,.3)"}}>{fileName}</span>
        <div style={{marginLeft:"auto"}}>
          <label style={{display:"inline-flex",alignItems:"center",gap:5,fontFamily:"inherit",fontSize:11,fontWeight:600,padding:"6px 12px",borderRadius:8,border:"1px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.07)",color:"rgba(255,255,255,.75)",cursor:"pointer"}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Nova planilha
            <input type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={e=>handleFile(e.target.files?.[0]??null)}/>
          </label>
        </div>
      </div>

      {/* TABS */}
      <div style={{background:C.white,borderBottom:`2px solid ${C.border}`,display:"flex",padding:"0 22px",overflowX:"auto",alignItems:"center"}}>
        {tabs.map(([id,label,badge])=>{
          const act=activeTab===id;
          return <button key={id} onClick={()=>{setActiveTab(id);setSearch("");setFiltRobo("");setFiltMulta("");setPage(1);}} style={{...TH,color:act?C.greenDark:C.gray50,borderBottomColor:act?C.green:"transparent"}}>
            {label}
            {badge!==""&&<span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:12,background:act?C.greenLt:C.gray10,color:act?C.greenDark:C.gray50}}>{badge}</span>}
          </button>;
        })}
      </div>

      <div style={{maxWidth:1200,margin:"0 auto",padding:"22px 22px 80px"}}>

        {/* ── VISÃO GERAL ── */}
        {activeTab==="visao" && <VisaoGeral todas={todas}/>}

        {/* ── ABAS DEPARTAMENTO ── */}
        {activeTab!=="visao" && <div>
          <div style={{fontSize:10,fontWeight:700,color:C.gray50,textTransform:"uppercase",letterSpacing:".8px",marginBottom:4}}>
            {activeTab==="fiscal"?"Fiscal":activeTab==="contabil"?"Contábil":activeTab==="folha"?"Folha":activeTab==="doc"?"DOC":"Outros Departamentos"}
          </div>
          <div style={{fontSize:19,fontWeight:800,color:C.charcoal,marginBottom:14}}>
            Obrigações — {activeTab==="fiscal"?"Fiscal":activeTab==="contabil"?"Contábil":activeTab==="folha"?"Folha":activeTab==="doc"?"DOC":"Outros"}
          </div>

          {/* Mini stats */}
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:18}}>
            {[
              {label:"Total",n:filtradas.length,color:C.charcoal},
              {label:"Com multa",n:filtradas.filter(o=>o.multa).length,color:C.red},
              {label:"Com robô",n:filtradas.filter(o=>o.robo).length,color:C.teal},
              {label:"⚠ Multa s/ robô",n:filtradas.filter(o=>o.multa&&!o.robo).length,color:filtradas.some(o=>o.multa&&!o.robo)?C.red:C.greenDark},
            ].map(s=>(
              <div key={s.label} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 18px",flex:1,minWidth:110}}>
                <div style={{fontSize:20,fontWeight:800,color:s.color}}>{s.n.toLocaleString("pt-BR")}</div>
                <div style={{fontSize:11,color:C.gray50,marginTop:2}}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Filtros */}
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,flexWrap:"wrap"}}>
            <SI value={search} onChange={v=>{setSearch(v);setPage(1);}} placeholder="Buscar nome, mininome ou responsável..."/>
            <Sel value={filtMulta} onChange={v=>{setFiltMulta(v);setPage(1);}}>
              <option value="">Multa: Todas</option>
              <option value="sim">Com multa</option>
              <option value="nao">Sem multa</option>
              <option value="risco">⚠ Multa sem robô</option>
            </Sel>
            <Sel value={filtRobo} onChange={v=>{setFiltRobo(v);setPage(1);}}>
              <option value="">Robô: Todos</option>
              <option value="sim">🤖 Com robô</option>
              <option value="nao">Sem robô</option>
            </Sel>
            <div style={{flex:1}}/>
            <BtnEx onClick={handleExport}/>
          </div>

          {/* Tabela */}
          <Tabela data={paginate(filtradas,page).slice} showDept={activeTab==="outros"}/>
          <Pager page={page} total={filtradas.length} onPage={setPage}/>
        </div>}

      </div>

      {/* TOAST */}
      <div style={{position:"fixed",bottom:22,right:22,background:C.charcoal,color:"#fff",padding:"11px 16px",borderRadius:10,fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:7,zIndex:999,transition:"all .3s ease",transform:toast.show?"translateY(0)":"translateY(80px)",opacity:toast.show?1:0,pointerEvents:"none"}}>
        <svg viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" width="13" height="13"><polyline points="20 6 9 17 4 12"/></svg>
        {toast.msg}
      </div>
    </div>
  );
}
