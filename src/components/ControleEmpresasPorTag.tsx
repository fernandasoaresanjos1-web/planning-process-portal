// ControleEmpresasPorTag.tsx
// Cole em src/components/ControleEmpresasPorTag.tsx
// Dependência: npm install xlsx
// Uso: <ControleEmpresasPorTag />

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { canonicalTagKey, dedupeTagRows, listTagsBase } from "@/lib/parse-tags-html";
import { supabase } from "@/integrations/supabase/client";
import { getEmpresaBaseResumo, listEmpresasAtivas } from "@/lib/empresas-mensal";
import { criarSnapshot, listSnapshots, listSnapshotRows, type Snapshot, type SnapshotEmpresaRow } from "@/lib/controle-tags-snapshots";


// ─── TIPOS ───────────────────────────────────────────────────────────────────

interface TAG {
  id: number; key: string; label: string; tag: string;
  dept: string; coord: string; gerente: string; supers: string;
}

interface Empresa {
  cnpj: string; razao: string; regime: string; grupo: string;
  tags: string[]; sem_tag: boolean;
}

interface Inconsistencia {
  grupo: string; n_cnpj: number;
  issues: { tipo: string; desc: string }[];
  cnpjs: { cnpj: string; razao: string; tags: string[]; regime: string; esperado: boolean }[];
}

interface VincItem {
  grupo: string; n_cnpj: number;
  atual: { dp: boolean; fiscal: boolean; contabil: boolean };
  base?: { dp: boolean; fiscal: boolean; contabil: boolean };
  temBase: boolean; divergente: boolean; divCampos: string[];
}

interface TagEmpItem {
  cnpj: string; razao: string; grupo: string;
  tagsBase: string[]; tagsAtual: string[];
  status: "ok" | "divergente" | "nova" | "removida";
}

interface AuditEvent {
  ts: string; cnpj: string; razao: string; grupo: string;
  tipo: string; de: string; para: string;
}

type TabId = "tags" | "tagemp" | "empresas" | "auditoria" | "inc" | "vinculo" | "audmud" | "hist" | "cc";

// ─── CONSTANTES ──────────────────────────────────────────────────────────────

const CC_TAGS = ["Equipe DP 4","Equipe CC 1","Equipe CC 2","Equipe CC 4","Equipe Dedicada Canopus"];
const STORAGE_KEY = "acessorias_tags_v1";
const EMP_KEY = "acessorias_empresas_v1";
const VINC_KEY = "acessorias_vinculo_grupo_v1";
const TAGEMP_KEY = "acessorias_tag_empresa_v1";
const AUDMUD_KEY = "acessorias_auditoria_mudancas_v1";
const REGIMES_ESPERADOS = ["Domésticas","CEI","CAEPF","Produtor Rural","MEI","Micro Empreendedor","ImuneIsenta"];
const PER = 50;

const DEFAULT_TAGS: TAG[] = [];

