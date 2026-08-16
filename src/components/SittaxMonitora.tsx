// AgilizzaCadastral.tsx
// Cole em src/components/AgilizzaCadastral.tsx
// Dependência: npm install xlsx
// Requer: supabase em src/integrations/supabase/client.ts

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { getEmpresaBaseResumo, listEmpresasAtivas } from "@/lib/empresas-mensal";
import { sharedGetValue, sharedSetValue } from "@/lib/import-processos";

// ─── TIPOS ───────────────────────────────────────────────────────────────────

interface S3DEntry { cnpj: string; razao: string; regime: string; tags: string[]; is_cc: boolean; is_fiscal: boolean; has_dp: boolean; has_cont: boolean; has_fisc: boolean; fed_status: string; grupo: string; }
interface CPFEntry { cpf: string; razao: string; regime: string; grupo: string; tags: string[]; is_cc: boolean; }
interface AGEntry { cnpj: string; razao: string; equipe: string; usa_proc: boolean; cert_raw: string; cert_nome: string; val_fed: Date|null; dias_fed: number|null; status_cert: string; }
interface CruzItem extends S3DEntry { no_ag: boolean; }
interface CertGroup { nome: string; tipo: string; val: Date|null; dias: number|null; status: string; empresas: (AGEntry & { grupo: string })[]; }
interface ExtraItem extends AGEntry { grupo: string; }
interface CCItem { doc: string; docNorm: string; razao: string; tags: string[]; no_ag: boolean; tipo: string; }
interface OutroItem extends S3DEntry { no_ag: boolean; }

type TabId = "upload"|"cruzamento"|"cert"|"cpf"|"extra"|"cc"|"outros";

// ─── CONSTANTES ──────────────────────────────────────────────────────────────