const DEPT_ORDER = ["DP","Fiscal","Contábil","CC","Outra"];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function isCCTag(t: string) { return CC_TAGS.includes(t); }
function isPlanningRJTag(t: string) { const s=(t||"").toLowerCase(); return s.includes("planning rj")||s.includes("planning-rj")||s.includes("planningrj"); }
function isTagExcluida(t: string) { return isCCTag(t)||isPlanningRJTag(t); }
function isRegimeEsperado(r: string) { return REGIMES_ESPERADOS.some(x => r?.includes(x)); }
function chipCls(t: string) {
  if(t.includes("DP")&&!t.includes("Dedicada"))return "dp";
  if(t.includes("Fiscal")&&!t.includes("Teste"))return "fi";
  if(t.includes("Cont")&&!t.includes("Teste"))return "co";
  if(t.includes(" CC"))return "cc";
  if(t.includes("Integra")||t.includes("Dedicada"))return "int";
  return "warn";
}
function deptCls(d: string) {
  if(d==="DP")return "dp";if(d==="Fiscal")return "fi";if(d==="Contábil")return "co";if(d==="CC")return "cc";return "gray";
}
function tagsStr(tags: string[]) { return (tags||[]).slice().sort().join(", "); }
function labelI(t: string) {
  if(t==="DP_PARCIAL")return "DP parcial";if(t==="FI_PARCIAL")return "Fiscal parcial";
  if(t==="CO_PARCIAL")return "Contábil parcial";if(t==="DP_MISTO")return "DP misto";
  if(t==="FI_MISTO")return "Fiscal misto";if(t==="CO_MISTO")return "Contábil misto";return t;
}
function tipoLabel(t: string) {
  if(t==="TAG_ALTERADA")return "TAG alterada";if(t==="EMPRESA_INCLUIDA")return "Empresa incluída";
  if(t==="EMPRESA_EXCLUIDA")return "Empresa excluída";return t;
}
function fmtData(iso: string) {
  try{const d=new Date(iso);return d.toLocaleDateString("pt-BR")+" "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});}catch{return iso;}
}
function paginate<T>(data: T[], page: number, per=PER) {
  return {slice:data.slice((page-1)*per, page*per), total:data.length, pages:Math.ceil(data.length/per)};
}
function exportXlsx(filename: string, headers: string[], rows: unknown[][], sheetName: string) {
  const ws=XLSX.utils.aoa_to_sheet([headers,...rows]);
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,sheetName);
  XLSX.writeFile(wb,filename);
}
function exportCSV(rows: unknown[][], name: string) {
  const csv=rows.map(r=>r.map(v=>`"${String(v||"").replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8;"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;
  document.body.appendChild(a);a.click();document.body.removeChild(a);
}

function calcInconsistencias(empresas: Empresa[]): Inconsistencia[] {
  const byG: Record<string,Empresa[]>={};
  empresas.forEach(e=>{const g=e.grupo||"(Sem grupo)";if(!byG[g])byG[g]=[];byG[g].push(e);});
  const result: Inconsistencia[]=[];
  Object.keys(byG).forEach(g=>{
    const emps=byG[g];if(emps.length<2)return;
    const dp=emps.map(e=>e.tags.filter(t=>t.includes("DP")&&!t.includes("Dedicada")));
    const fi=emps.map(e=>e.tags.filter(t=>t.includes("Fiscal")&&!t.includes("Teste")));
    const co=emps.map(e=>e.tags.filter(t=>t.includes("Cont")&&!t.includes("Teste")));
    const espRegime=emps.map(e=>isRegimeEsperado(e.regime));
    const hdp=dp.map(x=>x.length>0),hfi=fi.map(x=>x.length>0),hco=co.map(x=>x.length>0);
    const dpFaltam=hdp.filter((h,i)=>!h&&!espRegime[i]).length;
    const fiFaltam=hfi.filter((h,i)=>!h&&!espRegime[i]).length;
    const coFaltam=hco.filter((h,i)=>!h&&!espRegime[i]).length;
    const dpTem=hdp.filter(Boolean).length,fiTem=hfi.filter(Boolean).length,coTem=hco.filter(Boolean).length;
    const issues: Inconsistencia["issues"]=[];
    if(dpTem>0&&dpFaltam>0)issues.push({tipo:"DP_PARCIAL",desc:`DP em ${dpTem}/${emps.length} CNPJs (${dpFaltam} pendente(s) real)`});
    if(fiTem>0&&fiFaltam>0)issues.push({tipo:"FI_PARCIAL",desc:`Fiscal em ${fiTem}/${emps.length} CNPJs (${fiFaltam} pendente(s) real)`});
    if(coTem>0&&coFaltam>0)issues.push({tipo:"CO_PARCIAL",desc:`Contábil em ${coTem}/${emps.length} CNPJs (${coFaltam} pendente(s) real)`});
    const sdp=[...new Set(dp.map(x=>[...x].sort().join("|")))].filter(Boolean);
    const sfi=[...new Set(fi.map(x=>[...x].sort().join("|")))].filter(Boolean);
    const sco=[...new Set(co.map(x=>[...x].sort().join("|")))].filter(Boolean);
    const udp=[...new Set(dp.flat())].sort(),ufi=[...new Set(fi.flat())].sort(),uco=[...new Set(co.flat())].sort();
    if(sdp.length>1)issues.push({tipo:"DP_MISTO",desc:`Equipes DP mistas: ${udp.join(", ")}`});
    if(sfi.length>1)issues.push({tipo:"FI_MISTO",desc:`Equipes Fiscal mistas: ${ufi.join(", ")}`});
    if(sco.length>1)issues.push({tipo:"CO_MISTO",desc:`Equipes Contábil mistas: ${uco.join(", ")}`});
    if(issues.length>0){
      result.push({grupo:g,n_cnpj:emps.length,issues,
        cnpjs:emps.map(e=>({cnpj:e.cnpj,razao:e.razao,tags:e.tags,regime:e.regime,esperado:isRegimeEsperado(e.regime)}))});
    }
  });
  return result;
}

function servicosAtuais(emps: Empresa[]) {
  return {
    dp:emps.some(e=>e.tags.some(t=>t.includes("DP")&&!t.includes("Dedicada"))),
    fiscal:emps.some(e=>e.tags.some(t=>t.includes("Fiscal")&&!t.includes("Teste"))),
    contabil:emps.some(e=>e.tags.some(t=>t.includes("Cont")&&!t.includes("Teste"))),
  };
}

function isGrupoCC(emps: Empresa[]) {
  return emps.every(e=>e.tags.length===0||e.tags.every(t=>isTagExcluida(t)||t==="CX"));
}

function compararTagEmp(empresas: Empresa[], baseTagEmp: Record<string,{razao:string;grupo:string;regime:string;tags:string[]}>): TagEmpItem[] {
  const atualMap: Record<string,Empresa>={};
  empresas.forEach(e=>{if(!e.tags.some(t=>isTagExcluida(t)))atualMap[e.cnpj]=e;});
  const todos=new Set([...Object.keys(atualMap),...Object.keys(baseTagEmp)]);
  return [...todos].map(cnpj=>{
    const atual=atualMap[cnpj];const base=baseTagEmp[cnpj];
    let status:"ok"|"divergente"|"nova"|"removida";
    if(base&&atual)status=tagsStr(base.tags)===tagsStr(atual.tags)?"ok":"divergente";
    else if(atual&&!base)status="nova";
    else status="removida";
    return {cnpj,razao:atual?.razao||base?.razao||"",grupo:atual?.grupo||base?.grupo||"",
      tagsBase:base?.tags||[],tagsAtual:atual?.tags||[],status};
  });
}

// ─── CHIP COMPONENT ──────────────────────────────────────────────────────────

const CHIP_COLORS: Record<string,{bg:string;color:string}> = {
  dp:{bg:"#EFF6FF",color:"#1D4ED8"},fi:{bg:"#FFF7ED",color:"#C2410C"},
  co:{bg:"#F0FDF4",color:"#15803D"},cc:{bg:"#F5F3FF",color:"#6D28D9"},
  int:{bg:"#F0FDFA",color:"#0F766E"},warn:{bg:"#FFF3E0",color:"#C2410C"},
  gray:{bg:"#F4F4F5",color:"#52525B"},
};

function Chip({tag}:{tag:string}) {
  const cls=chipCls(tag);const s=CHIP_COLORS[cls];
  return <span style={{fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:20,background:s.bg,color:s.color,whiteSpace:"nowrap",display:"inline-block",margin:"1px"}}>{tag}</span>;
}

function DeptBadge({dept,label}:{dept:string;label:string}) {
  const cls=deptCls(dept);const s=CHIP_COLORS[cls];
  return <span style={{fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:20,background:s.bg,color:s.color,whiteSpace:"nowrap"}}>{label}</span>;
}

// ─── SHARED UI ───────────────────────────────────────────────────────────────

const C={green:"#0AE18C",greenDark:"#00BF63",greenLt:"#EAFBF4",black:"#0C0C0C",charcoal:"#1A1A1A",ink:"#2C2C2C",gray70:"#4A4A4A",gray50:"#646464",gray30:"#CDCDCD",gray10:"#E8E8E8",gray05:"#F2F2F2",offWhite:"#FAFAFA",white:"#FFFFFF",border:"#E2E2E2",red:"#DC2626",redLt:"#FEE2E2",amber:"#FA6914",amberLt:"#FFF3E0",blue:"#14C8FA",blueLt:"#DDF6FF",purple:"#6D28D9"};

function SearchInput({value,onChange,placeholder}:{value:string;onChange:(v:string)=>void;placeholder:string}) {
  return <div style={{position:"relative",flex:1,minWidth:160,maxWidth:300}}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13" style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",opacity:.4,pointerEvents:"none"}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{width:"100%",fontFamily:"inherit",fontSize:12,padding:"8px 10px 8px 32px",border:`1px solid ${C.border}`,borderRadius:10,background:C.white,color:C.ink,outline:"none"}}/>
  </div>;
}

function Sel({value,onChange,children}:{value:string;onChange:(v:string)=>void;children:React.ReactNode}) {
  return <select value={value} onChange={e=>onChange(e.target.value)} style={{fontFamily:"inherit",fontSize:12,padding:"7px 10px",border:`1px solid ${C.border}`,borderRadius:10,background:C.white,color:C.ink,outline:"none",cursor:"pointer"}}>{children}</select>;
}

function Btn({onClick,children,primary,danger,sm}:{onClick:()=>void;children:React.ReactNode;primary?:boolean;danger?:boolean;sm?:boolean}) {
  return <button onClick={onClick} style={{display:"inline-flex",alignItems:"center",gap:5,fontFamily:"inherit",fontSize:sm?10:11,fontWeight:600,padding:sm?"4px 10px":"7px 13px",borderRadius:8,border:`1px solid ${primary?C.greenDark:danger?"#fca5a5":C.border}`,background:primary?C.green:danger?C.redLt:C.white,color:primary?C.black:danger?C.red:C.gray70,cursor:"pointer",whiteSpace:"nowrap"}}>{children}</button>;
}

function IccCard({n,label,sub,color}:{n:string|number;label:string;sub?:string;color:string}) {
  return <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 18px",minWidth:120,flex:1}}>
    <div style={{fontSize:24,fontWeight:800,color,marginBottom:4}}>{n}</div>
    <div style={{fontSize:11,fontWeight:700,color:C.charcoal}}>{label}</div>
    {sub&&<div style={{fontSize:10,color:C.gray50,marginTop:2}}>{sub}</div>}
  </div>;
}

function AcCard({type,n,title,sub}:{type:"warn"|"ok"|"amb"|"all";n:string;title:string;sub:string}) {
  const s={warn:{b:"#fca5a5",bg:C.redLt,c:C.red},ok:{b:"#6ee7b7",bg:C.greenLt,c:C.greenDark},amb:{b:"#fed7aa",bg:C.amberLt,c:C.amber},all:{b:C.border,bg:C.gray05,c:C.gray50}}[type];
  return <div style={{background:C.white,border:`1px solid ${s.b}`,borderRadius:12,overflow:"hidden",minWidth:140,flex:1}}>
    <div style={{padding:"10px 13px 8px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:8}}>
      <div style={{width:26,height:26,borderRadius:6,background:s.bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        <svg viewBox="0 0 24 24" fill="none" stroke={s.c} strokeWidth="2" width="12" height="12"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </div>
      <div><div style={{fontSize:11,fontWeight:700,color:C.charcoal}}>{title}</div><div style={{fontSize:10,color:C.gray50}}>{sub}</div></div>
    </div>
    <div style={{fontSize:20,fontWeight:800,padding:"9px 13px",color:s.c}}>{n}</div>
  </div>;
}

function Pager({page,total,onPage,per=PER}:{page:number;total:number;onPage:(p:number)=>void;per?:number}) {
  const pages=Math.ceil(total/per);if(!total)return null;
  const s=(page-1)*per+1,e=Math.min(page*per,total);
  const btns:number[]=[]; for(let p=Math.max(1,page-3);p<=Math.min(pages,page+3);p++) btns.push(p);
  return <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderTop:`1px solid ${C.border}`,background:C.gray05}}>
    <span style={{fontSize:11,color:C.gray50}}>{s.toLocaleString("pt-BR")}–{e.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")}</span>
    <div style={{display:"flex",gap:3}}>
      <PgBtn disabled={page<=1} onClick={()=>onPage(page-1)}>‹</PgBtn>
      {btns.map(p=><PgBtn key={p} active={p===page} onClick={()=>onPage(p)}>{p}</PgBtn>)}
      <PgBtn disabled={page>=pages} onClick={()=>onPage(page+1)}>›</PgBtn>
    </div>
  </div>;
}
function PgBtn({children,onClick,disabled,active}:{children:React.ReactNode;onClick?:()=>void;disabled?:boolean;active?:boolean}) {
  return <button onClick={onClick} disabled={disabled} style={{fontFamily:"inherit",fontSize:11,fontWeight:600,padding:"4px 9px",borderRadius:6,border:`1px solid ${C.border}`,background:active?C.charcoal:C.white,color:active?"#fff":C.gray70,cursor:disabled?"default":"pointer",opacity:disabled?.35:1}}>{children}</button>;
}

function Empty({msg}:{msg?:string}) {
  return <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"44px 22px",gap:9,color:C.gray50}}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="34" height="34" style={{opacity:.3}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <strong style={{fontSize:13,color:C.charcoal}}>{msg||"Nenhum resultado"}</strong>
  </div>;
}

function TableWrap({cols,headers,children,empty}:{cols:string;headers:string[];children:React.ReactNode;empty:boolean}) {
  return <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:16,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
    <div style={{display:"grid",gridTemplateColumns:cols,padding:"0 14px",background:C.gray05,borderBottom:`1px solid ${C.border}`}}>
      {headers.map(h=><div key={h} style={{padding:"9px 7px",fontSize:10,fontWeight:700,color:C.gray50,textTransform:"uppercase",letterSpacing:".5px"}}>{h}</div>)}
    </div>
    {empty?<Empty/>:children}
  </div>;
}

function TR({cols,children,bg}:{cols:string;children:React.ReactNode;bg?:string}) {
  return <div style={{display:"grid",gridTemplateColumns:cols,padding:"0 14px",borderBottom:`1px solid ${C.border}`,alignItems:"center",background:bg||"transparent"}}>{children}</div>;
}
function TD({children,style}:{children:React.ReactNode;style?:React.CSSProperties}) {
  return <div style={{padding:"8px 7px",fontSize:11,color:C.ink,minWidth:0,...style}}>{children}</div>;
}

// ─── MODAL TAG ───────────────────────────────────────────────────────────────

function ModalTag({open,editTag,onClose,onSave}:{open:boolean;editTag:TAG|null;onClose:()=>void;onSave:(t:Partial<TAG>)=>void}) {
  const [fLabel,setFLabel]=useState("");const [fDept,setFDept]=useState("");const [fCoord,setFCoord]=useState("");
  const [fGerente,setFGerente]=useState("");const [supers,setSupers]=useState<string[]>([]);const [newSup,setNewSup]=useState("");
  useEffect(()=>{if(editTag){setFLabel(editTag.label||editTag.tag||"");setFDept(editTag.dept||"");setFCoord(editTag.coord||"");setFGerente(editTag.gerente||"");setSupers(editTag.supers?editTag.supers.split(",").map(s=>s.trim()).filter(Boolean):[]);}else{setFLabel("");setFDept("");setFCoord("");setFGerente("");setSupers([]);}},[editTag,open]);
  const addSup=()=>{if(!newSup.trim())return;setSupers(s=>[...s,...newSup.split(",").map(x=>x.trim()).filter(Boolean)]);setNewSup("");};
  const fi:React.CSSProperties={border:`1px solid ${C.border}`,borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:12,color:C.ink,outline:"none",width:"100%"};
  if(!open)return null;
  return <div onClick={e=>{if(e.target===e.currentTarget)onClose();}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}}>
    <div style={{background:C.white,borderRadius:16,width:600,maxWidth:"96vw",maxHeight:"90vh",overflowY:"auto",padding:"24px 26px",boxShadow:"0 4px 20px rgba(0,0,0,.15)"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
        <div style={{fontSize:15,fontWeight:800,color:C.charcoal}}>{editTag?"Editar TAG":"Nova TAG"}</div>
        <button onClick={onClose} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:C.gray50}}>✕</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          <label style={{fontSize:11,fontWeight:600,color:C.gray70}}>TAG *</label>
          <input style={fi} value={fLabel} onChange={e=>setFLabel(e.target.value)} placeholder="ex: Fiscal - 9"/>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          <label style={{fontSize:11,fontWeight:600,color:C.gray70}}>Departamento *</label>
          <select style={fi} value={fDept} onChange={e=>setFDept(e.target.value)}>
            <option value="">Selecione...</option>
            {["DP","Fiscal","Contábil","CC","Outra"].map(d=><option key={d}>{d}</option>)}
          </select>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          <label style={{fontSize:11,fontWeight:600,color:C.gray70}}>Gerente</label>
          <input style={fi} value={fGerente} onChange={e=>setFGerente(e.target.value)} placeholder="Nome do gerente"/>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          <label style={{fontSize:11,fontWeight:600,color:C.gray70}}>Coordenação *</label>
          <input style={fi} value={fCoord} onChange={e=>setFCoord(e.target.value)} placeholder="Nome do coordenador"/>
        </div>
        <div style={{gridColumn:"1/-1",display:"flex",flexDirection:"column",gap:4}}>
          <label style={{fontSize:11,fontWeight:600,color:C.gray70}}>Supervisões</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:6}}>
            {supers.map((s,i)=><span key={i} style={{fontSize:10,fontWeight:600,padding:"2px 8px 2px 10px",borderRadius:20,background:C.gray10,color:C.gray70,display:"inline-flex",alignItems:"center",gap:4}}>
              {s}<button onClick={()=>setSupers(prev=>prev.filter((_,j)=>j!==i))} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:C.gray50,lineHeight:1}}>×</button>
            </span>)}
          </div>
          <div style={{display:"flex",gap:6}}>
            <input style={{...fi,flex:1}} value={newSup} onChange={e=>setNewSup(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addSup()} placeholder="Supervisor 1, Supervisor 2, ..."/>
            <button onClick={addSup} style={{fontFamily:"inherit",fontSize:11,fontWeight:700,padding:"7px 12px",borderRadius:8,border:"none",background:C.green,color:C.black,cursor:"pointer"}}>+</button>
          </div>
          <span style={{fontSize:"9.5px",color:C.gray50,fontStyle:"italic"}}>Separe por vírgula ou pressione + para adicionar</span>
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:20,paddingTop:14,borderTop:`1px solid ${C.border}`}}>
        <button onClick={onClose} style={{fontFamily:"inherit",fontSize:12,fontWeight:600,padding:"8px 16px",borderRadius:8,border:`1px solid ${C.border}`,background:C.white,color:C.ink,cursor:"pointer"}}>Cancelar</button>
        <button onClick={()=>{if(!fLabel||!fDept||!fCoord){alert("Preencha TAG, Departamento e Coordenação.");return;}const k=fLabel.trim().toLowerCase().startsWith("equipe ")?fLabel.trim():"Equipe "+fLabel.trim();onSave({label:fLabel.trim(),tag:fLabel.trim(),key:k,dept:fDept,coord:fCoord,gerente:fGerente,supers:supers.join(", ")});}} style={{fontFamily:"inherit",fontSize:12,fontWeight:600,padding:"8px 18px",borderRadius:8,border:"none",background:C.green,color:C.black,cursor:"pointer"}}>Salvar TAG</button>
      </div>
    </div>
  </div>;
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function ControleEmpresasPorTag() {
  const [tags, setTags] = useState<TAG[]>(DEFAULT_TAGS);
  const [nextId, setNextId] = useState(100);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [inconsistencias, setInconsistencias] = useState<Inconsistencia[]>([]);
  const [baseVinc, setBaseVinc] = useState<Record<string,{dp:boolean;fiscal:boolean;contabil:boolean}>>({});
  const [baseTagEmp, setBaseTagEmp] = useState<Record<string,{razao:string;grupo:string;regime:string;tags:string[]}>>({});
  const [auditMudancas, setAuditMudancas] = useState<AuditEvent[]>([]);

  const [activeTab, setActiveTab] = useState<TabId>("tags");
  const [toast, setToast] = useState({msg:"",show:false});
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Filters & pages
  const [tagSearch,setTagSearch]=useState(""); const [collapsedDepts,setCollapsedDepts]=useState<Set<string>>(new Set());
  const [empSearch,setEmpSearch]=useState(""); const [tagFil,setTagFil]=useState(""); const [viewMode,setViewMode]=useState("flat"); const [empPage,setEmpPage]=useState(1);
  const [audSearch,setAudSearch]=useState("");
  const [incSearch,setIncSearch]=useState(""); const [incTipo,setIncTipo]=useState(""); const [openIncs,setOpenIncs]=useState<Set<string>>(new Set());
  const [ccSearch,setCCSearch]=useState(""); const [ccTagFil,setCCTagFil]=useState(""); const [ccPage,setCCPage]=useState(1);
  const [vincSearch,setVincSearch]=useState(""); const [vincFiltro,setVincFiltro]=useState(""); const [vincPage,setVincPage]=useState(1);
  const [tagEmpSearch,setTagEmpSearch]=useState(""); const [tagEmpFiltro,setTagEmpFiltro]=useState(""); const [tagEmpPage,setTagEmpPage]=useState(1);
  const [audMudSearch,setAudMudSearch]=useState(""); const [audMudTipo,setAudMudTipo]=useState(""); const [audMudPage,setAudMudPage]=useState(1);
  const [modalOpen,setModalOpen]=useState(false); const [editTag,setEditTag]=useState<TAG|null>(null);
  const [baseAtiva,setBaseAtiva]=useState<{importacao_id:string|null;competencia:string|null;total:number;arquivo:string|null}|null>(null);
  const [loadingBase,setLoadingBase]=useState(false);
  const [snapshots,setSnapshots]=useState<Snapshot[]>([]);
  const [snapshotAberto,setSnapshotAberto]=useState<string|null>(null);
  const [snapshotRows,setSnapshotRows]=useState<SnapshotEmpresaRow[]>([]);
  const [snapshotLoading,setSnapshotLoading]=useState(false);


  const showToast=useCallback((msg:string)=>{setToast({msg,show:true});clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(t=>({...t,show:false})),2800);},[]);

  // ── PERSISTENCE ──
  useEffect(()=>{
    try{const s=localStorage.getItem(STORAGE_KEY);if(s){setTags(JSON.parse(s));const ni=localStorage.getItem(STORAGE_KEY+"_nextId");if(ni)setNextId(parseInt(ni));}}catch{}
    try{const s=localStorage.getItem(EMP_KEY)||sessionStorage.getItem(EMP_KEY);if(s){const p=JSON.parse(s);const emp=p.map((x:Record<string,unknown>)=>x.cnpj!==undefined?x:{cnpj:x.c,razao:x.r,regime:x.e,grupo:x.g,tags:x.t||[],sem_tag:x.s||false});if(emp.length){setEmpresas(emp);setInconsistencias(calcInconsistencias(emp));}}}catch{}
    try{const s=localStorage.getItem(VINC_KEY)||sessionStorage.getItem(VINC_KEY);if(s)setBaseVinc(JSON.parse(s));}catch{}
    try{const s=localStorage.getItem(TAGEMP_KEY)||sessionStorage.getItem(TAGEMP_KEY);if(s)setBaseTagEmp(JSON.parse(s));}catch{}
    try{const s=localStorage.getItem(AUDMUD_KEY)||sessionStorage.getItem(AUDMUD_KEY);if(s)setAuditMudancas(JSON.parse(s));}catch{}
    // Carrega tags_base do Supabase e MESCLA com o cache local (sem perder TAGs locais)
    (async()=>{
      try{
        const base=await listTagsBase();
        if(!base||base.length===0)return;
        const remote:TAG[]=base.map((b,i)=>({
          id:i+1,
          key:b.key,
          label:b.label||b.key,
          tag:b.label||b.key,
          dept:b.dept||"Outra",
          coord:b.coord||"",
          gerente:b.gerente||"",
          supers:(b.supers||[]).join(", "),
        }));
        setTags(prev=>{
          const byKey=new Map<string,TAG>();
          // Supabase é a única fonte da verdade — não preservar TAGs do DEFAULT_TAGS
          remote.forEach(t=>byKey.set(canonicalTagKey(t.key),{...t,key:canonicalTagKey(t.key)}));
          // Preservar APENAS TAGs locais que foram criadas nesta sessão (nextId > remote.length)
          // e que ainda não chegaram ao banco (ex: acabou de criar e ainda não sincronizou)
          prev.forEach(t=>{
            const k=canonicalTagKey(t.key);
            // Só preservar se não existe no banco E tem id alto (criada nesta sessão)
            if(!byKey.has(k) && t.id>=100) byKey.set(k,{...t,key:k});
          });
          const merged=dedupeTagRows(Array.from(byKey.values()).map((t,i)=>({
            key:t.key,
            label:t.label||t.key,
            dept:t.dept||"Outra",
            coord:t.coord||null,
            gerente:t.gerente||null,
            supers:t.supers?t.supers.split(",").map(s=>s.trim()).filter(Boolean):[],
            ordem:i,
          }))).map((t,i)=>({...t,id:i+1,coord:t.coord||"",gerente:t.gerente||"",supers:(t.supers||[]).join(", "),tag:t.label}));
          const nid=Math.max(merged.length+1, 100);
          setNextId(nid);
          try{localStorage.setItem(STORAGE_KEY,JSON.stringify(merged));localStorage.setItem(STORAGE_KEY+"_nextId",String(nid));}catch{}
          // NÃO empurrar TAGs locais para o banco — só salvar via botão "Salvar base" ou "Nova TAG"
          return merged;
        });
      }catch(e){console.warn("Falha ao carregar tags_base",e);}
    })();
  },[]);

  const saveTags=(t:TAG[],id:number)=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(t));localStorage.setItem(STORAGE_KEY+"_nextId",String(id));}catch{}};
  const saveEmpresas=(e:Empresa[])=>{try{const c=e.map(x=>({c:x.cnpj,r:x.razao,e:x.regime,g:x.grupo,t:x.tags,s:x.sem_tag}));try{localStorage.setItem(EMP_KEY,JSON.stringify(c));}catch{sessionStorage.setItem(EMP_KEY,JSON.stringify(c));}}catch{}};

  // ── BASE EMPRESAS (S3D mensal) ──
  const carregarDaBase=useCallback(async(silent=false)=>{
    setLoadingBase(true);
    try{
      const resumo=await getEmpresaBaseResumo();
      if(!resumo.importacao){
        setBaseAtiva(null);
        if(!silent)showToast("Nenhuma Base Empresas ativa. Importe em /base-empresas.");
        return;
      }
      setBaseAtiva({importacao_id:resumo.importacao.id,competencia:resumo.competencia,total:resumo.total,arquivo:resumo.importacao.arquivo_nome});
      const linhas=await listEmpresasAtivas();
      const newEmps:Empresa[]=linhas.map(l=>{
        const equipes=(l.tags||[]).filter(t=>t!=="CX"&&(t.includes("Equipe")||t.includes("Integra")));
        return {
          cnpj:String(l.cnpj||""),
          razao:String(l.razao||"").substring(0,65),
          regime:String(l.regime||"").substring(0,30),
          grupo:String(l.grupo||"").substring(0,45),
          tags:equipes,
          sem_tag:equipes.length===0,
        };
      });
      setEmpresas(newEmps);setInconsistencias(calcInconsistencias(newEmps));saveEmpresas(newEmps);
      if(!silent)showToast(`${newEmps.length.toLocaleString("pt-BR")} empresas carregadas da Base ${resumo.competencia?.slice(0,7)||""}`);
    }catch(e){console.warn("Falha ao carregar Base Empresas",e);if(!silent)showToast("Erro ao carregar Base Empresas");}
    finally{setLoadingBase(false);}
  },[showToast]);

  // auto-carrega Base Empresas ativa ao montar (mesmo se houver cache local)
  useEffect(()=>{ void carregarDaBase(true); /* silencioso na primeira carga */ },[carregarDaBase]);

  // ── SNAPSHOTS / HISTÓRICO ──
  const recarregarSnapshots=useCallback(async()=>{
    try{ setSnapshots(await listSnapshots(50)); }catch(e){ console.warn(e); }
  },[]);
  useEffect(()=>{ void recarregarSnapshots(); },[recarregarSnapshots]);
  const abrirSnapshot=useCallback(async(id:string)=>{
    setSnapshotAberto(id);setSnapshotLoading(true);
    try{ setSnapshotRows(await listSnapshotRows(id, true)); }
    catch(e){ console.warn(e); setSnapshotRows([]); }
    finally{ setSnapshotLoading(false); }
  },[]);



  // ── UPLOAD ──
  const handleXlsx=useCallback((file:File|null)=>{
    if(!file)return;showToast("Processando...");
    const reader=new FileReader();
    reader.onload=(ev)=>{
      try{
        const wb=XLSX.read(ev.target?.result,{type:"binary"});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:""}) as unknown[][];
        const hdr=(rows[0] as string[]).map(h=>String(h).trim());
        const ci=hdr.indexOf("CNPJ"),ri=hdr.indexOf("Razão social"),gi=hdr.indexOf("Grupo de Empresas"),ei=hdr.indexOf("Regime"),ti=hdr.indexOf("Tags");
        if(ci<0||ti<0){showToast("Colunas CNPJ ou Tags não encontradas");return;}
        const newEmps:Empresa[]=[];
        for(let i=1;i<rows.length;i++){
          const row=rows[i] as string[];const cnpj=String(row[ci]||"").trim();if(!cnpj)continue;
          const tagsRaw=String(row[ti]||"").trim();
          const allTags=tagsRaw?tagsRaw.split(",").map(t=>t.trim()).filter(Boolean):[];
          const equipes=allTags.filter(t=>t!=="CX"&&(t.includes("Equipe")||t.includes("Integra")));
          newEmps.push({cnpj,razao:String(row[ri]||"").trim().substring(0,65),regime:String(row[ei]||"").trim().substring(0,30),grupo:String(row[gi]||"").trim().substring(0,45),tags:equipes,sem_tag:equipes.length===0});
        }
        const inc=calcInconsistencias(newEmps);
        setEmpresas(newEmps);setInconsistencias(inc);saveEmpresas(newEmps);
        showToast(`${newEmps.length.toLocaleString("pt-BR")} empresas carregadas!`);
      }catch(err:unknown){showToast("Erro: "+(err instanceof Error?err.message:String(err)));}
    };
    reader.readAsBinaryString(file);
  },[showToast]);

  // ── TAG CRUD ──
  const upsertTagRemote=(t:TAG, ordem:number)=>{
    void supabase.from("tags_base").upsert({
      key:canonicalTagKey(t.key),
      label:t.label||t.key,
      dept:t.dept||"Outra",
      coord:t.coord||null,
      gerente:t.gerente||null,
      supers:t.supers?t.supers.split(",").map(s=>s.trim()).filter(Boolean):[],
      ordem,
      atualizado_em:new Date().toISOString(),
    },{ onConflict:"key" }).then(({error})=>{ if(error) console.warn("upsert tag falhou",error); });
  };
  const handleSaveTag=(data:Partial<TAG>)=>{
    let newTags:TAG[];let newNextId=nextId;
    if(editTag){newTags=tags.map(t=>t.id===editTag.id?{...t,...data}:t);showToast("TAG atualizada!");}
    else{newTags=[...tags,{id:newNextId,...data} as TAG];newNextId++;setNextId(newNextId);showToast("TAG adicionada!");}
    setTags(newTags);saveTags(newTags,newNextId);setModalOpen(false);setEditTag(null);
    const saved=editTag?newTags.find(t=>t.id===editTag.id):newTags[newTags.length-1];
    if(saved) upsertTagRemote(saved, newTags.findIndex(t=>t.key===saved.key));
  };
  const delTag=(id:number)=>{
    const t=tags.find(x=>x.id===id);if(!t||!confirm(`Excluir a TAG ${t.label}?`))return;
    const n=tags.filter(x=>x.id!==id);setTags(n);saveTags(n,nextId);showToast("TAG excluída");
    void supabase.from("tags_base").delete().eq("key", canonicalTagKey(t.key)).then(({error})=>{ if(error) console.warn("delete tag falhou",error); });
  };

  // ── DERIVED ──
  const tagsByDept=useMemo(()=>{
    const q=tagSearch.toLowerCase();const map:Record<string,TAG[]>={};
    DEPT_ORDER.forEach(d=>{map[d]=[];});
    tags.forEach(t=>{const ok=!q||(t.label||t.tag).toLowerCase().includes(q)||t.coord.toLowerCase().includes(q)||(t.gerente||"").toLowerCase().includes(q)||t.supers.toLowerCase().includes(q);if(ok){const b=map[t.dept]||(map["Outra"]);b.push(t);}});
    return map;
  },[tags,tagSearch]);

  // Employees tab
  const filtEmp=useMemo(()=>{
    const q=empSearch.toLowerCase();
    return empresas.filter(e=>{
      if(e.tags.some(t=>isTagExcluida(t)))return false;
      const mq=!q||e.cnpj.toLowerCase().includes(q)||e.razao.toLowerCase().includes(q)||(e.grupo||"").toLowerCase().includes(q);
      const mt=!tagFil||(tagFil==="__SEM__"?e.sem_tag:e.tags.includes(tagFil));
      return mq&&mt;
    });
  },[empresas,empSearch,tagFil]);

  // Auditoria
  const tagCount=useMemo(()=>{const tc:Record<string,number>={};empresas.forEach(e=>e.tags.forEach(t=>{if(!isTagExcluida(t))tc[t]=(tc[t]||0)+1;}));return tc;},[empresas]);
  const tagMap=useMemo(()=>{
    const m:Record<string,TAG>={};
    tags.forEach(t=>{
      const variants=new Set<string>();
      [t.key,t.label,t.tag].filter(Boolean).forEach(v=>{
        const s=v.trim();
        variants.add(s);
        variants.add(canonicalTagKey(s));
        if(s.toLowerCase().startsWith("equipe ")) variants.add(s.slice(7).trim());
        else variants.add("Equipe "+s);
      });
      variants.forEach(v=>{ if(!m[v]) m[v]=t; });
    });
    return m;
  },[tags]);
  const lookupTag=(tag:string)=>tagMap[tag]||tagMap[canonicalTagKey(tag)]||tagMap[canonicalTagKey(tag).replace(/^Equipe\s+/i,"")];
  const semCoord=useMemo(()=>Object.keys(tagCount).filter(tag=>{const b=lookupTag(tag);return !b||!b.coord?.trim();}),[tagCount,tagMap]);
  const comCoord=useMemo(()=>Object.keys(tagCount).filter(tag=>{const b=lookupTag(tag);return !!b&&!!b.coord?.trim();}),[tagCount,tagMap]);

  // Inconsistencias
  const filtInc=useMemo(()=>{
    const q=incSearch.toLowerCase();
    const INCONC=inconsistencias.filter(i=>{
      const ccIssue=i.issues.every(x=>{const parts=x.desc.split(":");if(parts.length<2)return false;const eq=parts[1].split(",").map(s=>s.trim());return eq.every(e=>isCCTag(e));});
      if(ccIssue)return false;
      const allCC=i.cnpjs.every(c=>c.tags.length===0||c.tags.every(t=>isCCTag(t)));
      return !allCC;
    });
    return INCONC.filter(i=>(!q||i.grupo.toLowerCase().includes(q))&&(!incTipo||i.issues.some(x=>x.tipo.includes(incTipo))));
  },[inconsistencias,incSearch,incTipo]);

  // CC
  const filtCC=useMemo(()=>{
    const q=ccSearch.toLowerCase();
    return empresas.filter(e=>{
      const hasCC=e.tags.some(t=>isTagExcluida(t));if(!hasCC)return false;
      const mq=!q||e.cnpj.toLowerCase().includes(q)||e.razao.toLowerCase().includes(q)||(e.grupo||"").toLowerCase().includes(q);
      const mt=!ccTagFil||e.tags.includes(ccTagFil);return mq&&mt;
    });
  },[empresas,ccSearch,ccTagFil]);

  // Vinculo
  const vincItems=useMemo(()=>{
    if(!empresas.length)return[];
    const byG:Record<string,Empresa[]>={};
    empresas.forEach(e=>{const g=e.grupo||"(Sem grupo)";if(!byG[g])byG[g]=[];byG[g].push(e);});
    const q=vincSearch.toLowerCase();
    const items:VincItem[]=Object.keys(byG).filter(g=>!isGrupoCC(byG[g])).map(g=>{
      const emps=byG[g];const atual=servicosAtuais(emps);const base=baseVinc[g];const temBase=!!base;
      const div=temBase?["dp","fiscal","contabil"].filter(k=>base[k as keyof typeof base]!==atual[k as keyof typeof atual]).map(k=>k==="dp"?"DP":k==="fiscal"?"Fiscal":"Contábil"):[];
      return{grupo:g,n_cnpj:emps.length,atual,base,temBase,divergente:div.length>0,divCampos:div};
    }).filter(g=>!q||g.grupo.toLowerCase().includes(q));
    items.sort((a,b)=>{if(a.divergente!==b.divergente)return a.divergente?-1:1;return a.grupo.localeCompare(b.grupo);});
    const filtro=vincFiltro;
    return items.filter(g=>{
      if(filtro==="divergente")return g.divergente;if(filtro==="ok")return g.temBase&&!g.divergente;
      if(filtro==="sem_base")return !g.temBase;
      const n=(g.atual.dp?1:0)+(g.atual.fiscal?1:0)+(g.atual.contabil?1:0);
      if(filtro==="parcial")return n===1||n===2;if(filtro==="geral")return g.atual.dp&&g.atual.fiscal&&g.atual.contabil;
      if(filtro==="so_contabil")return g.atual.contabil&&!g.atual.dp&&!g.atual.fiscal;
      if(filtro==="so_fiscal")return g.atual.fiscal&&!g.atual.dp&&!g.atual.contabil;
      if(filtro==="so_dp")return g.atual.dp&&!g.atual.fiscal&&!g.atual.contabil;
      return true;
    });
  },[empresas,baseVinc,vincSearch,vincFiltro]);

  // Tag por empresa
  const tagEmpList=useMemo(()=>empresas.length?compararTagEmp(empresas,baseTagEmp):[],[empresas,baseTagEmp]);
  const filtTagEmp=useMemo(()=>{
    const q=tagEmpSearch.toLowerCase();
    const ord={divergente:0,nova:1,removida:2,ok:3} as Record<string,number>;
    return tagEmpList.filter(x=>{
      if(q&&!x.cnpj.toLowerCase().includes(q)&&!(x.razao||"").toLowerCase().includes(q)&&!(x.grupo||"").toLowerCase().includes(q))return false;
      if(tagEmpFiltro&&tagEmpFiltro!==x.status)return false;return true;
    }).sort((a,b)=>{if(ord[a.status]!==ord[b.status])return ord[a.status]-ord[b.status];return(a.razao||"").localeCompare(b.razao||"");});
  },[tagEmpList,tagEmpSearch,tagEmpFiltro]);

  // Audit mudancas
  const filtAudMud=useMemo(()=>{
    const q=audMudSearch.toLowerCase();
    return [...auditMudancas].filter(x=>{
      if(q&&!x.cnpj.toLowerCase().includes(q)&&!(x.razao||"").toLowerCase().includes(q)&&!(x.grupo||"").toLowerCase().includes(q))return false;
      if(audMudTipo&&x.tipo!==audMudTipo)return false;return true;
    }).sort((a,b)=>new Date(b.ts).getTime()-new Date(a.ts).getTime());
  },[auditMudancas,audMudSearch,audMudTipo]);

  // ── ACTIONS ──
  const gerarBaseVinculo=()=>{
    if(!empresas.length){showToast("Carregue a planilha primeiro");return;}
    const byG:Record<string,Empresa[]>={};empresas.forEach(e=>{const g=e.grupo||"(Sem grupo)";if(!byG[g])byG[g]=[];byG[g].push(e);});
    const newBase={...baseVinc};let count=0;
    Object.keys(byG).forEach(g=>{if(isGrupoCC(byG[g]))return;newBase[g]=servicosAtuais(byG[g]);count++;});
    setBaseVinc(newBase);try{localStorage.setItem(VINC_KEY,JSON.stringify(newBase));}catch{}
    showToast(`Base gerada para ${count.toLocaleString("pt-BR")} grupos!`);
  };

  const gerarBaseTagEmp=async()=>{
    if(!empresas.length){showToast("Carregue a planilha primeiro");return;}
    const primeiraVez=Object.keys(baseTagEmp).length===0;
    const lista=tagEmpList;let nEventos=0;let newMud=[...auditMudancas];
    if(!primeiraVez){
      const ts=new Date().toISOString();
      lista.forEach(x=>{
        if(x.status==="divergente"){newMud.push({ts,cnpj:x.cnpj,razao:x.razao,grupo:x.grupo,tipo:"TAG_ALTERADA",de:tagsStr(x.tagsBase)||"—",para:tagsStr(x.tagsAtual)||"—"});nEventos++;}
        else if(x.status==="nova"){newMud.push({ts,cnpj:x.cnpj,razao:x.razao,grupo:x.grupo,tipo:"EMPRESA_INCLUIDA",de:"—",para:tagsStr(x.tagsAtual)||"—"});nEventos++;}
        else if(x.status==="removida"){newMud.push({ts,cnpj:x.cnpj,razao:x.razao,grupo:x.grupo,tipo:"EMPRESA_EXCLUIDA",de:tagsStr(x.tagsBase)||"—",para:"—"});nEventos++;}
      });
    }
    const novaBase:Record<string,{razao:string;grupo:string;regime:string;tags:string[]}> ={};
    empresas.forEach(e=>{if(!e.tags.some(t=>isTagExcluida(t)))novaBase[e.cnpj]={razao:e.razao,grupo:e.grupo,regime:e.regime,tags:[...e.tags]};});
    setBaseTagEmp(novaBase);setAuditMudancas(newMud);
    try{localStorage.setItem(TAGEMP_KEY,JSON.stringify(novaBase));}catch{}
    try{localStorage.setItem(AUDMUD_KEY,JSON.stringify(newMud));}catch{}

    // Persistir snapshot no banco com diff vs último snapshot
    try{
      const snapEmpresas=empresas.filter(e=>!e.tags.some(t=>isTagExcluida(t))).map(e=>({
        cnpj:e.cnpj,razao:e.razao,regime:e.regime,grupo:e.grupo,tags:e.tags,sem_tag:e.sem_tag,
      }));
      const r=await criarSnapshot({
        empresas:snapEmpresas,
        importacaoId:baseAtiva?.importacao_id??null,
        competencia:baseAtiva?.competencia??null,
        observacao:primeiraVez?"Snapshot inicial":"Snapshot manual",
      });
      await recarregarSnapshots();
      showToast(`Snapshot salvo no Hub: ${r.alteradas} alt · ${r.novas} novas · ${r.removidas} removidas`);
    }catch(e){
      console.warn("Falha ao salvar snapshot",e);
      if(primeiraVez)showToast(`Base inicial criada (${Object.keys(novaBase).length.toLocaleString("pt-BR")} empresas) — falha ao salvar no Hub`);
      else showToast(nEventos>0?`${nEventos} mudança(s) — falha ao salvar no Hub`:"Base atualizada — falha ao salvar no Hub");
    }
  };


  // ── EXPORTS ──
  const exportTags=()=>{exportCSV([["TAG","Departamento","Gerente","Coordenação","Supervisores"],...tags.map(t=>[t.label||t.tag,t.dept,t.gerente||"",t.coord,t.supers])],"tags_gestao.csv");showToast("Exportado!");};
  const exportEmp=()=>{exportCSV([["CNPJ","Razao Social","Grupo","Regime","TAGs"],...filtEmp.map(e=>[e.cnpj,e.razao,e.grupo,e.regime,e.tags.join("; ")])],"empresas_por_tag.csv");showToast("Exportado!");};
  const exportCC=()=>{exportCSV([["CNPJ","Razao Social","Grupo","Regime","TAGs"],...filtCC.map(e=>[e.cnpj,e.razao,e.grupo,e.regime,e.tags.join("; ")])],"cc_construcao_civil.csv");showToast("Exportado!");};
  const exportInc=()=>{const rows:unknown[][]=[];filtInc.forEach(i=>{const tipos=i.issues.map(is=>labelI(is.tipo)).join(" | ");const descs=i.issues.map(is=>is.desc).join(" | ");i.cnpjs.forEach(c=>{rows.push([i.grupo,i.n_cnpj,tipos,descs,c.cnpj,c.razao,c.regime||"—",c.esperado?"Esperado":"Pendente",c.tags.join(", ")]);});});exportXlsx(`inconsistencias_tags_${new Date().toISOString().slice(0,10)}.xlsx`,["Grupo","Qtd CNPJs","Tipo","Descrição","CNPJ","Razão Social","Regime","Status","TAGs"],rows,"Inconsistências");showToast("Excel exportado!");};
  const exportVinc=()=>{exportXlsx(`vinculo_grupo_${new Date().toISOString().slice(0,10)}.xlsx`,["Grupo","DP Base","DP Atual","Fiscal Base","Fiscal Atual","Contábil Base","Contábil Atual","CNPJs","Status"],vincItems.map(g=>[g.grupo,g.temBase?(g.base!.dp?"Sim":"Não"):"—",g.atual.dp?"Sim":"Não",g.temBase?(g.base!.fiscal?"Sim":"Não"):"—",g.atual.fiscal?"Sim":"Não",g.temBase?(g.base!.contabil?"Sim":"Não"):"—",g.atual.contabil?"Sim":"Não",g.n_cnpj,!g.temBase?"Sem base":g.divergente?"Divergente: "+g.divCampos.join(", "):"Conferindo"]),"Vínculo por Grupo");showToast("Excel exportado!");};
  const exportTagEmp=()=>{exportXlsx(`tag_por_empresa_${new Date().toISOString().slice(0,10)}.xlsx`,["CNPJ","Razão Social","Grupo","TAG na base","TAG atual","Status"],filtTagEmp.map(x=>[x.cnpj,x.razao,x.grupo,tagsStr(x.tagsBase),tagsStr(x.tagsAtual),{divergente:"TAG alterada",nova:"Nova — incluir",removida:"Removida — excluir",ok:"Conferindo"}[x.status]]),"TAG por Empresa");showToast("Excel exportado!");};
  const exportAudMud=()=>{exportXlsx(`auditoria_tag_${new Date().toISOString().slice(0,10)}.xlsx`,["Data/Hora","CNPJ","Razão Social","Grupo","Evento","De","Para"],filtAudMud.map(x=>[fmtData(x.ts),x.cnpj,x.razao,x.grupo,tipoLabel(x.tipo),x.de,x.para]),"Auditoria de Mudanças");showToast("Excel exportado!");};

  const TH: React.CSSProperties={fontFamily:"inherit",fontSize:12,fontWeight:600,padding:"10px 16px",border:"none",background:"none",cursor:"pointer",borderBottom:"2px solid transparent",marginBottom:-2,display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap"};

  const tabs:[TabId,string,string|number][]=[
    ["tags","TAGs por Gestão",tags.length],
    ["tagemp","Base de TAG por Empresa",filtTagEmp.filter(x=>x.status!=="ok").length||"—"],
    ["empresas","Empresas por Grupo",empresas.filter(e=>!e.tags.some(t=>isTagExcluida(t))).length||"—"],
    ["auditoria","Auditoria",semCoord.length||"—"],
    ["inc","Inconsistências",filtInc.length||"—"],
    ["vinculo","Vínculo por Grupo",vincItems.filter(g=>g.divergente).length||"—"],
    ["audmud","Auditoria de Mudanças",auditMudancas.length],
    ["hist","Histórico no Hub",snapshots.length||"—"],
    ["cc","Construção Civil",filtCC.length||"—"],
  ];


  const DEPT_COLORS: Record<string,{lt:string;accent:string}> = {DP:{lt:"#EFF6FF",accent:"#1D4ED8"},Fiscal:{lt:"#FFF7ED",accent:"#C2410C"},Contábil:{lt:"#F0FDF4",accent:"#15803D"},CC:{lt:"#F5F3FF",accent:"#6D28D9"},Outra:{lt:C.gray05,accent:C.gray70}};

  return (
    <div style={{fontFamily:"'Poppins',sans-serif",background:C.offWhite,minHeight:"100vh",fontSize:14}}>

      {/* TOPBAR */}
      <div style={{background:C.black,height:54,display:"flex",alignItems:"center",padding:"0 22px",gap:10,position:"sticky",top:0,zIndex:100}}>
        <div style={{width:30,height:30,background:C.green,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,color:C.black}}>P</div>
        <div style={{display:"flex",alignItems:"center",gap:5,color:"rgba(255,255,255,.4)",fontSize:11,fontWeight:500}}>
          <span>Portal</span><span style={{color:"rgba(255,255,255,.2)"}}>›</span>
          <strong style={{color:"#fff"}}>Controle de Empresas por TAG</strong>
        </div>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
          {baseAtiva&&(
            <div style={{fontSize:10,color:"rgba(255,255,255,.6)",fontWeight:500}}>
              Base ativa: <strong style={{color:"#fff"}}>{baseAtiva.competencia?.slice(0,7)||"—"}</strong> · {baseAtiva.total.toLocaleString("pt-BR")} empresas
            </div>
          )}
          <button onClick={()=>void carregarDaBase(false)} disabled={loadingBase} style={{display:"flex",alignItems:"center",gap:5,fontFamily:"inherit",fontSize:11,fontWeight:600,padding:"6px 12px",borderRadius:8,border:`1px solid ${C.green}`,background:C.green,color:C.black,cursor:loadingBase?"default":"pointer",opacity:loadingBase?.6:1}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            {loadingBase?"Carregando…":"Recarregar Base Empresas"}
          </button>
          <label style={{display:"flex",alignItems:"center",gap:5,fontFamily:"inherit",fontSize:11,fontWeight:600,padding:"6px 12px",borderRadius:8,border:"1px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.07)",color:"rgba(255,255,255,.75)",cursor:"pointer"}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            xlsx avulso
            <input type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={e=>handleXlsx(e.target.files?.[0]??null)}/>
          </label>
        </div>

      </div>

      {/* TABS */}
      <div style={{background:C.white,borderBottom:`2px solid ${C.border}`,display:"flex",padding:"0 22px",overflowX:"auto",alignItems:"center"}}>
        {tabs.map(([id,label,badge])=>{
          const act=activeTab===id;
          return <button key={id} onClick={()=>setActiveTab(id)} style={{...TH,color:act?C.greenDark:C.gray50,borderBottomColor:act?C.green:"transparent"}}>
            {label}
            <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:12,background:act?C.greenLt:C.gray10,color:act?C.greenDark:C.gray50}}>{badge}</span>
          </button>;
        })}
      </div>

      <div style={{maxWidth:1400,margin:"0 auto",padding:"22px 22px 80px"}}>

        {/* ── ABA: TAGs POR GESTÃO ── */}
        {activeTab==="tags"&&<div>
          <div style={{fontSize:10,fontWeight:700,color:C.gray50,textTransform:"uppercase",letterSpacing:".8px",marginBottom:4}}>Acessórias · Gestão de TAGs</div>
          <div style={{fontSize:19,fontWeight:800,color:C.charcoal,marginBottom:3}}>TAGs por Gestão</div>
          <div style={{fontSize:12,color:C.gray50,marginBottom:18}}>Clique no lápis para editar coordenação e supervisores.</div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:18,flexWrap:"wrap"}}>
            <SearchInput value={tagSearch} onChange={setTagSearch} placeholder="Buscar TAG, coordenação ou supervisor..."/>
            <div style={{flex:1}}/>
            <Btn onClick={()=>{setEditTag(null);setModalOpen(true);}} primary><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="11" height="11"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Nova TAG</Btn>
            <Btn onClick={exportTags}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Exportar</Btn>
            <Btn onClick={()=>{saveTags(tags,nextId);showToast("Base de TAGs salva!");}} primary><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>Salvar base</Btn>
            <Btn onClick={()=>{if(confirm("Limpar base salva e restaurar padrão?")){setTags(DEFAULT_TAGS);setNextId(100);try{localStorage.removeItem(STORAGE_KEY);}catch{}showToast("Padrão restaurado!");}}} danger>Resetar</Btn>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {DEPT_ORDER.map(dept=>{
              const list=tagsByDept[dept];if(!list||!list.length)return null;
              const co=DEPT_COLORS[dept]||DEPT_COLORS.Outra;
              const collapsed=collapsedDepts.has(dept);
              return <div key={dept} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:16,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
                <div onClick={()=>{const s=new Set(collapsedDepts);if(s.has(dept))s.delete(dept);else s.add(dept);setCollapsedDepts(s);}} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 18px",cursor:"pointer",background:co.lt}}>
                  <div style={{width:28,height:28,borderRadius:7,background:C.white,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <svg viewBox="0 0 24 24" fill="none" stroke={co.accent} strokeWidth="1.8" width="14" height="14"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  </div>
                  <span style={{fontSize:13,fontWeight:700,color:co.accent}}>{dept}</span>
                  <span style={{fontSize:11,fontWeight:600,padding:"2px 10px",borderRadius:20,background:C.white,color:co.accent}}>{list.length} TAG{list.length>1?"s":""}</span>
                  <button onClick={e=>{e.stopPropagation();setEditTag(null);setModalOpen(true);}} style={{fontFamily:"inherit",fontSize:10,fontWeight:700,padding:"4px 10px",borderRadius:6,border:`1px solid ${co.accent}`,background:C.white,color:co.accent,cursor:"pointer",marginLeft:4}}>+ Add TAG</button>
                  <svg style={{marginLeft:"auto",transform:collapsed?"rotate(-90deg)":"",transition:"transform .2s"}} viewBox="0 0 24 24" fill="none" stroke={co.accent} strokeWidth="2" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>
                </div>
                {!collapsed&&<>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 140px 180px 1fr 80px",padding:"6px 18px",background:C.gray05,borderBottom:`1px solid ${C.border}`}}>
                    {["TAG","Gerente","Coordenação","Supervisões","Ações"].map(h=><div key={h} style={{fontSize:10,fontWeight:700,color:C.gray50,textTransform:"uppercase",letterSpacing:".5px",padding:"4px 0"}}>{h}</div>)}
                  </div>
                  {list.map(t=>{
                    const supArr=t.supers?t.supers.split(",").map(s=>s.trim()).filter(Boolean):[];
                    return <div key={t.id} style={{display:"grid",gridTemplateColumns:"1fr 140px 180px 1fr 80px",padding:"0 18px",borderBottom:`1px solid ${C.border}`,alignItems:"center",minHeight:46}}>
                      <div style={{padding:"8px 0"}}><DeptBadge dept={dept} label={t.label||t.tag}/></div>
                      <div style={{fontSize:11,color:C.gray70,fontWeight:500}}>{t.gerente||"—"}</div>
                      <div style={{fontSize:11,fontWeight:600,color:C.charcoal}}>{t.coord||"—"}</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:3,padding:"4px 0"}}>
                        {supArr.length?supArr.map((s,i)=><span key={i} style={{fontSize:10,fontWeight:500,padding:"2px 8px",borderRadius:20,background:C.gray10,color:C.gray70}}>{s}</span>):<span style={{fontSize:11,color:C.gray30}}>Sem supervisores</span>}
                      </div>
                      <div style={{display:"flex",gap:4}}>
                        <button onClick={()=>{setEditTag(t);setModalOpen(true);}} style={{width:28,height:28,borderRadius:7,border:`1px solid ${C.border}`,background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:C.gray50}} title="Editar">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button onClick={()=>delTag(t.id)} style={{width:28,height:28,borderRadius:7,border:`1px solid ${C.border}`,background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:C.gray50}} title="Excluir">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                        </button>
                      </div>
                    </div>;
                  })}
                </>}
              </div>;
            })}
          </div>
        </div>}

        {/* ── ABA: EMPRESAS ── */}
        {activeTab==="empresas"&&<div>
          <div style={{fontSize:19,fontWeight:800,color:C.charcoal,marginBottom:3}}>Empresas por Grupo</div>
          {!empresas.length?<div style={{background:C.white,border:`2px dashed ${C.border}`,borderRadius:16,padding:60,textAlign:"center"}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="44" height="44" style={{opacity:.3,display:"block",margin:"0 auto 14px"}}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <strong style={{fontSize:14,color:C.charcoal,display:"block",marginBottom:8}}>Carregue a planilha de empresas</strong>
            <label style={{display:"inline-flex",alignItems:"center",gap:6,fontFamily:"inherit",fontSize:12,fontWeight:600,padding:"8px 16px",borderRadius:10,border:"none",background:C.green,color:C.black,cursor:"pointer"}}>
              Selecionar xlsx<input type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={e=>handleXlsx(e.target.files?.[0]??null)}/>
            </label>
          </div>:<>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:18}}>
            {[{label:"Total",val:filtEmp.length,c:C.charcoal},{label:"Sem TAG",val:filtEmp.filter(e=>e.sem_tag).length,c:C.red},{label:"DP",val:filtEmp.filter(e=>e.tags.some(t=>t.includes("DP")&&!t.includes("Dedicada"))).length,c:"#1D4ED8"},{label:"Fiscal",val:filtEmp.filter(e=>e.tags.some(t=>t.includes("Fiscal"))).length,c:"#C2410C"},{label:"Contábil",val:filtEmp.filter(e=>e.tags.some(t=>t.includes("Cont"))).length,c:"#15803D"}].map(s=><IccCard key={s.label} n={s.val.toLocaleString("pt-BR")} label={s.label} color={s.c}/>)}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <SearchInput value={empSearch} onChange={v=>{setEmpSearch(v);setEmpPage(1);}} placeholder="Buscar CNPJ, razão ou grupo..."/>
            <Sel value={tagFil} onChange={v=>{setTagFil(v);setEmpPage(1);}}>
              <option value="">Todas as TAGs</option>
              <option value="__SEM__">⚠ Sem TAG</option>
              {[...new Set(empresas.flatMap(e=>e.tags))].sort().map(t=><option key={t} value={t}>{t}</option>)}
            </Sel>
            <Sel value={viewMode} onChange={setViewMode}><option value="flat">Lista plana</option><option value="grupo">Por grupo</option></Sel>
            <div style={{flex:1}}/>
            <Btn onClick={exportEmp}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Exportar CSV</Btn>
          </div>
          {viewMode==="flat"?<>
            <TableWrap cols="140px 1fr 120px 1fr" headers={["CNPJ","Razão Social / Grupo","Regime","TAGs"]} empty={!paginate(filtEmp,empPage).slice.length}>
              {paginate(filtEmp,empPage).slice.map((e,i)=>(
                <TR key={i} cols="140px 1fr 120px 1fr">
                  <TD><span style={{fontFamily:"monospace",fontSize:"10.5px",fontWeight:600}}>{e.cnpj}</span></TD>
                  <TD><div title={e.razao} style={{fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{e.razao}</div><div style={{fontSize:10,color:C.gray50}}>{e.grupo}</div></TD>
                  <TD><span style={{fontSize:10,color:C.gray70}}>{e.regime}</span></TD>
                  <TD>{e.sem_tag?<span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:20,background:C.amberLt,color:C.amber}}>⚠ Sem TAG</span>:e.tags.map((t,ti)=><Chip key={ti} tag={t}/>)}</TD>
                </TR>
              ))}
            </TableWrap>
            <Pager page={empPage} total={filtEmp.length} onPage={p=>{setEmpPage(p);}}/>
          </>:<GruposView empresas={filtEmp} inconsistencias={inconsistencias} page={empPage} onPage={setEmpPage}/>}
          </>}
        </div>}

        {/* ── ABA: AUDITORIA ── */}
        {activeTab==="auditoria"&&<div>
          <div style={{fontSize:19,fontWeight:800,color:C.charcoal,marginBottom:3}}>Auditoria de Cobertura</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:18}}>
            <AcCard type="warn" n={String(semCoord.length)} title="TAGs sem Coordenador" sub="Vinculação pendente"/>
            <AcCard type="warn" n={semCoord.reduce((s,t)=>s+(tagCount[t]||0),0).toLocaleString("pt-BR")} title="Empresas Afetadas" sub="Com TAG sem responsável"/>
            <AcCard type="ok" n={String(comCoord.length)} title="TAGs com Coordenador" sub="Base completa"/>
            <AcCard type="amb" n={`${comCoord.length}/${Object.keys(tagCount).length}`} title="Cobertura" sub="TAGs com responsável / Total"/>
          </div>
          {!empresas.length&&<div style={{padding:24,textAlign:"center",color:C.gray50,fontSize:12}}>Carregue a planilha na aba "Empresas por Grupo" primeiro</div>}
          {empresas.length>0&&<>
            {semCoord.length>0&&<div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:16,overflow:"hidden",marginBottom:12}}>
              <div style={{padding:"10px 18px",background:C.redLt,fontSize:11,fontWeight:700,color:C.red,borderBottom:`1px solid #fca5a5`}}>⚠ TAGs sem Coordenador ({semCoord.length})</div>
              {semCoord.map(tag=>(
                <div key={tag} style={{display:"grid",gridTemplateColumns:"1fr 80px 1fr 1fr auto",padding:"10px 18px",borderBottom:`1px solid ${C.border}`,alignItems:"center",gap:12}}>
                  <div><Chip tag={tag}/></div>
                  <div style={{fontWeight:700,fontSize:12}}>{(tagCount[tag]||0)}</div>
                  <div><span style={{fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:20,background:C.amberLt,color:C.amber}}>Sem base</span></div>
                  <div style={{fontSize:11,color:C.red,fontWeight:600}}>⚠ Sem Coordenador</div>
                  <Btn sm onClick={()=>{setActiveTab("tags");setModalOpen(true);}} primary>+ Vincular Coord.</Btn>
                </div>
              ))}
            </div>}
            <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:16,overflow:"hidden"}}>
              <div style={{padding:"10px 18px",background:C.greenLt,fontSize:11,fontWeight:700,color:C.greenDark,borderBottom:`1px solid #6ee7b7`}}>✓ TAGs com Coordenador ({comCoord.length})</div>
              {comCoord.sort().map(tag=>{const b=lookupTag(tag)!;return(
                <div key={tag} style={{display:"grid",gridTemplateColumns:"1fr 80px 1fr 1fr 1fr",padding:"10px 18px",borderBottom:`1px solid ${C.border}`,alignItems:"center",gap:12}}>
                  <div><Chip tag={tag}/></div>
                  <div style={{fontWeight:700,fontSize:12}}>{(tagCount[tag]||0).toLocaleString("pt-BR")}</div>
                  <div><span style={{fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:20,background:C.greenLt,color:C.greenDark}}>OK</span></div>
                  <div style={{fontSize:11,fontWeight:600}}>{b?.coord||"—"}</div>
                  <div style={{fontSize:10,color:C.gray70}}>{b?.supers||<span style={{color:C.amber}}>Sem supervisores</span>}</div>
                </div>
              );})}
            </div>
          </>}
        </div>}

        {/* ── ABA: INCONSISTÊNCIAS ── */}
        {activeTab==="inc"&&<div>
          <div style={{fontSize:19,fontWeight:800,color:C.charcoal,marginBottom:3}}>Inconsistências de TAGs</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:18}}>
            <IccCard n={inconsistencias.length} label="Grupos com inconsistência" color={C.amber}/>
            <IccCard n={inconsistencias.filter(i=>i.issues.some(x=>x.tipo.includes("PARCIAL"))).length} label="Serviço parcial no grupo" sub="DP/Fiscal/Contábil em parte dos CNPJs" color={C.red}/>
            <IccCard n={inconsistencias.filter(i=>i.issues.some(x=>x.tipo.includes("MISTO"))).length} label="Equipes mistas" sub="CNPJs do mesmo grupo com equipes diferentes" color={C.amber}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <SearchInput value={incSearch} onChange={setIncSearch} placeholder="Buscar grupo..."/>
            <Sel value={incTipo} onChange={setIncTipo}>
              <option value="">Todos os tipos</option>
              <option value="PARCIAL">Parcial</option><option value="MISTO">Misto</option>
            </Sel>
            <div style={{flex:1}}/>
            <Btn onClick={exportInc}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Exportar Excel</Btn>
          </div>
          {!filtInc.length?<Empty msg="Nenhuma inconsistência com esses filtros"/>:
          filtInc.map((inc,i)=>{
            const key=inc.grupo;const open=openIncs.has(key);
            return <div key={i} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:12,marginBottom:8,overflow:"hidden"}}>
              <div onClick={()=>{const s=new Set(openIncs);if(s.has(key))s.delete(key);else s.add(key);setOpenIncs(s);}} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",cursor:"pointer",background:open?C.gray05:"transparent"}}>
                <span style={{fontWeight:600,fontSize:13,color:C.charcoal,flex:1}}>{inc.grupo}</span>
                <span style={{fontSize:11,color:C.gray50}}>{inc.n_cnpj} CNPJs</span>
                {inc.issues.map((is,ii)=><span key={ii} style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,background:is.tipo.includes("PARCIAL")?C.redLt:C.amberLt,color:is.tipo.includes("PARCIAL")?C.red:C.amber}}>{labelI(is.tipo)}</span>)}
                <svg style={{flexShrink:0,transform:open?"rotate(180deg)":"",transition:"transform .2s"}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
              {open&&<div style={{borderTop:`1px solid ${C.border}`,padding:"10px 16px"}}>
                {inc.issues.map((is,ii)=><div key={ii} style={{fontSize:12,color:is.tipo.includes("PARCIAL")?C.red:C.amber,marginBottom:4}}>⚠ {is.desc}</div>)}
                <div style={{marginTop:10}}>
                  <div style={{display:"grid",gridTemplateColumns:"145px 1fr 1fr",gap:8,padding:"3px 8px",fontSize:9,fontWeight:700,color:C.gray50,textTransform:"uppercase"}}><span>CNPJ</span><span>Razão Social</span><span>TAGs</span></div>
                  {inc.cnpjs.map((c,ci)=>(
                    <div key={ci} style={{display:"grid",gridTemplateColumns:"145px 1fr 1fr",gap:8,padding:"6px 8px",borderTop:`1px solid ${C.border}`,alignItems:"center",opacity:c.esperado?.55:1}}>
                      <span style={{fontFamily:"monospace",fontSize:"10.5px",fontWeight:600}}>{c.cnpj}</span>
                      <span style={{fontSize:11,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}} title={c.razao}>{c.razao}</span>
                      <div>{c.tags.length?c.tags.map((t,ti)=><Chip key={ti} tag={t}/>):<span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:20,background:C.amberLt,color:C.amber}}>⚠ Sem TAG</span>}</div>
                    </div>
                  ))}
                </div>
              </div>}
            </div>;
          })}
        </div>}

        {/* ── ABA: VÍNCULO POR GRUPO ── */}
        {activeTab==="vinculo"&&<div>
          <div style={{fontSize:19,fontWeight:800,color:C.charcoal,marginBottom:3}}>Vínculo por Grupo</div>
          <div style={{fontSize:12,color:C.gray50,marginBottom:18}}>Compare os serviços atuais (DP, Fiscal, Contábil) do grupo com a base salva para detectar mudanças.</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:18}}>
            <IccCard n={vincItems.length.toLocaleString("pt-BR")} label="Total de grupos" color={C.charcoal}/>
            <IccCard n={vincItems.filter(g=>g.divergente).length.toLocaleString("pt-BR")} label="Com divergência" sub="Mudou desde a base salva" color={C.red}/>
            <IccCard n={vincItems.filter(g=>g.temBase&&!g.divergente).length.toLocaleString("pt-BR")} label="Conferindo" color={C.greenDark}/>
            <IccCard n={vincItems.filter(g=>!g.temBase).length.toLocaleString("pt-BR")} label="Sem base cadastrada" sub={`Clique em "Gerar base"`} color={C.gray50}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <SearchInput value={vincSearch} onChange={v=>{setVincSearch(v);setVincPage(1);}} placeholder="Buscar grupo..."/>
            <Sel value={vincFiltro} onChange={v=>{setVincFiltro(v);setVincPage(1);}}>
              <option value="">Todos</option><option value="divergente">Com divergência</option><option value="ok">Conferindo</option>
              <option value="sem_base">Sem base</option><option value="parcial">Serviço parcial</option>
              <option value="geral">Serviço geral (DP+Fiscal+Contábil)</option>
              <option value="so_dp">Só DP</option><option value="so_fiscal">Só Fiscal</option><option value="so_contabil">Só Contábil</option>
            </Sel>
            <div style={{flex:1}}/>
            <Btn onClick={gerarBaseVinculo} primary>Gerar base atual</Btn>
            <Btn onClick={exportVinc}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Exportar Excel</Btn>
          </div>
          {!vincItems.length?<Empty msg={empresas.length?"Nenhum grupo encontrado":"Carregue a planilha primeiro"}/>:<>
          <TableWrap cols="1fr 90px 90px 90px 110px 140px" headers={["Grupo","DP","Fiscal","Contábil","CNPJs","Status"]} empty={!paginate(vincItems,vincPage).slice.length}>
            {paginate(vincItems,vincPage).slice.map((g,i)=>{
              const statusEl=!g.temBase?<span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:20,background:C.gray10,color:C.gray70}}>Sem base</span>:g.divergente?<span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,background:C.amberLt,color:C.amber}}>⚠ {g.divCampos.join(", ")}</span>:<span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:20,background:C.greenLt,color:C.greenDark}}>Conferindo</span>;
              const chk=(val:boolean,div:boolean)=>{
                if(div)return val?<span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,background:C.redLt,color:C.red}}>✓ Sim</span>:<span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,background:C.redLt,color:C.red}}>✗ Não</span>;
                if(val)return <span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:20,background:C.greenLt,color:C.greenDark}}>✓</span>;
                return <span style={{color:C.gray30,fontSize:13}}>—</span>;
              };
              return <TR key={i} cols="1fr 90px 90px 90px 110px 140px">
                <TD style={{fontWeight:600,fontSize:12}}>{g.grupo}</TD>
                <TD style={{textAlign:"center"}}>{chk(g.atual.dp,g.temBase&&g.base!.dp!==g.atual.dp)}</TD>
                <TD style={{textAlign:"center"}}>{chk(g.atual.fiscal,g.temBase&&g.base!.fiscal!==g.atual.fiscal)}</TD>
                <TD style={{textAlign:"center"}}>{chk(g.atual.contabil,g.temBase&&g.base!.contabil!==g.atual.contabil)}</TD>
                <TD style={{textAlign:"center",fontSize:11,color:C.gray50}}>{g.n_cnpj}</TD>
                <TD>{statusEl}</TD>
              </TR>;
            })}
          </TableWrap>
          <Pager page={vincPage} total={vincItems.length} onPage={setVincPage}/>
          </>}
        </div>}

        {/* ── ABA: BASE TAG POR EMPRESA ── */}
        {activeTab==="tagemp"&&<div>
          <div style={{fontSize:19,fontWeight:800,color:C.charcoal,marginBottom:3}}>Base de TAG por Empresa</div>
          <div style={{fontSize:12,color:C.gray50,marginBottom:18}}>Compare as TAGs de cada empresa com a base salva. Clique em "Gerar base do S3D atual" para confirmar o estado atual e registrar mudanças.</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:18}}>
            <IccCard n={tagEmpList.length.toLocaleString("pt-BR")} label="Total na comparação" color={C.charcoal}/>
            <IccCard n={tagEmpList.filter(x=>x.status==="divergente").length.toLocaleString("pt-BR")} label="TAG alterada" color={C.red}/>
            <IccCard n={tagEmpList.filter(x=>x.status==="nova").length.toLocaleString("pt-BR")} label="Empresas novas" sub="Ainda não estão na base" color={C.blue}/>
            <IccCard n={tagEmpList.filter(x=>x.status==="removida").length.toLocaleString("pt-BR")} label="Empresas removidas" sub="Não aparecem mais no S3D" color={C.amber}/>
            <IccCard n={tagEmpList.filter(x=>x.status==="ok").length.toLocaleString("pt-BR")} label="Conferindo" color={C.greenDark}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <SearchInput value={tagEmpSearch} onChange={v=>{setTagEmpSearch(v);setTagEmpPage(1);}} placeholder="Buscar CNPJ, razão ou grupo..."/>
            <Sel value={tagEmpFiltro} onChange={v=>{setTagEmpFiltro(v);setTagEmpPage(1);}}>
              <option value="">Todos</option><option value="divergente">TAG alterada</option>
              <option value="nova">Nova — incluir</option><option value="removida">Removida — excluir</option><option value="ok">Conferindo</option>
            </Sel>
            <div style={{flex:1}}/>
            <Btn onClick={gerarBaseTagEmp} primary>Gerar base do S3D atual</Btn>
            <Btn onClick={exportTagEmp}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Exportar Excel</Btn>
          </div>
          <TableWrap cols="140px 1fr 150px 150px 170px" headers={["CNPJ","Razão Social / Grupo","TAG na base","TAG atual (S3D)","Status"]} empty={!paginate(filtTagEmp,tagEmpPage).slice.length}>
            {paginate(filtTagEmp,tagEmpPage).slice.map((x,i)=>{
              const st=x.status==="nova"?<span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,background:C.blueLt,color:"#0284C7"}}>✚ Nova — incluir</span>:x.status==="removida"?<span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,background:C.amberLt,color:C.amber}}>✕ Removida — excluir</span>:x.status==="divergente"?<span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,background:C.redLt,color:C.red}}>⚠ TAG alterada</span>:<span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:20,background:C.greenLt,color:C.greenDark}}>Conferindo</span>;
              return <TR key={i} cols="140px 1fr 150px 150px 170px">
                <TD><span style={{fontFamily:"monospace",fontSize:"10.5px",fontWeight:600}}>{x.cnpj}</span></TD>
                <TD><div title={x.razao} style={{fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{x.razao||"—"}</div><div style={{fontSize:10,color:C.gray50}}>{x.grupo}</div></TD>
                <TD>{x.tagsBase.length?x.tagsBase.map((t,ti)=><Chip key={ti} tag={t}/>):<span style={{color:C.gray30,fontSize:13}}>—</span>}</TD>
                <TD>{x.tagsAtual.length?x.tagsAtual.map((t,ti)=><Chip key={ti} tag={t}/>):<span style={{color:C.gray30,fontSize:13}}>—</span>}</TD>
                <TD>{st}</TD>
              </TR>;
            })}
          </TableWrap>
          <Pager page={tagEmpPage} total={filtTagEmp.length} onPage={setTagEmpPage}/>
        </div>}

        {/* ── ABA: AUDITORIA DE MUDANÇAS ── */}
        {activeTab==="audmud"&&<div>
          <div style={{fontSize:19,fontWeight:800,color:C.charcoal,marginBottom:3}}>Auditoria de Mudanças</div>
          <div style={{fontSize:12,color:C.gray50,marginBottom:18}}>Histórico de alterações de TAG registradas ao gerar a base na aba "Base de TAG por Empresa".</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:18}}>
            <IccCard n={auditMudancas.length.toLocaleString("pt-BR")} label="Total de eventos" color={C.charcoal}/>
            <IccCard n={auditMudancas.filter(x=>x.tipo==="TAG_ALTERADA").length.toLocaleString("pt-BR")} label="TAGs alteradas" color={C.red}/>
            <IccCard n={auditMudancas.filter(x=>x.tipo==="EMPRESA_INCLUIDA").length.toLocaleString("pt-BR")} label="Empresas incluídas" color="#0284C7"/>
            <IccCard n={auditMudancas.filter(x=>x.tipo==="EMPRESA_EXCLUIDA").length.toLocaleString("pt-BR")} label="Empresas excluídas" color={C.amber}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <SearchInput value={audMudSearch} onChange={v=>{setAudMudSearch(v);setAudMudPage(1);}} placeholder="Buscar CNPJ, razão ou grupo..."/>
            <Sel value={audMudTipo} onChange={v=>{setAudMudTipo(v);setAudMudPage(1);}}>
              <option value="">Todos os eventos</option><option value="TAG_ALTERADA">TAG alterada</option>
              <option value="EMPRESA_INCLUIDA">Empresa incluída</option><option value="EMPRESA_EXCLUIDA">Empresa excluída</option>
            </Sel>
            <div style={{flex:1}}/>
            <Btn onClick={exportAudMud}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Exportar Excel</Btn>
            <Btn onClick={()=>{if(!confirm("Limpar todo o histórico de auditoria? Essa ação não pode ser desfeita."))return;setAuditMudancas([]);try{localStorage.removeItem(AUDMUD_KEY);}catch{}showToast("Histórico limpo");}} danger>Limpar histórico</Btn>
          </div>
          {!filtAudMud.length?<Empty msg={auditMudancas.length===0?"Nenhum evento registrado ainda. Eventos aparecem ao clicar em 'Gerar base do S3D atual'.":"Nenhum evento com esses filtros"}/>:<>
          <TableWrap cols="140px 140px 1fr 160px 1fr" headers={["Data/Hora","CNPJ","Razão Social / Grupo","Evento","De → Para"]} empty={false}>
            {paginate(filtAudMud,audMudPage).slice.map((x,i)=>{
              const tStyle:{bg:string;c:string}=x.tipo==="TAG_ALTERADA"?{bg:C.redLt,c:C.red}:x.tipo==="EMPRESA_INCLUIDA"?{bg:C.blueLt,c:"#0284C7"}:{bg:C.amberLt,c:C.amber};
              return <TR key={i} cols="140px 140px 1fr 160px 1fr">
                <TD style={{fontSize:"10.5px",color:C.gray50}}>{fmtData(x.ts)}</TD>
                <TD><span style={{fontFamily:"monospace",fontSize:"10.5px",fontWeight:600}}>{x.cnpj}</span></TD>
                <TD><div title={x.razao} style={{fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{x.razao||"—"}</div><div style={{fontSize:10,color:C.gray50}}>{x.grupo}</div></TD>
                <TD><span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:20,background:tStyle.bg,color:tStyle.c}}>{tipoLabel(x.tipo)}</span></TD>
                <TD style={{fontSize:11}}>{x.de} <span style={{color:C.gray30}}>→</span> {x.para}</TD>
              </TR>;
            })}
          </TableWrap>
          <Pager page={audMudPage} total={filtAudMud.length} onPage={setAudMudPage}/>
          </>}
        </div>}

        {/* ── ABA: CONSTRUÇÃO CIVIL ── */}
        {/* ── ABA: HISTÓRICO NO HUB ── */}
        {activeTab==="hist"&&<div>
          <div style={{fontSize:19,fontWeight:800,color:C.charcoal,marginBottom:3}}>Histórico de Sincronizações (Hub)</div>
          <div style={{fontSize:12,color:C.gray50,marginBottom:18}}>
            Cada vez que você clica em <strong>Gerar base do S3D atual</strong>, um snapshot é salvo no banco com o diff por empresa.
            Clique num snapshot pra ver apenas o que mudou.
          </div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:18}}>
            <IccCard n={snapshots.length} label="Snapshots no Hub" color={C.charcoal}/>
            <IccCard n={snapshots[0]?fmtData(snapshots[0].criado_em):"—"} label="Último snapshot" color={C.greenDark}/>
            <IccCard n={snapshots[0]?.total_alteradas??0} label="Alteradas (último)" color={C.red}/>
            <IccCard n={(snapshots[0]?.total_novas??0)+(snapshots[0]?.total_removidas??0)} label="Incluídas/Removidas (último)" color={C.amber}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"360px 1fr",gap:16}}>
            <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:16,overflow:"hidden",maxHeight:600,overflowY:"auto"}}>
              <div style={{padding:"10px 14px",background:C.gray05,fontSize:10,fontWeight:700,color:C.gray50,textTransform:"uppercase",letterSpacing:".5px",borderBottom:`1px solid ${C.border}`}}>Snapshots</div>
              {snapshots.length===0?<Empty msg="Nenhum snapshot ainda"/>:snapshots.map(s=>{
                const sel=snapshotAberto===s.id;
                return <div key={s.id} onClick={()=>void abrirSnapshot(s.id)} style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,cursor:"pointer",background:sel?C.greenLt:"transparent"}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.charcoal}}>{fmtData(s.criado_em)}</div>
                  <div style={{fontSize:10,color:C.gray50,marginTop:2}}>
                    {s.competencia?`Base ${String(s.competencia).slice(0,7)} · `:""}{s.total_empresas.toLocaleString("pt-BR")} empresas
                  </div>
                  <div style={{display:"flex",gap:5,marginTop:5,flexWrap:"wrap"}}>
                    {s.total_alteradas>0&&<span style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:20,background:C.redLt,color:C.red}}>{s.total_alteradas} alt</span>}
                    {s.total_novas>0&&<span style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:20,background:C.blueLt,color:"#0284C7"}}>{s.total_novas} novas</span>}
                    {s.total_removidas>0&&<span style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:20,background:C.amberLt,color:C.amber}}>{s.total_removidas} rem</span>}
                    {s.total_alteradas===0&&s.total_novas===0&&s.total_removidas===0&&<span style={{fontSize:9,fontWeight:600,padding:"2px 7px",borderRadius:20,background:C.greenLt,color:C.greenDark}}>sem mudanças</span>}
                  </div>
                </div>;
              })}
            </div>
            <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:16,overflow:"hidden"}}>
              <div style={{padding:"10px 14px",background:C.gray05,fontSize:10,fontWeight:700,color:C.gray50,textTransform:"uppercase",letterSpacing:".5px",borderBottom:`1px solid ${C.border}`}}>
                {snapshotAberto?"Diffs do snapshot":"Selecione um snapshot à esquerda"}
              </div>
              {snapshotLoading?<div style={{padding:30,textAlign:"center",fontSize:12,color:C.gray50}}>Carregando…</div>:
                !snapshotAberto?<Empty msg="Clique num snapshot pra ver os diffs"/>:
                snapshotRows.length===0?<Empty msg="Esse snapshot não teve mudanças"/>:
                <div style={{maxHeight:600,overflowY:"auto"}}>
                  {snapshotRows.map((r)=>{
                    const cor=r.status==="nova"?{bg:C.blueLt,c:"#0284C7",label:"Nova"}:r.status==="removida"?{bg:C.amberLt,c:C.amber,label:"Removida"}:{bg:C.redLt,c:C.red,label:"TAG alterada"};
                    return <div key={r.id} style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                        <span style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:20,background:cor.bg,color:cor.c}}>{cor.label}</span>
                        <span style={{fontFamily:"monospace",fontSize:11,fontWeight:600}}>{r.cnpj}</span>
                        <span style={{fontSize:11,color:C.charcoal,fontWeight:600,flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.razao||"—"}</span>
                        {r.grupo&&<span style={{fontSize:10,color:C.gray50}}>{r.grupo}</span>}
                      </div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                        {r.diff_added.map((t,i)=><span key={"a"+i} style={{fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:20,background:C.greenLt,color:C.greenDark}}>+ {t}</span>)}
                        {r.diff_removed.map((t,i)=><span key={"r"+i} style={{fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:20,background:C.redLt,color:C.red}}>− {t}</span>)}
                      </div>
                    </div>;
                  })}
                </div>}
            </div>
          </div>
        </div>}

        {activeTab==="cc"&&<div>

          <div style={{fontSize:19,fontWeight:800,color:C.charcoal,marginBottom:3}}>Construção Civil</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:18}}>
            {[{label:"Total CC",val:filtCC.length,c:C.charcoal},{label:"CC 1",val:filtCC.filter(e=>e.tags.includes("Equipe CC 1")).length,c:C.purple},{label:"CC 2",val:filtCC.filter(e=>e.tags.includes("Equipe CC 2")).length,c:C.purple},{label:"CC 4",val:filtCC.filter(e=>e.tags.includes("Equipe CC 4")).length,c:C.purple},{label:"DP 4",val:filtCC.filter(e=>e.tags.includes("Equipe DP 4")).length,c:"#1D4ED8"},{label:"Canopus",val:filtCC.filter(e=>e.tags.includes("Equipe Dedicada Canopus")).length,c:"#0F766E"}].map(s=><IccCard key={s.label} n={s.val.toLocaleString("pt-BR")} label={s.label} color={s.c}/>)}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <SearchInput value={ccSearch} onChange={v=>{setCCSearch(v);setCCPage(1);}} placeholder="Buscar CNPJ, razão ou grupo..."/>
            <Sel value={ccTagFil} onChange={v=>{setCCTagFil(v);setCCPage(1);}}>
              <option value="">Todas as TAGs CC</option>
              {CC_TAGS.map(t=><option key={t} value={t}>{t}</option>)}
            </Sel>
            <div style={{flex:1}}/>
            <Btn onClick={exportCC}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Exportar CSV</Btn>
          </div>
          <TableWrap cols="140px 1fr 120px 1fr" headers={["CNPJ","Razão Social / Grupo","Regime","TAGs"]} empty={!paginate(filtCC,ccPage,50).slice.length}>
            {paginate(filtCC,ccPage,50).slice.map((e,i)=>(
              <TR key={i} cols="140px 1fr 120px 1fr">
                <TD><span style={{fontFamily:"monospace",fontSize:"10.5px",fontWeight:600}}>{e.cnpj}</span></TD>
                <TD><div title={e.razao} style={{fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{e.razao}</div><div style={{fontSize:10,color:C.gray50}}>{e.grupo}</div></TD>
                <TD><span style={{fontSize:10,color:C.gray70}}>{e.regime}</span></TD>
                <TD>{e.tags.map((t,ti)=><Chip key={ti} tag={t}/>)}</TD>
              </TR>
            ))}
          </TableWrap>
          <Pager page={ccPage} total={filtCC.length} onPage={setCCPage} per={50}/>
        </div>}

      </div>

      {/* MODAL */}
      <ModalTag open={modalOpen} editTag={editTag} onClose={()=>{setModalOpen(false);setEditTag(null);}} onSave={handleSaveTag}/>

      {/* TOAST */}
      <div style={{position:"fixed",bottom:22,right:22,background:C.charcoal,color:"#fff",padding:"11px 16px",borderRadius:10,fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:7,zIndex:999,transition:"all .3s ease",transform:toast.show?"translateY(0)":"translateY(80px)",opacity:toast.show?1:0,pointerEvents:"none"}}>
        <svg viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" width="13" height="13"><polyline points="20 6 9 17 4 12"/></svg>
        {toast.msg}
      </div>
    </div>
  );
}

// ─── GRUPOS VIEW ─────────────────────────────────────────────────────────────

function GruposView({empresas,inconsistencias,page,onPage}:{empresas:Empresa[];inconsistencias:Inconsistencia[];page:number;onPage:(p:number)=>void}) {
  const [openGrupos,setOpenGrupos]=useState<Set<string>>(new Set());
  const byG:Record<string,Empresa[]>={};
  empresas.forEach(e=>{const g=e.grupo||"(Sem grupo)";if(!byG[g])byG[g]=[];byG[g].push(e);});
  const keys=Object.keys(byG).sort();
  const {slice,total}={slice:keys.slice((page-1)*PER,page*PER),total:keys.length};
  const incMap:Record<string,Inconsistencia>={};inconsistencias.forEach(i=>{incMap[i.grupo]=i;});
  const C2={border:"#E2E2E2",gray05:"#F2F2F2",gray50:"#646464",charcoal:"#1A1A1A",gray30:"#CDCDCD",red:"#DC2626",redLt:"#FEE2E2",amber:"#FA6914",amberLt:"#FFF3E0",ink:"#2C2C2C"};
  return <>
    <div style={{background:"#fff",border:`1px solid ${C2.border}`,borderRadius:16,overflow:"hidden"}}>
      {!slice.length?<Empty/>:slice.map(g=>{
        const emps=byG[g];const inc=incMap[g];const open=openGrupos.has(g);
        return <div key={g}>
          <div onClick={()=>{const s=new Set(openGrupos);if(s.has(g))s.delete(g);else s.add(g);setOpenGrupos(s);}} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",cursor:"pointer",borderBottom:`1px solid ${C2.border}`,background:open?C2.gray05:"transparent"}}>
            <svg viewBox="0 0 24 24" fill="none" stroke={C2.gray30} strokeWidth="2" width="12" height="12" style={{flexShrink:0}}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
            <span style={{fontWeight:600,fontSize:12,color:C2.charcoal,flex:1}}>{g}</span>
            <span style={{fontSize:11,color:C2.gray50}}>{emps.length} CNPJ{emps.length>1?"s":""}</span>
            {inc&&inc.issues.map((is,ii)=><span key={ii} style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,background:is.tipo.includes("PARCIAL")?C2.redLt:C2.amberLt,color:is.tipo.includes("PARCIAL")?C2.red:C2.amber,whiteSpace:"nowrap"}}>{is.tipo.includes("PARCIAL")?"Parcial":"Misto"}</span>)}
            <svg style={{flexShrink:0,transform:open?"rotate(180deg)":"",transition:"transform .2s"}} viewBox="0 0 24 24" fill="none" stroke={C2.gray30} strokeWidth="2" width="12" height="12"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          {open&&emps.map((e,ei)=>(
            <div key={ei} style={{display:"grid",gridTemplateColumns:"30px 140px 1fr 110px 1fr",padding:"0 16px",borderBottom:`1px solid ${C2.border}`,alignItems:"center",minHeight:42,background:"rgba(0,0,0,.01)"}}>
              <div style={{color:C2.gray30,fontSize:10}}>↳</div>
              <div><span style={{fontFamily:"monospace",fontSize:"10.5px",fontWeight:600}}>{e.cnpj}</span></div>
              <div title={e.razao} style={{fontWeight:500,fontSize:11,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",color:C2.ink}}>{e.razao}</div>
              <div style={{fontSize:10,color:C2.gray50}}>{e.regime}</div>
              <div>{e.sem_tag?<span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:20,background:C2.amberLt,color:C2.amber}}>⚠ Sem TAG</span>:e.tags.map((t,ti)=><Chip key={ti} tag={t}/>)}</div>
            </div>
          ))}
        </div>;
      })}
    </div>
    <Pager page={page} total={total} onPage={onPage}/>
  </>;
}