const CC_TAGS_SET: Record<string,number> = {"Equipe DP 4":1,"Equipe CC 1":1,"Equipe CC 2":1,"Equipe CC 4":1,"Equipe Dedicada Canopus":1};
const PER = 50;
const C = { green:"#0AE18C",greenDark:"#00BF63",greenLt:"#EAFBF4",black:"#0C0C0C",charcoal:"#1A1A1A",ink:"#2C2C2C",gray70:"#4A4A4A",gray50:"#646464",gray30:"#CDCDCD",gray10:"#E8E8E8",gray05:"#F2F2F2",offWhite:"#FAFAFA",white:"#FFFFFF",border:"#E2E2E2",red:"#DC2626",redLt:"#FEE2E2",amber:"#FA6914",amberLt:"#FFF3E0",blue:"#14C8FA",blueLt:"#DDF6FF",purple:"#7C3AED",purpleLt:"#F5F3FF" };

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function normCNPJ(s: unknown) { return String(s||"").replace(/\D/g,"").padStart(14,"0"); }
function isCNPJValido(cnpj: string) { return cnpj.length===14&&!/^(\d)\1+$/.test(cnpj); }
function isCPF(raw: unknown) { return String(raw||"").replace(/\D/g,"").length===11; }
function isEquipeFiscal(tags: string[]) { return tags.some(t=>/^Equipe Fiscal\s*\d+$/i.test(t.trim())); }
function parseDate(v: unknown): Date|null { if(!v)return null; const s=String(v).trim(); const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if(m)return new Date(+m[3],+m[2]-1,+m[1]); const m2=s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m2)return new Date(+m2[1],+m2[2]-1,+m2[3]); return null; }
const HOJE = new Date();
function diffDias(d: Date|null): number|null { if(!d)return null; return Math.round((d.getTime()-HOJE.getTime())/864e5); }
function fmtDate(d: Date|null): string { if(!d)return"—"; return String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+d.getFullYear(); }
function statusCert(dias: number|null): string { if(dias===null)return"sem"; if(dias<0)return"vencido"; if(dias<=30)return"d30"; if(dias<=90)return"d90"; return"ok"; }
function paginate<T>(data: T[], page: number) { const start=(page-1)*PER; return{slice:data.slice(start,start+PER),total:data.length}; }
function exportCSV(rows: unknown[][], name: string) { const csv=rows.map(r=>r.map(v=>`"${String(v||"").replace(/"/g,'""')}"`).join(",")).join("\n"); const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8;"}); const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();document.body.removeChild(a); }

// ─── SUPABASE ────────────────────────────────────────────────────────────────

interface DadosProcessados {
  cruz: CruzItem[];
  certs: CertGroup[];
  cpfs: {cpf:string;razao:string;regime:string;grupo:string;tags:string[];no_ag:boolean}[];
  extra: ExtraItem[];
  cc: CCItem[];
  outros: OutroItem[];
  s3dName: string;
  agName: string;
  uploadedAt: string;
}

async function must<T extends { error: unknown }>(op: PromiseLike<T>): Promise<T> {
  const result = await op;
  if (result.error) throw result.error;
  return result;
}

async function salvarSupabase(dados: DadosProcessados, sessionId: string) {
  // 1. Limpa sessão anterior
  const{data:sessoes}=await supabase.from("agilizza_sessao").select("session_id");
  if(sessoes&&sessoes.length>0){
    const ids=sessoes.map((s:Record<string,string>)=>s.session_id).filter((id:string)=>id!==sessionId);
    if(ids.length>0){
      for(const t of["agilizza_cruzamento","agilizza_certificados","agilizza_cpfs","agilizza_extra"]){
        await must(supabase.from(t as never).delete().in("session_id",ids));
      }
      await must(supabase.from("agilizza_sessao").delete().in("session_id",ids));
    }
  }
  // 2. Sessão
  await must(supabase.from("agilizza_sessao").insert({session_id:sessionId,file_s3d:dados.s3dName,file_ag:dados.agName,total_s3d:dados.cruz.length,total_ag:dados.extra.length,uploaded_at:new Date().toISOString()} as never));
  // 3. Cruzamento em chunks
  const CHUNK=200;
  for(let i=0;i<dados.cruz.length;i+=CHUNK){
    await must(supabase.from("agilizza_cruzamento").insert(dados.cruz.slice(i,i+CHUNK).map(e=>({session_id:sessionId,cnpj:e.cnpj,razao:e.razao,regime:e.regime,grupo:e.grupo,tags:e.tags,fed_status:e.fed_status})) as never));
  }
  // 4. Certificados
  for(let i=0;i<dados.certs.length;i+=CHUNK){
    await must(supabase.from("agilizza_certificados").insert((dados.certs.slice(i,i+CHUNK).map(c=>({session_id:sessionId,cert_nome:c.nome,cert_tipo:c.tipo,val_fed:c.val?fmtDate(c.val):null,dias_fed:c.dias,status_cert:c.status,empresas:c.empresas as unknown as object}))) as never));
  }
  // 5. CPFs
  for(let i=0;i<dados.cpfs.length;i+=CHUNK){
    await must(supabase.from("agilizza_cpfs").insert(dados.cpfs.slice(i,i+CHUNK).map(e=>({session_id:sessionId,cpf:e.cpf,razao:e.razao,regime:e.regime,grupo:e.grupo,tags:e.tags,no_ag:e.no_ag})) as never));
  }
  // 6. Extra
  for(let i=0;i<dados.extra.length;i+=CHUNK){
    await must(supabase.from("agilizza_extra").insert(dados.extra.slice(i,i+CHUNK).map(e=>({session_id:sessionId,cnpj:e.cnpj,razao:e.razao,equipe:e.equipe,cert_nome:e.cert_nome,cert_raw:e.cert_raw})) as never));
  }
}

async function carregarSupabase(): Promise<DadosProcessados|null> {
  const{data:sessao}=await supabase.from("agilizza_sessao").select("*").order("uploaded_at",{ascending:false}).limit(1).single();
  if(!sessao)return null;
  const sid=sessao.session_id;
  const[{data:cruz},{data:certs},{data:cpfs},{data:extra}]=await Promise.all([
    supabase.from("agilizza_cruzamento").select("*").eq("session_id",sid),
    supabase.from("agilizza_certificados").select("*").eq("session_id",sid).order("dias_fed",{ascending:true,nullsFirst:false}),
    supabase.from("agilizza_cpfs").select("*").eq("session_id",sid),
    supabase.from("agilizza_extra").select("*").eq("session_id",sid),
  ]);
  return {
    cruz: (cruz||[]).map((r:Record<string,unknown>)=>({cnpj:String(r.cnpj||""),razao:String(r.razao||""),regime:String(r.regime||""),grupo:String(r.grupo||""),tags:Array.isArray(r.tags)?r.tags as string[]:[],is_cc:false,is_fiscal:true,has_dp:false,has_cont:false,has_fisc:true,fed_status:String(r.fed_status||""),no_ag:false})),
    certs: (certs||[]).map((r:Record<string,unknown>)=>({nome:String(r.cert_nome||"(Sem certificado)"),tipo:String(r.cert_tipo||"sem"),val:r.val_fed?parseDate(r.val_fed):null,dias:r.dias_fed!=null?Number(r.dias_fed):null,status:String(r.status_cert||"sem"),empresas:((r.empresas as unknown) as (AGEntry & {grupo:string})[])||[]})),
    cpfs: (cpfs||[]).map((r:Record<string,unknown>)=>({cpf:String(r.cpf||""),razao:String(r.razao||""),regime:String(r.regime||""),grupo:String(r.grupo||""),tags:Array.isArray(r.tags)?r.tags as string[]:[],no_ag:Boolean(r.no_ag)})),
    extra: (extra||[]).map((r:Record<string,unknown>)=>({cnpj:String(r.cnpj||""),razao:String(r.razao||""),equipe:String(r.equipe||""),cert_nome:String(r.cert_nome||""),cert_raw:String(r.cert_raw||""),grupo:"",usa_proc:false,val_fed:null,dias_fed:null,status_cert:"sem"})),
    cc:[],outros:[],
    s3dName:String(sessao.file_s3d||""),agName:String(sessao.file_ag||""),uploadedAt:String(sessao.uploaded_at||""),
  };
}

// Reconstrói o mapa do Agilizza a partir dos dados já salvos no banco
// (permite reprocessar só com a planilha do Acessórias/S3D)
function agFromDados(d:DadosProcessados):Record<string,AGEntry>{
  const out:Record<string,AGEntry>={};
  const add=(e:AGEntry|undefined|null)=>{if(!e)return;const k=normCNPJ(e.cnpj);if(!isCNPJValido(k))return;if(!out[k])out[k]=e;};
  (d.certs||[]).forEach(c=>{(c.empresas||[]).forEach(e=>{const dias=c.val?diffDias(c.val):(c.dias??null);add({...e,val_fed:c.val??null,dias_fed:dias,status_cert:e.cert_raw?statusCert(dias):"sem"});});});
  (d.extra||[]).forEach(e=>add(e as AGEntry));
  return out;
}


// ─── UI COMPONENTS ───────────────────────────────────────────────────────────

function StatCard({type,title,sub,value}:{type:"warn"|"ok"|"amb"|"all"|"info";title:string;sub:string;value:number}) {
  const s={warn:{b:"#fca5a5",bg:C.redLt,ic:C.red,n:C.red},ok:{b:"#6ee7b7",bg:C.greenLt,ic:C.greenDark,n:C.greenDark},amb:{b:"#fed7aa",bg:C.amberLt,ic:C.amber,n:C.amber},all:{b:C.border,bg:C.gray05,ic:C.gray50,n:C.charcoal},info:{b:"#a5d8ff",bg:C.blueLt,ic:"#0284C7",n:"#0284C7"}}[type];
  return(<div style={{background:C.white,border:`1px solid ${s.b}`,borderRadius:16,overflow:"hidden",minWidth:140,flex:1}}>
    <div style={{padding:"10px 13px 8px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:8}}>
      <div style={{width:26,height:26,borderRadius:6,background:s.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <svg viewBox="0 0 24 24" fill="none" stroke={s.ic} strokeWidth="2" width="12" height="12"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </div>
      <div><div style={{fontSize:11,fontWeight:700,color:C.charcoal}}>{title}</div><div style={{fontSize:10,color:C.gray50}}>{sub}</div></div>
    </div>
    <div style={{fontSize:20,fontWeight:800,padding:"9px 13px",color:s.n}}>{Number(value||0).toLocaleString("pt-BR")}</div>
  </div>);
}
function Chip({type,children}:{type:"r"|"ok"|"a"|"b"|"gr"|"p";children:React.ReactNode}){const s={r:{bg:C.redLt,c:C.red},ok:{bg:C.greenLt,c:C.greenDark},a:{bg:C.amberLt,c:C.amber},b:{bg:C.blueLt,c:"#0284C7"},gr:{bg:C.gray10,c:C.gray70},p:{bg:C.purpleLt,c:C.purple}}[type];return<span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:20,whiteSpace:"nowrap",background:s.bg,color:s.c,display:"inline-block"}}>{children}</span>;}
function DiasBadge({dias}:{dias:number|null}){if(dias===null)return<span style={{color:C.gray30,fontSize:10}}>—</span>;const st=statusCert(dias);const s=st==="vencido"?{bg:C.redLt,c:C.red,label:`Vencido há ${Math.abs(dias)}d`}:st==="d30"?{bg:C.redLt,c:C.red,label:`${dias}d`}:st==="d90"?{bg:C.amberLt,c:C.amber,label:`${dias}d`}:{bg:C.greenLt,c:C.greenDark,label:`${dias}d`};return<span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:12,background:s.bg,color:s.c}}>{s.label}</span>;}
function Pager({page,total,onPage}:{page:number;total:number;onPage:(p:number)=>void}){const pages=Math.ceil(total/PER);if(!total)return null;const s=(page-1)*PER+1,e=Math.min(page*PER,total);const btns:number[]=[];for(let p=Math.max(1,page-3);p<=Math.min(pages,page+3);p++)btns.push(p);return(<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderTop:`1px solid ${C.border}`,background:C.gray05}}><span style={{fontSize:11,color:C.gray50}}>{s.toLocaleString("pt-BR")}–{e.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")}</span><div style={{display:"flex",gap:3}}>{[{l:"‹",p:page-1,d:page<=1},...btns.map(p=>({l:String(p),p,d:false,a:p===page})),{l:"›",p:page+1,d:page>=pages}].map((b,i)=><button key={i} disabled={b.d} onClick={()=>!b.d&&onPage(b.p)} style={{fontFamily:"inherit",fontSize:11,fontWeight:600,padding:"4px 9px",borderRadius:6,border:`1px solid ${C.border}`,background:(b as{a?:boolean}).a?C.charcoal:C.white,color:(b as{a?:boolean}).a?"#fff":C.gray70,cursor:b.d?"default":"pointer",opacity:b.d?.35:1}}>{b.l}</button>)}</div></div>);}
function Empty(){return<div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"44px 22px",gap:9,color:C.gray50}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="36" height="36" style={{opacity:.3}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><strong style={{fontSize:13,color:C.charcoal}}>Nenhum resultado</strong></div>;}
function TableWrap({cols,headers,children,empty}:{cols:string;headers:string[];children:React.ReactNode;empty:boolean}){return(<div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:16,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}><div style={{display:"grid",gridTemplateColumns:cols,padding:"0 14px",background:C.gray05,borderBottom:`1px solid ${C.border}`}}>{headers.map(h=><div key={h} style={{padding:"9px 7px",fontSize:10,fontWeight:700,color:C.gray50,textTransform:"uppercase",letterSpacing:".5px"}}>{h}</div>)}</div><div>{empty?<Empty/>:children}</div></div>);}
function TR({cols,children}:{cols:string;children:React.ReactNode}){return<div style={{display:"grid",gridTemplateColumns:cols,padding:"0 14px",borderBottom:`1px solid ${C.border}`,alignItems:"center"}}>{children}</div>;}
function TD({children,style}:{children:React.ReactNode;style?:React.CSSProperties}){return<div style={{padding:"8px 7px",fontSize:11,color:C.ink,minWidth:0,...style}}>{children}</div>;}
function TagChips({tags}:{tags:string[]}){if(!tags.length)return<span style={{color:C.gray30}}>—</span>;return<>{tags.map((t,i)=><span key={i} style={{fontSize:9,fontWeight:600,padding:"2px 6px",borderRadius:12,background:C.purpleLt,color:C.purple,margin:1,display:"inline-block"}}>{t.replace("Equipe ","")}</span>)}</>;}
function SI({value,onChange,placeholder}:{value:string;onChange:(v:string)=>void;placeholder:string}){return(<div style={{position:"relative",flex:1,minWidth:180,maxWidth:340}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13" style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",opacity:.4,pointerEvents:"none"}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{width:"100%",fontFamily:"inherit",fontSize:12,padding:"8px 10px 8px 32px",border:`1px solid ${C.border}`,borderRadius:10,background:C.white,color:C.ink,outline:"none"}}/></div>);}
function Sel({value,onChange,children}:{value:string;onChange:(v:string)=>void;children:React.ReactNode}){return<select value={value} onChange={e=>onChange(e.target.value)} style={{fontFamily:"inherit",fontSize:12,padding:"7px 10px",border:`1px solid ${C.border}`,borderRadius:10,background:C.white,color:C.ink,outline:"none",cursor:"pointer"}}>{children}</select>;}
function BtnEx({onClick,label}:{onClick:()=>void;label?:string}){return(<button onClick={onClick} style={{display:"inline-flex",alignItems:"center",gap:5,fontFamily:"inherit",fontSize:11,fontWeight:600,padding:"7px 13px",borderRadius:10,border:`1px solid ${C.border}`,background:C.white,color:C.gray70,cursor:"pointer",whiteSpace:"nowrap"}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>{label||"Exportar CSV"}</button>);}

// ─── PROCESSAMENTO ───────────────────────────────────────────────────────────

function parseS3D(rawS3D:unknown[][]): { s3d:Record<string,S3DEntry>; cpfs:Record<string,CPFEntry>; } {
  const hdrS=(rawS3D[0] as string[]).map(h=>String(h||"").trim());
  const ci=(n:string)=>hdrS.indexOf(n);
  let cGrupo=ci("Grupo de Empresas");if(cGrupo<0)cGrupo=ci("Grupo");if(cGrupo<0){for(let gi=0;gi<hdrS.length;gi++){if(hdrS[gi].toLowerCase().includes("grupo")){cGrupo=gi;break;}}}
  const cCNPJ=ci("CNPJ"),cRazao=ci("Razão social"),cRegime=ci("Regime"),cTags=ci("Tags");
  const newS3D:Record<string,S3DEntry>={};const newCPFS:Record<string,CPFEntry>={};
  for(let i=1;i<rawS3D.length;i++){
    const row=rawS3D[i] as unknown[];const rawDoc=row[cCNPJ];
    const tags_raw=String(row[cTags]||"").trim();
    const tags=tags_raw?tags_raw.split(",").map(t=>t.trim()).filter(t=>t&&t!=="CX"&&!t.includes("Teste")):[];
    if(isCPF(rawDoc)){const cpfNorm=String(rawDoc||"").replace(/\D/g,"");newCPFS[cpfNorm]={cpf:String(rawDoc||"").trim(),razao:String(row[cRazao]||"").trim().substring(0,70),regime:String(row[cRegime]||"").trim(),grupo:cGrupo>=0?String(row[cGrupo]||"").trim():"",tags,is_cc:tags.some(t=>CC_TAGS_SET[t])};continue;}
    const cnpj=normCNPJ(rawDoc);if(!isCNPJValido(cnpj))continue;
    const is_cc=tags.some(t=>CC_TAGS_SET[t]);const has_dp=tags.some(t=>t.includes("DP")&&!CC_TAGS_SET[t]);const has_cont=tags.some(t=>t.includes("Cont"));const has_fisc=tags.some(t=>t.includes("Fiscal"));const is_fiscal=isEquipeFiscal(tags);
    const fed_status=is_cc?"cc":((has_dp||has_cont)?"acomp":(has_fisc?"sem_acomp":"sem_tag"));
    newS3D[cnpj]={cnpj:String(rawDoc||"").trim(),razao:String(row[cRazao]||"").trim().substring(0,70),regime:String(row[cRegime]||"").trim(),tags,is_cc,is_fiscal,has_dp,has_cont,has_fisc,fed_status,grupo:cGrupo>=0?String(row[cGrupo]||"").trim():""};
  }
  return{s3d:newS3D,cpfs:newCPFS};
}

function parseAG(rawAG:unknown[][]): Record<string,AGEntry> {
  let hdrIdx=-1;for(let i=0;i<rawAG.length;i++){if((rawAG[i] as string[])[0]==="Razão Social"){hdrIdx=i;break;}}
  if(hdrIdx<0)throw new Error("Header 'Razão Social' não encontrado na planilha do Agilizza");
  const hdr=rawAG[hdrIdx] as string[];
  const cj=(n:string)=>{for(let j=0;j<hdr.length;j++)if(hdr[j]===n)return j;return -1;};
  const cCNPJa=cj("CNPJ"),cRazaoa=cj("Razão Social"),cProc=cj("Utilizar como procuração?"),cCert=cj("Certificado Digital"),cVal=cj("Validade Certificado Digital"),cEquipe=cj("Grupos");
  const newAG:Record<string,AGEntry>={};
  for(let i=hdrIdx+1;i<rawAG.length;i++){
    const row=rawAG[i] as unknown[];const cnpj=normCNPJ(row[cCNPJa]);if(!isCNPJValido(cnpj))continue;
    const cert_raw=String(row[cCert]||"").trim();const val=parseDate(row[cVal]);const dias=val?diffDias(val):null;
    newAG[cnpj]={cnpj:String(row[cCNPJa]||"").trim(),razao:String(row[cRazaoa]||"").trim().substring(0,70),equipe:String(row[cEquipe]||"").trim(),usa_proc:String(row[cProc]||"").trim()==="Sim",cert_raw,cert_nome:cert_raw?cert_raw.split(":")[0].trim():"",val_fed:val,dias_fed:dias,status_cert:cert_raw?statusCert(dias):"sem"};
  }
  return newAG;
}

// ── Cache do Agilizza (permite reprocessar só com a atualização do Acessórias) ──
const AG_CACHE_KEY="agilizza_ag_cache";
type AgCache={name:string;at:string;ag:Record<string,Omit<AGEntry,"val_fed">&{val_fed:string|null}>};
function serializeAG(name:string,ag:Record<string,AGEntry>):AgCache{
  const out:AgCache["ag"]={};
  Object.entries(ag).forEach(([k,v])=>{out[k]={...v,val_fed:v.val_fed?v.val_fed.toISOString():null};});
  return{name,at:new Date().toISOString(),ag:out};
}
function reviveAG(c:AgCache):Record<string,AGEntry>{
  const out:Record<string,AGEntry>={};
  Object.entries(c.ag||{}).forEach(([k,v])=>{const val=v.val_fed?new Date(v.val_fed):null;const dias=val?diffDias(val):null;out[k]={...v,val_fed:val,dias_fed:dias,status_cert:v.cert_raw?statusCert(dias):"sem"};});
  return out;
}

function calcDados(s3d:Record<string,S3DEntry>,ag:Record<string,AGEntry>,cpfs:Record<string,CPFEntry>): Omit<DadosProcessados,"s3dName"|"agName"|"uploadedAt"> {
  const agCNPJs=new Set(Object.keys(ag));const s3dCNPJs=new Set(Object.keys(s3d));
  // Cruzamento
  const cruz:CruzItem[]=[];
  Object.keys(s3d).forEach(cnpj=>{const e=s3d[cnpj];if(!e.is_fiscal||e.fed_status==="cc")return;if(!agCNPJs.has(cnpj))cruz.push({...e,no_ag:false});});
  cruz.sort((a,b)=>({"acomp":0,"sem_acomp":1,"sem_tag":2}[a.fed_status]||9)-({acomp:0,sem_acomp:1,sem_tag:2}[b.fed_status]||9));
  // Certificados
  const certMap:Record<string,CertGroup>={};
  Object.keys(ag).forEach(cnpj=>{const e=ag[cnpj];const s3dInfo=s3d[cnpj];if(s3dInfo&&!s3dInfo.is_fiscal)return;const grupo=s3dInfo?.grupo||"";const key=e.cert_raw?e.cert_nome:"__SEM__";if(!certMap[key])certMap[key]={nome:e.cert_raw?e.cert_nome:"(Sem certificado / pendência)",tipo:e.cert_raw?(e.usa_proc?"procuracao":"certificado"):"sem",val:e.val_fed,dias:e.dias_fed,status:e.status_cert,empresas:[]};certMap[key].empresas.push({...e,grupo});});
  const certs=Object.values(certMap).sort((a,b)=>{const da=a.dias!==null?a.dias:99999,db=b.dias!==null?b.dias:99999;return da-db;});
  // CPFs Fiscal
  const cpfsFiscal=Object.keys(cpfs).filter(cpf=>!cpfs[cpf].is_cc&&isEquipeFiscal(cpfs[cpf].tags)).map(cpf=>({...cpfs[cpf],no_ag:agCNPJs.has(cpf)}));
  // Extra
  const extra:ExtraItem[]=Object.keys(ag).filter(cnpj=>!s3dCNPJs.has(cnpj)).map(cnpj=>({...ag[cnpj],grupo:s3d[cnpj]?.grupo||""}));
  // CC
  const cc:CCItem[]=[];
  Object.keys(s3d).forEach(cnpj=>{const e=s3d[cnpj];if(!e.is_cc)return;cc.push({doc:e.cnpj,docNorm:cnpj,razao:e.razao,tags:e.tags,no_ag:agCNPJs.has(cnpj),tipo:"cnpj"});});
  Object.keys(cpfs).forEach(cpf=>{const e=cpfs[cpf];if(!e.is_cc)return;cc.push({doc:e.cpf,docNorm:cpf,razao:e.razao,tags:e.tags,no_ag:agCNPJs.has(cpf),tipo:"cpf"});});
  // Outros
  const outros:OutroItem[]=Object.keys(s3d).filter(cnpj=>!s3d[cnpj].is_fiscal).map(cnpj=>({...s3d[cnpj],no_ag:agCNPJs.has(cnpj)}));
  return{cruz,certs,cpfs:cpfsFiscal,extra,cc,outros};
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function SittaxMonitora() {
  const [dados, setDados] = useState<DadosProcessados|null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("upload");
  const [rawS3D, setRawS3D] = useState<unknown[][]|null>(null);
  const [rawAG, setRawAG] = useState<unknown[][]|null>(null);
  const [s3dName, setS3DName] = useState("");
  const [agName, setAgName] = useState("");
  const [processando, setProcessando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [ultimoUpload, setUltimoUpload] = useState<{s3d:string;ag:string;at:string}|null>(null);
  const [toast, setToast] = useState({msg:"",show:false});
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [expandedCerts, setExpandedCerts] = useState<Set<string>>(new Set());
  const [pendingReprocess, setPendingReprocess] = useState(false);
  const [agCache, setAgCache] = useState<AgCache|null>(null);

  // Pages
  const [pages, setPages] = useState<Record<string,number>>({cruzamento:1,cert:1,cpf:1,extra:1,cc:1,outros:1});
  const sp=(t:string,p:number)=>setPages(prev=>({...prev,[t]:p}));

  // Filters
  const [searchCruz,setSearchCruz]=useState(""); const [filtCruz,setFiltCruz]=useState("all");
  const [searchCert,setSearchCert]=useState(""); const [filtCert,setFiltCert]=useState("all");
  const [searchCPF,setSearchCPF]=useState(""); const [filtCPF,setFiltCPF]=useState("all");
  const [searchExtra,setSearchExtra]=useState("");
  const [searchCC,setSearchCC]=useState(""); const [filtCC,setFiltCC]=useState("all");
  const [searchOutros,setSearchOutros]=useState(""); const [filtOutros,setFiltOutros]=useState("all");

  const showToast=useCallback((msg:string)=>{setToast({msg,show:true});clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(t=>({...t,show:false})),3000);},[]);

  // ── CARREGA DO SUPABASE ──
  useEffect(()=>{(async()=>{setCarregando(true);try{const[res,cache]=await Promise.all([carregarSupabase(),sharedGetValue<AgCache>(AG_CACHE_KEY)]);if(cache?.ag)setAgCache(cache);if(res){setDados(res);setUltimoUpload({s3d:res.s3dName,ag:res.agName,at:res.uploadedAt});setActiveTab("cruzamento");}}catch(e){console.error(e);}setCarregando(false);})();},[]);

  // ── FILE HANDLERS ──
  const handleS3D=useCallback((file:File|null)=>{if(!file)return;showToast("Lendo S3D...");const r=new FileReader();r.onload=(ev)=>{try{const wb=XLSX.read(ev.target?.result,{type:"binary"});const raw=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:""}) as unknown[][];setRawS3D(raw);setS3DName(file.name);showToast(`S3D carregado! (${raw.length-1} linhas)`);}catch(ex:unknown){showToast("Erro: "+(ex instanceof Error?ex.message:String(ex)));}};r.readAsBinaryString(file);},[showToast]);
  const handleAG=useCallback((file:File|null)=>{if(!file)return;showToast("Lendo Agilizza...");const r=new FileReader();r.onload=(ev)=>{try{const wb=XLSX.read(ev.target?.result,{type:"binary",cellDates:true});const raw=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:"",raw:false}) as unknown[][];setRawAG(raw);setAgName(file.name);showToast("Agilizza carregado!");}catch(ex:unknown){showToast("Erro: "+(ex instanceof Error?ex.message:String(ex)));}};r.readAsBinaryString(file);},[showToast]);
  const carregarS3DdaBase=useCallback(async()=>{
    showToast("Carregando S3D da Base Empresas ativa...");
    try{
      const resumo=await getEmpresaBaseResumo();
      if(!resumo.importacao){showToast("Nenhuma Base Empresas ativa. Importe em /base-empresas");return;}
      const linhas=await listEmpresasAtivas();
      if(!linhas.length){showToast("Base ativa está vazia");return;}
      const headerSet=new Set<string>();
      linhas.forEach(l=>{Object.keys((l.dados||{}) as Record<string,unknown>).forEach(k=>headerSet.add(k));});
      const headers=Array.from(headerSet);
      const matrix:unknown[][]=[headers];
      linhas.forEach(l=>{const row=(l.dados||{}) as Record<string,unknown>;matrix.push(headers.map(h=>row[h]??""));});
      setRawS3D(matrix);
      setS3DName(`Base Empresas ${String(resumo.competencia||"").slice(0,7)} · ${linhas.length} empresas`);
      if(rawAG||agCache||dados){setPendingReprocess(true);showToast(`S3D atualizado (${linhas.length}). Reprocessando…`);}
      else{showToast(`S3D montado (${linhas.length}). Envie o Agilizza para processar.`);}
    }catch(e:unknown){showToast("Erro ao carregar Base: "+(e instanceof Error?e.message:String(e)));}
  },[showToast,rawAG,agCache,dados]);

  const agDisponivel=!!rawAG||!!agCache||!!dados;
  const processar=useCallback(()=>{
    if(!rawS3D)return;
    if(!rawAG&&!agCache&&!dados)return;
    setProcessando(true);showToast("Processando...");
    setTimeout(()=>{
      try{
        const{s3d,cpfs}=parseS3D(rawS3D);
        const ag=rawAG?parseAG(rawAG):(agCache?reviveAG(agCache):agFromDados(dados!));
        if(Object.keys(ag).length===0)throw new Error("Sem dados do Agilizza — envie a exportação do Agilizza uma vez.");
        const nomeAG=rawAG?agName:(agCache?.name||ultimoUpload?.ag||dados?.agName||"Agilizza (última exportação)");
        const calc=calcDados(s3d,ag,cpfs);
        const novosDados:DadosProcessados={...calc,s3dName,agName:nomeAG,uploadedAt:new Date().toISOString()};
        setDados(novosDados);setActiveTab("cruzamento");setProcessando(false);
        setUltimoUpload({s3d:s3dName,ag:nomeAG,at:new Date().toISOString()});
        const cache=serializeAG(nomeAG,ag);setAgCache(cache);sharedSetValue(AG_CACHE_KEY,cache).catch(()=>{});
        setSalvando(true);
        const sessionId=crypto.randomUUID();
        salvarSupabase(novosDados,sessionId)
          .then(()=>showToast(`✓ Dados salvos no banco! (${calc.cruz.length.toLocaleString("pt-BR")} no cruzamento)`))
          .catch(()=>showToast("⚠ Processado mas não foi possível salvar no banco."))
          .finally(()=>setSalvando(false));
      }catch(ex:unknown){showToast("Erro: "+(ex instanceof Error?ex.message:String(ex)));setProcessando(false);}
    },50);
  },[rawS3D,rawAG,agCache,dados,s3dName,agName,ultimoUpload,showToast]);

  useEffect(()=>{if(pendingReprocess&&rawS3D&&agDisponivel){setPendingReprocess(false);processar();}},[pendingReprocess,rawS3D,agDisponivel,processar]);

  // ── DERIVED ──
  const cruz=dados?.cruz||[];
  const certs=dados?.certs||[];
  const cpfsFiscal=dados?.cpfs||[];
  const extra=dados?.extra||[];
  const cc=dados?.cc||[];
  const outros=dados?.outros||[];

  const filtCruzList=useMemo(()=>{const acomp=cruz.filter(e=>e.fed_status==="acomp");const sem_acomp=cruz.filter(e=>e.fed_status==="sem_acomp");const sem_tag=cruz.filter(e=>e.fed_status==="sem_tag");let p=filtCruz==="acomp"?acomp:filtCruz==="sem_acomp"?sem_acomp:filtCruz==="sem_tag"?sem_tag:cruz;if(searchCruz)p=p.filter(e=>e.cnpj.toLowerCase().includes(searchCruz.toLowerCase())||e.razao.toLowerCase().includes(searchCruz.toLowerCase()));return{list:p,acomp,sem_acomp,sem_tag};},[cruz,filtCruz,searchCruz]);
  const filtCertList=useMemo(()=>{const venc=certs.filter(c=>c.status==="vencido");const d30=certs.filter(c=>c.status==="d30");const d90=certs.filter(c=>c.status==="d90");const ok=certs.filter(c=>c.status==="ok");const sem=certs.filter(c=>c.status==="sem");let p=filtCert==="prob"?[...venc,...d30,...d90]:filtCert==="vencido"?venc:filtCert==="d30"?d30:filtCert==="d90"?d90:filtCert==="ok"?ok:filtCert==="sem"?sem:certs;if(searchCert)p=p.filter(c=>c.nome.toLowerCase().includes(searchCert.toLowerCase()));return{list:p,venc,d30,d90,ok,sem};},[certs,filtCert,searchCert]);
  const filtCPFList=useMemo(()=>{const noAg=cpfsFiscal.filter(e=>e.no_ag);const semAg=cpfsFiscal.filter(e=>!e.no_ag);let p=filtCPF==="no_ag"?noAg:filtCPF==="sem_ag"?semAg:cpfsFiscal;if(searchCPF)p=p.filter(e=>e.cpf.toLowerCase().includes(searchCPF.toLowerCase())||e.razao.toLowerCase().includes(searchCPF.toLowerCase()));return{list:p,noAg,semAg};},[cpfsFiscal,filtCPF,searchCPF]);
  const filtExtraList=useMemo(()=>{let p=extra;if(searchExtra)p=p.filter(e=>e.cnpj.toLowerCase().includes(searchExtra.toLowerCase())||e.razao.toLowerCase().includes(searchExtra.toLowerCase()));return p;},[extra,searchExtra]);
  const filtCCList=useMemo(()=>{const faltam=cc.filter(e=>!e.no_ag);const cad=cc.filter(e=>e.no_ag);let p=filtCC==="faltam"?faltam:filtCC==="cadastrados"?cad:cc;if(searchCC)p=p.filter(e=>e.doc.toLowerCase().includes(searchCC.toLowerCase())||e.razao.toLowerCase().includes(searchCC.toLowerCase()));return{list:p,faltam,cad};},[cc,filtCC,searchCC]);
  const filtOutrosList=useMemo(()=>{const faltam=outros.filter(e=>!e.no_ag);const cad=outros.filter(e=>e.no_ag);let p=filtOutros==="faltam"?faltam:filtOutros==="cadastrados"?cad:outros;if(searchOutros)p=p.filter(e=>e.cnpj.toLowerCase().includes(searchOutros.toLowerCase())||e.razao.toLowerCase().includes(searchOutros.toLowerCase()));return{list:p,faltam,cad};},[outros,filtOutros,searchOutros]);

  const TH:React.CSSProperties={fontFamily:"inherit",fontSize:12,fontWeight:600,padding:"10px 16px",border:"none",background:"none",cursor:"pointer",borderBottom:"2px solid transparent",marginBottom:-2,display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap"};
  const tabs:[TabId,string,number|string][]=[["upload","Upload",""],["cruzamento","Cruzamento S3D × Agilizza",filtCruzList.acomp?.length||"—"],["cert","Certificados",((filtCertList.venc?.length||0)+(filtCertList.d30?.length||0))||"—"],["cpf","CPFs Fiscal",cpfsFiscal.length||"—"],["extra","Extra no Agilizza",extra.length||"—"],["cc","Construção Civil",filtCCList.faltam?.length||"—"],["outros","Outros / CC",outros.length||"—"]];
  const ready=!!dados;

  if(carregando){return(<div style={{fontFamily:"'Poppins',sans-serif",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",gap:16,color:C.gray50}}><div style={{width:40,height:40,border:`3px solid ${C.gray10}`,borderTopColor:C.green,borderRadius:"50%",animation:"spin 1s linear infinite"}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style><span style={{fontSize:13,fontWeight:600}}>Carregando dados do banco...</span></div>);}

  return(
    <div style={{fontFamily:"'Poppins',sans-serif",background:C.offWhite,minHeight:"100vh",fontSize:14}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      {/* TOPBAR */}
      <div style={{background:C.black,height:54,display:"flex",alignItems:"center",padding:"0 22px",gap:10,position:"sticky",top:0,zIndex:100}}>
        <div style={{width:30,height:30,background:C.green,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,color:C.black}}>P</div>
        <strong style={{color:"#fff",fontSize:13}}>Portal · Agilizza Cadastral</strong>
        {salvando&&<div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6,fontSize:11,color:"rgba(255,255,255,.5)"}}><div style={{width:12,height:12,border:"2px solid rgba(255,255,255,.2)",borderTopColor:C.green,borderRadius:"50%",animation:"spin 1s linear infinite"}}/>Salvando no banco...</div>}
        {ultimoUpload&&!salvando&&<span style={{marginLeft:"auto",fontSize:10,color:"rgba(255,255,255,.3)"}}>S3D: <strong style={{color:"rgba(255,255,255,.5)"}}>{ultimoUpload.s3d}</strong> · {new Date(ultimoUpload.at).toLocaleString("pt-BR")}</span>}
      </div>
      {/* TABS */}
      <div style={{background:C.white,borderBottom:`2px solid ${C.border}`,display:"flex",padding:"0 22px",overflowX:"auto",alignItems:"center"}}>
        {tabs.map(([id,label,badge])=>{const act=activeTab===id;const disabled=!ready&&id!=="upload";return<button key={id} onClick={()=>{if(!disabled)setActiveTab(id);}} disabled={disabled} style={{...TH,color:act?C.greenDark:C.gray50,borderBottomColor:act?C.green:"transparent",opacity:disabled?.4:1}}>
          {label}{badge!==""&&<span style={{fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:12,background:act?C.greenLt:C.redLt,color:act?C.greenDark:C.red}}>{badge}</span>}
        </button>;})}
      </div>

      <div style={{maxWidth:1200,margin:"0 auto",padding:"22px 22px 80px"}}>

        {/* ── UPLOAD ── */}
        {activeTab==="upload"&&<div>
          <div style={{fontSize:19,fontWeight:800,color:C.charcoal,marginBottom:3}}>Agilizza Cadastral</div>
          <div style={{fontSize:12,color:C.gray50,marginBottom:22}}>Carregue as planilhas para cruzar. Os dados ficam salvos no banco — todos no portal veem automaticamente a versão mais recente.</div>
          {ultimoUpload&&<div style={{marginBottom:20,padding:"12px 16px",background:C.greenLt,border:"1px solid #6ee7b7",borderRadius:12,fontSize:12,color:"#15803D",display:"flex",alignItems:"center",gap:8}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            Dados atuais: <strong>{ultimoUpload.s3d}</strong> · {new Date(ultimoUpload.at).toLocaleString("pt-BR")}
            <button onClick={()=>setActiveTab("cruzamento")} style={{fontFamily:"inherit",fontSize:11,fontWeight:600,padding:"4px 10px",borderRadius:6,border:"1px solid #6ee7b7",background:C.white,color:"#15803D",cursor:"pointer",marginLeft:"auto"}}>Ver cruzamento →</button>
          </div>}
          <div style={{marginBottom:14,display:"flex",justifyContent:"flex-end"}}>
            <button onClick={()=>void carregarS3DdaBase()} style={{fontFamily:"inherit",fontSize:12,fontWeight:600,padding:"8px 16px",borderRadius:8,border:`1px solid ${C.border}`,background:C.white,color:C.charcoal,cursor:"pointer"}}>
              ⤓ Carregar S3D da Base Empresas
            </button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20}}>
            {[{title:"Planilha S3D",sub:"Arquivo exportado do sistema de empresas",loaded:!!rawS3D,name:s3dName,count:rawS3D?rawS3D.length-1:0,handler:handleS3D},{title:"Exportação Agilizza",sub:!rawAG&&agDisponivel?"Opcional — a última exportação salva será reutilizada":"Arquivo com empresas, certificados e procurações",loaded:!!rawAG,name:agName,count:0,handler:handleAG}].map((card,ci)=>(
              <label key={ci} style={{display:"block",background:card.loaded?C.greenLt:C.white,border:`2px dashed ${card.loaded?C.greenDark:C.border}`,borderRadius:16,padding:32,textAlign:"center",cursor:"pointer"}}>
                <div style={{fontSize:28,marginBottom:8}}>{card.loaded?"✅":"📁"}</div>
                <div style={{fontSize:14,fontWeight:700,color:C.charcoal,marginBottom:4}}>{card.title}</div>
                <div style={{fontSize:12,color:C.gray50,marginBottom:12}}>{card.sub}</div>
                {card.loaded?<div style={{fontSize:12,fontWeight:600,color:C.greenDark}}>{card.name}{card.count>0&&` (${card.count.toLocaleString("pt-BR")} linhas)`}</div>:<div style={{fontSize:12,color:C.gray30}}>{ci===1&&agDisponivel?`Última: ${agCache?.name||ultimoUpload?.ag||dados?.agName||"exportação salva"}`:"Clique ou arraste o arquivo"}</div>}
                <input type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={e=>card.handler(e.target.files?.[0]??null)}/>
              </label>
            ))}
          </div>
          <div style={{textAlign:"center"}}>
            {(()=>{const podeProcessar=!!rawS3D&&agDisponivel&&!processando&&!salvando;return(
            <button disabled={!podeProcessar} onClick={processar} style={{fontFamily:"inherit",fontSize:14,fontWeight:700,padding:"12px 32px",borderRadius:12,border:"none",background:podeProcessar?C.green:C.gray10,color:podeProcessar?C.black:C.gray50,cursor:podeProcessar?"pointer":"default"}}>
              {processando?"⏳ Processando...":salvando?"⏳ Salvando no banco...":rawAG?"🔍 Processar e salvar no banco":"🔍 Atualizar só com o Acessórias"}
            </button>);})()}
            <div style={{fontSize:11,color:C.gray50,marginTop:10}}>{!rawAG&&agDisponivel?"A última exportação do Agilizza fica salva — você pode atualizar só com a planilha do Acessórias/S3D.":"Após processar, todos no portal já veem os novos dados sem precisar subir a planilha de novo."}</div>
          </div>
        </div>}

        {/* ── CRUZAMENTO ── */}
        {activeTab==="cruzamento"&&<div>
          <div style={{fontSize:19,fontWeight:800,color:C.charcoal,marginBottom:3}}>Cruzamento S3D × Agilizza</div>
          <div style={{fontSize:12,color:C.gray50,marginBottom:18}}>Empresas do S3D (Equipe Fiscal) que não estão cadastradas no Agilizza</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:18}}>
            <StatCard type="warn" title="Pendentes no Agilizza" sub="DP/Contábil sem cadastro" value={filtCruzList.acomp?.length||0}/>
            <StatCard type="info" title="Sem acomp. federal" sub="Só Fiscal" value={filtCruzList.sem_acomp?.length||0}/>
            <StatCard type="all" title="Sem TAG" sub="" value={filtCruzList.sem_tag?.length||0}/>
            <StatCard type="all" title="Total faltando" sub="No S3D, não no Agilizza" value={cruz.length}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <SI value={searchCruz} onChange={v=>{setSearchCruz(v);sp("cruzamento",1);}} placeholder="Buscar CNPJ ou razão..."/>
            <Sel value={filtCruz} onChange={v=>{setFiltCruz(v);sp("cruzamento",1);}}><option value="all">Todos</option><option value="acomp">Incluir no Agilizza (DP/Contábil)</option><option value="sem_acomp">Sem acomp. federal</option><option value="sem_tag">Sem TAG</option></Sel>
            <div style={{flex:1}}/><BtnEx onClick={()=>{exportCSV([["CNPJ","Razao Social","Regime","Equipes","Status Federal","Grupo"],...filtCruzList.list.map(e=>[e.cnpj,e.razao,e.regime,e.tags.join("; "),e.fed_status,e.grupo])],"agilizza_cruzamento.csv");showToast("Exportado!");}}/>
          </div>
          <TableWrap cols="150px 1fr 90px 1fr 140px" headers={["CNPJ","Razão Social","Regime","Equipes","Situação"]} empty={!paginate(filtCruzList.list,pages.cruzamento).slice.length}>
            {paginate(filtCruzList.list,pages.cruzamento).slice.map((e,i)=>(
              <TR key={i} cols="150px 1fr 90px 1fr 140px">
                <TD><span style={{fontFamily:"monospace",fontSize:"10.5px",fontWeight:600}}>{e.cnpj}</span>{e.grupo&&<div style={{fontSize:10,color:C.gray50}}>{e.grupo}</div>}</TD>
                <TD><div title={e.razao} style={{fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{e.razao}</div></TD>
                <TD><span style={{fontSize:10,color:C.gray70}}>{(e.regime||"—").substring(0,20)}</span></TD>
                <TD><TagChips tags={e.tags}/></TD>
                <TD>{e.fed_status==="acomp"?<Chip type="r">⚠ Incluir no Agilizza</Chip>:e.fed_status==="sem_acomp"?<Chip type="gr">Sem acomp. federal</Chip>:<Chip type="gr">Sem TAG</Chip>}</TD>
              </TR>
            ))}
          </TableWrap>
          <Pager page={pages.cruzamento} total={filtCruzList.list.length} onPage={p=>sp("cruzamento",p)}/>
        </div>}

        {/* ── CERTIFICADOS ── */}
        {activeTab==="cert"&&<div>
          <div style={{fontSize:19,fontWeight:800,color:C.charcoal,marginBottom:3}}>Certificados e Procurações</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:18}}>
            <StatCard type="warn" title="Vencidos" sub={`${filtCertList.venc.reduce((s,c)=>s+c.empresas.length,0)} empresa(s)`} value={filtCertList.venc.length}/>
            <StatCard type="warn" title="A vencer ≤30d" sub={`${filtCertList.d30.reduce((s,c)=>s+c.empresas.length,0)} empresa(s)`} value={filtCertList.d30.length}/>
            <StatCard type="amb" title="A vencer ≤90d" sub={`${filtCertList.d90.reduce((s,c)=>s+c.empresas.length,0)} empresa(s)`} value={filtCertList.d90.length}/>
            <StatCard type="ok" title="OK" sub={`${filtCertList.ok.reduce((s,c)=>s+c.empresas.length,0)} empresa(s)`} value={filtCertList.ok.length}/>
            <StatCard type="all" title="Sem cert/outros" sub={`${filtCertList.sem.reduce((s,c)=>s+c.empresas.length,0)} empresa(s)`} value={filtCertList.sem.length}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <SI value={searchCert} onChange={v=>{setSearchCert(v);sp("cert",1);}} placeholder="Buscar certificado..."/>
            <Sel value={filtCert} onChange={v=>{setFiltCert(v);sp("cert",1);}}><option value="all">Todos</option><option value="prob">Com problema</option><option value="vencido">Vencidos</option><option value="d30">A vencer ≤30d</option><option value="d90">A vencer ≤90d</option><option value="ok">OK</option><option value="sem">Sem certificado</option></Sel>
            <div style={{flex:1}}/><BtnEx onClick={()=>{exportCSV([["Certificado","Empresas","Tipo","Vencimento","Dias","Status"],...filtCertList.list.map(c=>[c.nome,c.empresas.length,c.tipo,c.val?fmtDate(c.val):"",c.dias!==null?c.dias:"",c.status])],"agilizza_cert.csv");showToast("Exportado!");}}/>
          </div>
          <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:16,overflow:"hidden"}}>
            {!paginate(filtCertList.list,pages.cert).slice.length?<Empty/>:paginate(filtCertList.list,pages.cert).slice.map((c,i)=>{
              const uid=`cert-${i}`;const open=expandedCerts.has(uid);
              const st=c.status==="vencido"?<Chip type="r">⚠ Vencido</Chip>:c.status==="d30"?<Chip type="r">⚠ &lt;30d</Chip>:c.status==="d90"?<Chip type="a">⚠ &lt;90d</Chip>:c.status==="ok"?<Chip type="ok">OK</Chip>:<Chip type="gr">—</Chip>;
              return<div key={i}>
                <div onClick={()=>{const s=new Set(expandedCerts);if(s.has(uid))s.delete(uid);else s.add(uid);setExpandedCerts(s);}} style={{display:"grid",gridTemplateColumns:"1fr 80px 110px 110px 110px 20px",padding:"0 14px",borderBottom:`1px solid ${C.border}`,alignItems:"center",cursor:"pointer",background:open?C.gray05:"transparent"}}>
                  <TD><div title={c.nome} style={{fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.nome}</div></TD>
                  <TD style={{textAlign:"center"}}><strong style={{fontSize:14,color:C.charcoal}}>{c.empresas.length}</strong><div style={{fontSize:10,color:C.gray50}}>empresa(s)</div></TD>
                  <TD>{c.tipo==="procuracao"?<Chip type="ok">Procuração</Chip>:c.tipo==="sem"?<Chip type="gr">—</Chip>:<Chip type="p">Certificado</Chip>}</TD>
                  <TD><strong style={{fontSize:11}}>{c.val?fmtDate(c.val):"—"}</strong></TD>
                  <TD><DiasBadge dias={c.dias}/></TD>
                  <TD style={{textAlign:"center"}}>{st}</TD>
                </div>
                {open&&<div style={{padding:"12px 14px",background:"rgba(0,0,0,.02)",borderBottom:`1px solid ${C.border}`}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                    <thead><tr style={{background:C.gray05}}>{["CNPJ","Razão Social","Grupo","Equipe","Proc?"].map(h=><th key={h} style={{padding:"6px 8px",textAlign:"left",fontSize:10,fontWeight:700,color:C.gray50,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                    <tbody>{c.empresas.map((e,ei)=>(<tr key={ei} style={{borderBottom:`1px solid ${C.border}`}}><td style={{padding:"6px 8px",fontFamily:"monospace",fontSize:"10.5px"}}>{e.cnpj}</td><td style={{padding:"6px 8px"}}>{e.razao}</td><td style={{padding:"6px 8px",fontSize:10,color:C.gray70}}>{e.grupo||"—"}</td><td style={{padding:"6px 8px"}}><Chip type="gr">{e.equipe||"—"}</Chip></td><td style={{padding:"6px 8px"}}>{e.usa_proc?<Chip type="ok">Sim</Chip>:<Chip type="gr">Não</Chip>}</td></tr>))}</tbody>
                  </table>
                </div>}
              </div>;
            })}
          </div>
          <Pager page={pages.cert} total={filtCertList.list.length} onPage={p=>sp("cert",p)}/>
        </div>}

        {/* ── CPF ── */}
        {activeTab==="cpf"&&<div>
          <div style={{fontSize:19,fontWeight:800,color:C.charcoal,marginBottom:3}}>CPFs — Equipe Fiscal</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:18}}>
            <StatCard type="all" title="Total de CPFs" sub="" value={cpfsFiscal.length}/>
            <StatCard type="info" title="No Agilizza" sub={cpfsFiscal.length?Math.round(filtCPFList.noAg.length/cpfsFiscal.length*100)+"%":"0%"} value={filtCPFList.noAg.length}/>
            <StatCard type="all" title="Sem cadastro" sub="" value={filtCPFList.semAg.length}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <SI value={searchCPF} onChange={v=>{setSearchCPF(v);sp("cpf",1);}} placeholder="Buscar CPF ou razão..."/>
            <Sel value={filtCPF} onChange={v=>{setFiltCPF(v);sp("cpf",1);}}><option value="all">Todos</option><option value="no_ag">No Agilizza</option><option value="sem_ag">Sem cadastro</option></Sel>
            <div style={{flex:1}}/><BtnEx onClick={()=>{exportCSV([["CPF","Razao Social","Regime","Equipes","No Agilizza"],...filtCPFList.list.map(e=>[e.cpf,e.razao,e.regime,e.tags.join("; "),e.no_ag?"Sim":"Não"])],"agilizza_cpf.csv");showToast("Exportado!");}}/>
          </div>
          <TableWrap cols="150px 1fr 130px 1fr 140px" headers={["CPF","Nome","Regime","Equipes","Agilizza"]} empty={!paginate(filtCPFList.list,pages.cpf).slice.length}>
            {paginate(filtCPFList.list,pages.cpf).slice.map((e,i)=>(
              <TR key={i} cols="150px 1fr 130px 1fr 140px">
                <TD><span style={{fontFamily:"monospace",fontSize:"10.5px",fontWeight:600}}>{e.cpf}</span>{e.grupo&&<div style={{fontSize:10,color:C.gray50}}>{e.grupo}</div>}</TD>
                <TD><div title={e.razao} style={{fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{e.razao}</div></TD>
                <TD><span style={{fontSize:10,color:C.gray70}}>{(e.regime||"—").substring(0,22)}</span></TD>
                <TD><TagChips tags={e.tags}/></TD>
                <TD>{e.no_ag?<Chip type="ok">✓ Cadastrado</Chip>:<Chip type="gr">Não cadastrado</Chip>}</TD>
              </TR>
            ))}
          </TableWrap>
          <Pager page={pages.cpf} total={filtCPFList.list.length} onPage={p=>sp("cpf",p)}/>
        </div>}

        {/* ── EXTRA ── */}
        {activeTab==="extra"&&<div>
          <div style={{fontSize:19,fontWeight:800,color:C.charcoal,marginBottom:3}}>Extra no Agilizza</div>
          <div style={{fontSize:12,color:C.gray50,marginBottom:18}}>Empresas cadastradas no Agilizza que não existem no S3D</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:18}}>
            <StatCard type="amb" title="Total" sub="No Agilizza, não no S3D" value={extra.length}/>
            <StatCard type="warn" title="Com certificado/procuração" sub="Custo potencialmente desnecessário" value={extra.filter(e=>e.cert_raw).length}/>
            <StatCard type="all" title="Sem certificado" sub="" value={extra.filter(e=>!e.cert_raw).length}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <SI value={searchExtra} onChange={v=>{setSearchExtra(v);sp("extra",1);}} placeholder="Buscar CNPJ ou razão..."/>
            <div style={{flex:1}}/><BtnEx onClick={()=>{exportCSV([["CNPJ","Razao Social","Equipe Agilizza","Certificado"],...filtExtraList.map(e=>[e.cnpj,e.razao,e.equipe,e.cert_nome||""])],"agilizza_extra.csv");showToast("Exportado!");}}/>
          </div>
          <TableWrap cols="150px 1fr 130px 130px" headers={["CNPJ","Razão Social","Equipe Agilizza","Certificado"]} empty={!paginate(filtExtraList,pages.extra).slice.length}>
            {paginate(filtExtraList,pages.extra).slice.map((e,i)=>(
              <TR key={i} cols="150px 1fr 130px 130px">
                <TD><span style={{fontFamily:"monospace",fontSize:"10.5px",fontWeight:600}}>{e.cnpj}</span></TD>
                <TD><div title={e.razao} style={{fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{e.razao}</div></TD>
                <TD><Chip type="gr">{e.equipe||"—"}</Chip></TD>
                <TD>{e.cert_raw?<Chip type="p">{e.cert_nome.substring(0,22)}</Chip>:<span style={{color:C.gray30,fontSize:10}}>—</span>}</TD>
              </TR>
            ))}
          </TableWrap>
          <Pager page={pages.extra} total={filtExtraList.length} onPage={p=>sp("extra",p)}/>
        </div>}

        {/* ── CC ── */}
        {activeTab==="cc"&&<div>
          <div style={{fontSize:19,fontWeight:800,color:C.charcoal,marginBottom:3}}>Construção Civil no Agilizza</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:18}}>
            <StatCard type="all" title="Total CC" sub="CNPJ + CPF" value={cc.length}/>
            <StatCard type="warn" title="Faltam no Agilizza" sub="" value={filtCCList.faltam?.length||0}/>
            <StatCard type="ok" title="Já cadastrados" sub="" value={filtCCList.cad?.length||0}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <SI value={searchCC} onChange={v=>{setSearchCC(v);sp("cc",1);}} placeholder="Buscar CNPJ/CPF ou razão..."/>
            <Sel value={filtCC} onChange={v=>{setFiltCC(v);sp("cc",1);}}><option value="all">Todos</option><option value="faltam">Faltam no Agilizza</option><option value="cadastrados">Já cadastrados</option></Sel>
            <div style={{flex:1}}/><BtnEx onClick={()=>{exportCSV([["Documento","Tipo","Razao Social","Equipes S3D","No Agilizza"],...filtCCList.list.map(e=>[e.doc,e.tipo,e.razao,e.tags.join("; "),e.no_ag?"Sim":"Não"])],"agilizza_cc.csv");showToast("Exportado!");}}/>
          </div>
          <div style={{fontSize:12,color:C.amber,marginBottom:12}}>⚠ Construção Civil e Outros não são persistidos no banco — requerem upload das planilhas para exibir. Apenas Cruzamento, Certificados, CPFs e Extra ficam salvos.</div>
          {!cc.length?<div style={{padding:32,textAlign:"center",color:C.gray30,fontSize:12}}>Carregue as planilhas na aba Upload para ver os dados de CC.</div>:<>
          <TableWrap cols="150px 1fr 1fr 140px" headers={["Documento","Razão Social","Equipes S3D","Agilizza"]} empty={!paginate(filtCCList.list,pages.cc).slice.length}>
            {paginate(filtCCList.list,pages.cc).slice.map((e,i)=>(
              <TR key={i} cols="150px 1fr 1fr 140px">
                <TD>{e.tipo==="cpf"&&<Chip type="gr">CPF</Chip>}<span style={{fontFamily:"monospace",fontSize:"10.5px",fontWeight:600,marginLeft:e.tipo==="cpf"?4:0}}>{e.doc}</span></TD>
                <TD><div title={e.razao} style={{fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{e.razao}</div></TD>
                <TD><TagChips tags={e.tags}/></TD>
                <TD>{e.no_ag?<Chip type="ok">✓ No Agilizza</Chip>:<Chip type="r">⚠ Falta cadastrar</Chip>}</TD>
              </TR>
            ))}
          </TableWrap>
          <Pager page={pages.cc} total={filtCCList.list.length} onPage={p=>sp("cc",p)}/>
          </>}
        </div>}

        {/* ── OUTROS ── */}
        {activeTab==="outros"&&<div>
          <div style={{fontSize:19,fontWeight:800,color:C.charcoal,marginBottom:3}}>Outros / Fora da Equipe Fiscal</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:18}}>
            <StatCard type="all" title="Total Outros/CC" sub="" value={outros.length}/>
            <StatCard type="warn" title="Faltam no Agilizza" sub="" value={filtOutrosList.faltam?.length||0}/>
            <StatCard type="ok" title="Já no Agilizza" sub="" value={filtOutrosList.cad?.length||0}/>
          </div>
          {!outros.length?<div style={{padding:32,textAlign:"center",color:C.gray30,fontSize:12}}>Carregue as planilhas na aba Upload para ver os dados.</div>:<>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <SI value={searchOutros} onChange={v=>{setSearchOutros(v);sp("outros",1);}} placeholder="Buscar CNPJ/CPF, razão, grupo ou TAG..."/>
            <Sel value={filtOutros} onChange={v=>{setFiltOutros(v);sp("outros",1);}}><option value="all">Todos</option><option value="faltam">Faltam no Agilizza</option><option value="cadastrados">Já no Agilizza</option></Sel>
            <div style={{flex:1}}/><BtnEx onClick={()=>{exportCSV([["CNPJ/CPF","Razao Social","Regime","Grupo","TAGs","No Agilizza"],...filtOutrosList.list.map(e=>[e.cnpj,e.razao,e.regime||"",e.grupo||"",e.tags.join("; "),e.no_ag?"Sim":"Não"])],"agilizza_outros.csv");showToast("Exportado!");}}/>
          </div>
          <TableWrap cols="155px 1fr 90px 1fr 140px" headers={["CNPJ/CPF","Razão Social","Regime","Equipes","Agilizza"]} empty={!paginate(filtOutrosList.list,pages.outros).slice.length}>
            {paginate(filtOutrosList.list,pages.outros).slice.map((e,i)=>(
              <TR key={i} cols="155px 1fr 90px 1fr 140px">
                <TD><span style={{fontFamily:"monospace",fontSize:"10.5px",fontWeight:600}}>{e.cnpj}</span>{e.grupo&&<div style={{fontSize:10,color:C.gray50}}>{e.grupo}</div>}</TD>
                <TD><div title={e.razao} style={{fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{e.razao}</div></TD>
                <TD><span style={{fontSize:10,color:C.gray70}}>{(e.regime||"—").substring(0,20)}</span></TD>
                <TD><TagChips tags={e.tags}/></TD>
                <TD>{e.no_ag?<Chip type="ok">✓ No Agilizza</Chip>:<Chip type="r">⚠ Falta cadastrar</Chip>}</TD>
              </TR>
            ))}
          </TableWrap>
          <Pager page={pages.outros} total={filtOutrosList.list.length} onPage={p=>sp("outros",p)}/>
          </>}
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
