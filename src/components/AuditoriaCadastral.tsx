// AuditoriaCadastral.tsx — PARTE 2/2
// Este arquivo é o componente principal. Cole em src/components/AuditoriaCadastral.tsx
// SUBSTITUI completamente o arquivo anterior — contém tudo (imports internos resolvidos)

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { listEmpresasAtivas, getEmpresaBaseResumo } from "@/lib/empresas-mensal";



// ── Re-imports das partes comuns (copiadas aqui para ser um arquivo standalone) ──
const SIT_PROB=["Suspensa","Inapta","Baixada"];
type TabId = "upload"|"resumogeral"|"sit"|"ie"|"simples"|"cpf"|"cnae"|"cnaebase"|"socios"|"cc";
interface IEProb { tipo: string; desc: string; ie?: string; uf?: string; ie_s3d?: string; ie_cnpja?: string; sit_cnpja?: string; }
interface IE { uf: string; ie_raw: string; ie_num: string; tipo: string; hab: string; sit: string; }
interface Hist { regime: string; data_ini: unknown; data_fim: unknown; motivo: string; }
interface Atividade { principal: boolean; cod: string; desc: string; }
interface Socio { nome: string; doc: string; tipo: string; qualif: string; data_entrada: unknown; }
interface Empresa { cnpj: string; razao: string; grupo: string; regime: string; is_cpf: boolean; uf: string; isento: string; ie_s3d: string; im: string; tags: string[]; tags_arr: string[]; is_cc: boolean; sit: string; sit_data: unknown; sit_motivo: string; simples_cnpja: string; simples_inc: unknown; ies: IE[]; ie_status: string; ie_probs: IEProb[]; ies_s3d: {uf:string;raw:string;num:string}[]; sn_s3d: boolean; sn_cnpja: boolean; sn_div: boolean; cnae: string; cnae_desc: string; cnae_obrig: string|null; ie_habilitada: boolean; consultado: boolean; hist: Hist[]; atividades_all: Atividade[]; socios_atuais: Socio[]; }
interface ResumoRow { cnpj: string; razao: string; grupo: string; tags_arr?: string[]; cat: string; problema: string; detalhe: string; }
const CC_TAGS=["Equipe DP 4","Equipe CC 1","Equipe CC 2","Equipe CC 4","Equipe Dedicada Canopus"];
const DP_TAGS=["Equipe DP 1","Equipe DP 2"];
const FISCAL_TAGS=["Equipe Fiscal 1","Equipe Fiscal 2","Equipe Fiscal 3","Equipe Fiscal 4","Equipe Fiscal 5","Equipe Fiscal 6","Equipe Fiscal 7","Equipe Fiscal 8"];
const PER=50;
const EQUIPES_OPTIONS=[{group:"DP",items:["Equipe DP 1","Equipe DP 2"]},{group:"Fiscal",items:["Equipe Fiscal 1","Equipe Fiscal 2","Equipe Fiscal 3","Equipe Fiscal 4","Equipe Fiscal 5","Equipe Fiscal 6","Equipe Fiscal 7","Equipe Fiscal 8"]},{group:"Contábil",items:["Equipe Contábil 1","Equipe Contábil 2","Equipe Contábil 3","Equipe Contábil 4","Equipe Contábil 5","Equipe Contábil 6","Equipe Contábil 7","Equipe Contábil 8","Equipe Contábil 9","Equipe Contábil 10","Equipe Dedicada Uniggel"]}];
const CNAE_MAP:Record<string,string>={"0111301":"S","0111302":"S","0111303":"S","0111399":"S","0112101":"S","0112102":"S","0112199":"S","0113000":"S","0114800":"S","0115600":"S","0116401":"S","0116402":"S","0116403":"S","0116499":"S","0119901":"S","0119902":"S","0119903":"S","0119904":"S","0119905":"S","0119906":"S","0119907":"S","0119908":"S","0119909":"S","0119999":"S","0121101":"S","0121102":"S","0122900":"S","0131800":"S","0132600":"S","0133401":"S","0133402":"S","0133403":"S","0133404":"S","0133405":"S","0133406":"S","0133407":"S","0133408":"S","0133409":"S","0133410":"S","0133411":"S","0133499":"S","0134200":"S","0135100":"S","0139301":"S","0139302":"S","0139303":"S","0139304":"S","0139305":"S","0139306":"S","0139399":"S","0141501":"S","0141502":"S","0142300":"S","0151201":"S","0151202":"S","0151203":"S","0152101":"S","0152102":"S","0152103":"S","0153901":"S","0153902":"S","0154700":"S","0155501":"S","0155502":"S","0155503":"S","0155504":"S","0155505":"S","0159801":"S","0159802":"S","0159803":"S","0159804":"S","0159899":"S","0161001":"N","0161002":"N","0161003":"N","0161099":"N","0162801":"N","0162802":"N","0162803":"N","0162899":"N","0163600":"N","0170900":"S","0210101":"S","0210102":"S","0210103":"S","0210104":"S","0210105":"S","0210106":"S","0210107":"S","0210108":"S","0210109":"S","0210199":"S","0220901":"S","0220902":"S","0220903":"S","0220904":"S","0220905":"S","0220906":"N","0220999":"S","0230600":"N","0311601":"S","0311602":"S","0311603":"S","0311604":"N","0312401":"S","0312402":"S","0312403":"S","0312404":"N","0321301":"S","0321302":"S","0321303":"S","0321304":"S","0321305":"N","0321399":"S","0322101":"S","0322102":"S","0322103":"S","0322104":"S","0322105":"S","0322106":"S","0322107":"N","0322199":"S","0500301":"S","0500302":"S","0600001":"S","0600002":"S","0600003":"S","0710301":"S","0710302":"S","4110700":"N","4120400":"S","6810201":"N","6810202":"C","6810203":"N","6821801":"N","6821802":"N","6822600":"N","9511800":"C","9512600":"C","9521500":"C","9529101":"N","9529102":"N","9529103":"N","9529104":"C","9529105":"N","9529106":"N","9529199":"N","9601701":"N","9601702":"N","9601703":"N","9700500":"N","9900800":"N"};
const C={green:"#0AE18C",greenDark:"#00BF63",greenLt:"#EAFBF4",black:"#0C0C0C",charcoal:"#1A1A1A",ink:"#2C2C2C",gray70:"#4A4A4A",gray50:"#646464",gray30:"#CDCDCD",gray10:"#E8E8E8",gray05:"#F2F2F2",offWhite:"#FAFAFA",white:"#FFFFFF",border:"#E2E2E2",red:"#DC2626",redLt:"#FEE2E2",amber:"#FA6914",amberLt:"#FFF3E0",blue:"#14C8FA",blueLt:"#DDF6FF",purple:"#7C3AED",purpleLt:"#F5F3FF"};
function isCPF(d:string){return String(d||"").replace(/\D/g,"").length===11;}
function fmtDoc(v:unknown){const d=String(v||"").replace(/\D/g,"");if(d.length===14)return d.substring(0,2)+"."+d.substring(2,5)+"."+d.substring(5,8)+"/"+d.substring(8,12)+"-"+d.substring(12);if(d.length===11)return d.substring(0,3)+"."+d.substring(3,6)+"."+d.substring(6,9)+"-"+d.substring(9);return String(v||"").trim();}
function isSN(r:string):boolean{return !!(r&&r.toLowerCase().includes("simples"));}
function isCC(t:string[]){return t&&t.some(x=>CC_TAGS.includes(x));}
function isentoSim(v:string){return["sim","s","yes"].includes((v||"").toLowerCase());}
function normIE(s:string){const d=String(s||"").replace(/[^\d]/g,"");return d.replace(/^0+/,"")||"0";}
function fmtCnae(c:string){if(!c||c.length!==7)return c||"—";return c.substring(0,4)+"-"+c.substring(4,5)+"/"+c.substring(5,7);}
function fmtDataHist(d:unknown):string{if(!d&&d!==0)return"—";const dt=parseAnyDate(d);if(!dt)return String(d).substring(0,10);return String(dt.getUTCDate()).padStart(2,"0")+"/"+String(dt.getUTCMonth()+1).padStart(2,"0")+"/"+dt.getUTCFullYear();}
function reentrouSimples(e:Empresa){return e.sn_cnpja===true&&(e.hist||[]).length>0;}

// ── Alerta de baixa: prazos ECD/ECF (LR/LP) ──
const excelSerialToDate=(n:number)=>new Date(Math.round((n-25569)*86400*1000));
function parseAnyDate(d:unknown):Date|null{if(d==null||d==="")return null;try{let dt:Date;if(typeof d==="number")dt=excelSerialToDate(d);else if(d instanceof Date)dt=d;else{const s=String(d).trim();if(!s||s==="-")return null;const br=s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);const brCurto=s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/);const iso=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);const compact=s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if(br)dt=new Date(Date.UTC(+br[3],+br[2]-1,+br[1]));
    else if(iso)dt=new Date(Date.UTC(+iso[1],+iso[2]-1,+iso[3]));
    else if(compact)dt=new Date(Date.UTC(+compact[1],+compact[2]-1,+compact[3]));
    else if(brCurto)dt=new Date(Date.UTC(2000+ +brCurto[3],+brCurto[2]-1,+brCurto[1]));
    else if(/^\d{4,6}(\.\d+)?$/.test(s)){const n=parseFloat(s);if(n<10000||n>80000)return null;dt=excelSerialToDate(n);}
    else dt=new Date(s);}
  if(isNaN(dt.getTime()))return null;const y=dt.getUTCFullYear();if(y<1900||y>2100)return null;return dt;}catch{return null;}}
function ultimoDiaUtil(ano:number,mes0:number):Date{const d=new Date(Date.UTC(ano,mes0+1,0));while(d.getUTCDay()===0||d.getUTCDay()===6)d.setUTCDate(d.getUTCDate()-1);return d;}
function fmtDate(d:Date){return String(d.getUTCDate()).padStart(2,"0")+"/"+String(d.getUTCMonth()+1).padStart(2,"0")+"/"+d.getUTCFullYear();}
/** ECD: evento jan–mai → último dia útil de junho do mesmo ano; jun–dez → último dia útil do mês seguinte. */
function prazoECD(ev:Date):Date{const m=ev.getUTCMonth();const y=ev.getUTCFullYear();return m<=4?ultimoDiaUtil(y,5):ultimoDiaUtil(y,m+1);}
/** ECF: evento jan–abr → último dia útil de julho do mesmo ano; mai–dez → último dia útil do 3º mês subsequente. */
function prazoECF(ev:Date):Date{const m=ev.getUTCMonth();const y=ev.getUTCFullYear();return m<=3?ultimoDiaUtil(y,6):ultimoDiaUtil(y,m+3);}
function isLrLp(regime:string){const r=(regime||"").toLowerCase();return (r.includes("lucro real")||r.includes("lucro presumido"))&&!r.includes("filial");}
function isMatriz(cnpj:string){return /\/0001-/.test(cnpj||"")||/^\d{8}0001/.test((cnpj||"").replace(/\D/g,""));}
type PrazoSit={label:string;chip:"r"|"a"|"ok";dias:number};
function situacaoPrazo(prazo:Date):PrazoSit{const hoje=new Date();const hj=Date.UTC(hoje.getFullYear(),hoje.getMonth(),hoje.getDate());const dias=Math.round((prazo.getTime()-hj)/86400000);if(dias<0)return{label:`Vencido há ${Math.abs(dias)}d`,chip:"r",dias};if(dias<=30)return{label:`Vence em ${dias}d`,chip:"a",dias};return{label:`Vence em ${dias}d`,chip:"ok",dias};}

function paginate<T>(data:T[],page:number){const start=(page-1)*PER;return{slice:data.slice(start,start+PER),total:data.length};}
function exportXlsx(filename:string,headers:string[],rows:unknown[][]){const ws=XLSX.utils.aoa_to_sheet([headers,...rows]);const cw=headers.map((h,ci)=>{let max=h.length;rows.forEach(r=>{const v=String(r[ci]||"");if(v.length>max)max=v.length;});return{wch:Math.min(max+2,60)};});ws["!cols"]=cw;const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Auditoria");XLSX.writeFile(wb,filename);}

type BaseEmpresaRow=Awaited<ReturnType<typeof listEmpresasAtivas>>[number];
function valBase(d:Record<string,unknown>,...keys:string[]){for(const k of keys){if(d[k]!=null&&String(d[k]).trim()!=="")return d[k];const hit=Object.keys(d).find(x=>x.toLowerCase().trim()===k.toLowerCase().trim());if(hit&&d[hit]!=null&&String(d[hit]).trim()!=="")return d[hit];}return"";}
function s3dFromBase(l:BaseEmpresaRow){const d=(l.dados||{}) as Record<string,unknown>;const tagsRaw=String(valBase(d,"Tags")||(l.tags||[]).join(", ")).trim();const tags=tagsRaw?tagsRaw.split(",").map(t=>t.trim()).filter(t=>t&&t!=="CX"):[];return{cnpj:fmtDoc(valBase(d,"CNPJ","CPF/CNPJ","CPF CNPJ")||l.cnpj),razao:String(l.razao??valBase(d,"Razão social","Razao social","Empresa")??"").trim().substring(0,60),regime:String(l.regime??valBase(d,"Regime")??"").trim(),ie:String(valBase(d,"Inscrições Estaduais")??"").trim(),isento:String(valBase(d,"Empresa Isenta")??"").trim(),im:String(valBase(d,"Insc. Municipal")??"").trim(),uf:String(valBase(d,"UF")??"").trim(),grupo:String(l.grupo??valBase(d,"Grupo de Empresas")??"").trim().substring(0,40),tags,is_cc:isCC(tags)};}
function matrizS3DBase(linhas:BaseEmpresaRow[]):unknown[][]{const baseHeaders=["CNPJ","Razão social","Regime","Inscrições Estaduais","Empresa Isenta","Insc. Municipal","UF","Grupo de Empresas","Tags"];const extra=new Set<string>();linhas.forEach(l=>Object.keys((l.dados||{}) as Record<string,unknown>).forEach(k=>extra.add(k)));const headers=[...baseHeaders,...Array.from(extra).filter(h=>!baseHeaders.includes(h))];return[headers,...linhas.map(l=>{const d=(l.dados||{}) as Record<string,unknown>;const s=s3dFromBase(l);const row:Record<string,unknown>={...d,"CNPJ":s.cnpj,"Razão social":s.razao,"Regime":s.regime,"Inscrições Estaduais":s.ie,"Empresa Isenta":s.isento,"Insc. Municipal":s.im,"UF":s.uf,"Grupo de Empresas":s.grupo,"Tags":s.tags.join(", ")};return headers.map(h=>row[h]??"");})];}
function atualizarAuditoriaComBase(linhas:BaseEmpresaRow[],anteriores:Empresa[]):Empresa[]{const prevMap=new Map(anteriores.map(e=>[fmtDoc(e.cnpj),e]));return linhas.map(l=>{const s=s3dFromBase(l);const prev=prevMap.get(s.cnpj);const consultado=!!prev?.consultado;const ie_list=prev?.ies||[];const isento=isentoSim(s.isento);const ies_s3d:{uf:string;raw:string;num:string}[]=[];const re2=/UF:\s*(\S+)\s*-\s*IE:\s*(\S+)/g;let m2;while((m2=re2.exec(s.ie))!==null){ies_s3d.push({uf:m2[1].trim(),raw:m2[2].trim(),num:normIE(m2[2].trim())});}if(!ies_s3d.length){const re3=/IE:\s*([^\s,;\n]+)/g;let m3;while((m3=re3.exec(s.ie))!==null){ies_s3d.push({uf:"?",raw:m3[1].trim(),num:normIE(m3[1].trim())});}}const ie_probs:IEProb[]=[];if(!consultado)ie_probs.push({tipo:"NAO_CONSULTADO",desc:"CNPJ não encontrado na consulta do CNPJá salva"});if(consultado&&isento&&ie_list.length>0)ie_probs.push({tipo:"ERRO_ISENTA_COM_IE",desc:`S3D marcado como Isenta mas CNPJá tem ${ie_list.length} IE(s)`});if(consultado&&!isento&&ies_s3d.length===0&&ie_list.length===0)ie_probs.push({tipo:"SEM_IE",desc:"Não isenta e sem IE em nenhuma fonte"});if(consultado)ies_s3d.forEach(ie_s=>{const match=ie_list.find(x=>x.ie_num===ie_s.num);if(!match)ie_probs.push({tipo:"IE_NAO_ENCONTRADA",ie:ie_s.raw,uf:ie_s.uf,ie_s3d:ie_s.raw,ie_cnpja:"",sit_cnpja:"",desc:`IE ${ie_s.raw} cadastrada no S3D não encontrada no CNPJá`});else if(match.hab==="Não")ie_probs.push({tipo:"IE_NAO_HABILITADA",ie:ie_s.raw,uf:ie_s.uf,ie_s3d:ie_s.raw,ie_cnpja:match.ie_raw,sit_cnpja:match.sit,desc:`IE ${ie_s.raw} não habilitada no CNPJá (${match.sit})`});else if(match.sit!=="Sem restrição")ie_probs.push({tipo:"IE_RESTRICAO",ie:ie_s.raw,uf:ie_s.uf,ie_s3d:ie_s.raw,ie_cnpja:match.ie_raw,sit_cnpja:match.sit,desc:`IE ${ie_s.raw} com restrição: ${match.sit}`});});const nums_s3d=ies_s3d.map(x=>x.num);if(consultado)ie_list.forEach(ie_c=>{if(!nums_s3d.includes(ie_c.ie_num)&&!isento&&ie_c.hab==="Sim")ie_probs.push({tipo:"IE_FALTANDO_S3D",ie:ie_c.ie_raw,uf:ie_c.uf,ie_s3d:"",ie_cnpja:ie_c.ie_raw,sit_cnpja:ie_c.sit,desc:`IE ${ie_c.uf}: ${ie_c.ie_raw} consta no CNPJá mas não está no S3D`});});const ie_status=!consultado?"nao_consultado":isento&&ie_list.length===0?"isenta_ok":isento&&ie_list.length>0?"erro_isenta":ie_probs.length===0?"ok":"problema";const sn_s3d=isSN(s.regime);const sn_cnpja=(String(prev?.simples_cnpja||"")).toLowerCase()==="sim";const cnae=prev?.cnae||"";const cnae_obrig=CNAE_MAP[cnae]||null;const ie_habilitada=ies_s3d.some(ie_s=>{const m=ie_list.find(x=>x.ie_num===ie_s.num);return m&&m.hab==="Sim";})||ie_list.some(x=>x.hab==="Sim");return{cnpj:s.cnpj,razao:s.razao,grupo:s.grupo,regime:s.regime,is_cpf:isCPF(s.cnpj),uf:s.uf||prev?.uf||"",isento:s.isento,ie_s3d:s.ie,im:s.im,tags:s.tags,tags_arr:s.tags,is_cc:s.is_cc,sit:prev?.sit||"Não encontrada",sit_data:prev?.sit_data||null,sit_motivo:prev?.sit_motivo||"",simples_cnpja:prev?.simples_cnpja||"Não",simples_inc:prev?.simples_inc||null,sn_s3d,sn_cnpja,sn_div:Boolean((sn_s3d&&!sn_cnpja)||(sn_cnpja&&!sn_s3d)),ies:ie_list,ie_status,ie_probs,ies_s3d,cnae,cnae_desc:prev?.cnae_desc||"",cnae_obrig,ie_habilitada,consultado,hist:prev?.hist||[],atividades_all:prev?.atividades_all||[],socios_atuais:prev?.socios_atuais||[]};});}

// ── Supabase helpers ──
async function must<T extends { error: unknown }>(op: PromiseLike<T>): Promise<T> {
  const result = await op;
  if (result.error) throw result.error;
  return result;
}

async function salvarDadosSupabase(dados:Empresa[],sessionId:string,fileName:string){
  await must(supabase.from("auditoria_dados").delete().neq("session_id",sessionId));
  await must(supabase.from("auditoria_sessao").delete().neq("session_id",sessionId));
  await must(supabase.from("auditoria_sessao").insert({session_id:sessionId,file_name:fileName,total:dados.length,uploaded_at:new Date().toISOString()} as never));
  const CHUNK=200;
  for(let i=0;i<dados.length;i+=CHUNK){
    const chunk=dados.slice(i,i+CHUNK).map(e=>({session_id:sessionId,file_name:fileName,cnpj:e.cnpj,razao:e.razao,grupo:e.grupo,regime:e.regime,is_cpf:e.is_cpf,is_cc:e.is_cc,uf:e.uf,isento:e.isento,ie_s3d:e.ie_s3d,im:e.im,tags:e.tags,sit:e.sit,sit_data:e.sit_data?String(e.sit_data):null,sit_motivo:e.sit_motivo,simples_cnpja:e.simples_cnpja,simples_inc:e.simples_inc?String(e.simples_inc):null,sn_s3d:e.sn_s3d,sn_cnpja:e.sn_cnpja,sn_div:e.sn_div,cnae:e.cnae,cnae_desc:e.cnae_desc,cnae_obrig:e.cnae_obrig,ie_habilitada:e.ie_habilitada,consultado:e.consultado,ies:e.ies as unknown as object,ie_status:e.ie_status,ie_probs:e.ie_probs as unknown as object,ies_s3d:e.ies_s3d as unknown as object,hist:e.hist as unknown as object,atividades_all:e.atividades_all as unknown as object,socios_atuais:e.socios_atuais as unknown as object}));
    await must(supabase.from("auditoria_dados").insert(chunk as never));
  }
}
async function carregarDadosSupabase():Promise<{dados:Empresa[];fileName:string;uploadedAt:string}|null>{
  const{data:sessao}=await supabase.from("auditoria_sessao").select("*").order("uploaded_at",{ascending:false}).limit(1).single();
  if(!sessao)return null;
  const allData:Empresa[]=[];let from=0;const PAGE=1000;
  while(true){const{data,error}=await supabase.from("auditoria_dados").select("*").eq("session_id",sessao.session_id).range(from,from+PAGE-1);if(error||!data||!data.length)break;
    data.forEach((row:Record<string,unknown>)=>{allData.push({cnpj:String(row.cnpj||""),razao:String(row.razao||""),grupo:String(row.grupo||""),regime:String(row.regime||""),is_cpf:Boolean(row.is_cpf),is_cc:Boolean(row.is_cc),uf:String(row.uf||""),isento:String(row.isento||""),ie_s3d:String(row.ie_s3d||""),im:String(row.im||""),tags:Array.isArray(row.tags)?row.tags as string[]:[],tags_arr:Array.isArray(row.tags)?row.tags as string[]:[],sit:String(row.sit||""),sit_data:row.sit_data,sit_motivo:String(row.sit_motivo||""),simples_cnpja:String(row.simples_cnpja||""),simples_inc:row.simples_inc,sn_s3d:Boolean(row.sn_s3d),sn_cnpja:Boolean(row.sn_cnpja),sn_div:Boolean(row.sn_div),cnae:String(row.cnae||""),cnae_desc:String(row.cnae_desc||""),cnae_obrig:row.cnae_obrig?String(row.cnae_obrig):null,ie_habilitada:Boolean(row.ie_habilitada),consultado:Boolean(row.consultado),ies:(row.ies as IE[])||[],ie_status:String(row.ie_status||""),ie_probs:(row.ie_probs as IEProb[])||[],ies_s3d:(row.ies_s3d as{uf:string;raw:string;num:string}[])||[],hist:(row.hist as Hist[])||[],atividades_all:(row.atividades_all as Atividade[])||[],socios_atuais:(row.socios_atuais as Socio[])||[]});});
    if(data.length<PAGE)break;from+=PAGE;
  }
  return{dados:allData,fileName:String(sessao.file_name||""),uploadedAt:String(sessao.uploaded_at||"")};
}

// ── Mini UI ──
function StatCard({type,title,sub,value}:{type:"warn"|"ok"|"amb"|"all";title:string;sub:string;value:number}){const s={warn:{b:"#fca5a5",bg:C.redLt,ic:C.red,n:C.red},ok:{b:"#6ee7b7",bg:C.greenLt,ic:C.greenDark,n:C.greenDark},amb:{b:"#fed7aa",bg:C.amberLt,ic:C.amber,n:C.amber},all:{b:C.border,bg:C.gray05,ic:C.gray50,n:C.charcoal}}[type];return(<div style={{background:C.white,border:`1px solid ${s.b}`,borderRadius:16,overflow:"hidden",minWidth:150,flex:1}}><div style={{padding:"10px 13px 8px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:8}}><div style={{width:26,height:26,borderRadius:6,background:s.bg,display:"flex",alignItems:"center",justifyContent:"center"}}><svg viewBox="0 0 24 24" fill="none" stroke={s.ic} strokeWidth="2" width="12" height="12"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div><div><div style={{fontSize:11,fontWeight:700,color:C.charcoal}}>{title}</div><div style={{fontSize:10,color:C.gray50}}>{sub}</div></div></div><div style={{fontSize:20,fontWeight:800,padding:"9px 13px",color:s.n}}>{Number(value||0).toLocaleString("pt-BR")}</div></div>);}
function Chip({type,children}:{type:"r"|"ok"|"a"|"b"|"gr"|"p";children:React.ReactNode}){const s={r:{bg:C.redLt,c:C.red},ok:{bg:C.greenLt,c:C.greenDark},a:{bg:C.amberLt,c:C.amber},b:{bg:C.blueLt,c:"#0284C7"},gr:{bg:C.gray10,c:C.gray70},p:{bg:C.purpleLt,c:C.purple}}[type];return<span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:20,whiteSpace:"nowrap",background:s.bg,color:s.c,display:"inline-block"}}>{children}</span>;}
function Pager({page,total,onPage}:{page:number;total:number;onPage:(p:number)=>void}){const pages=Math.ceil(total/PER);if(!total)return null;const s=(page-1)*PER+1,e=Math.min(page*PER,total);const btns:number[]=[];for(let p=Math.max(1,page-3);p<=Math.min(pages,page+3);p++)btns.push(p);return(<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderTop:`1px solid ${C.border}`,background:C.gray05}}><span style={{fontSize:11,color:C.gray50}}>{s.toLocaleString("pt-BR")}–{e.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")}</span><div style={{display:"flex",gap:3}}>{[{l:"‹",p:page-1,d:page<=1},...btns.map(p=>({l:String(p),p,d:false,a:p===page})),{l:"›",p:page+1,d:page>=pages}].map((b,i)=><button key={i} disabled={b.d} onClick={()=>!b.d&&onPage(b.p)} style={{fontFamily:"inherit",fontSize:11,fontWeight:600,padding:"4px 9px",borderRadius:6,border:`1px solid ${C.border}`,background:(b as{a?:boolean}).a?C.charcoal:C.white,color:(b as{a?:boolean}).a?"#fff":C.gray70,cursor:b.d?"default":"pointer",opacity:b.d?.35:1}}>{b.l}</button>)}</div></div>);}
function Empty(){return<div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"44px 22px",gap:9,color:C.gray50}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="36" height="36" style={{opacity:.3}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><strong style={{fontSize:13,color:C.charcoal}}>Nenhum resultado</strong></div>;}
function TableWrap({cols,headers,children,empty}:{cols:string;headers:string[];children:React.ReactNode;empty:boolean}){return(<div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:16,boxShadow:"0 1px 4px rgba(0,0,0,.06)",overflow:"hidden"}}><div style={{display:"grid",gridTemplateColumns:cols,padding:"0 14px",background:C.gray05,borderBottom:`1px solid ${C.border}`}}>{headers.map(h=><div key={h} style={{padding:"9px 7px",fontSize:10,fontWeight:700,color:C.gray50,textTransform:"uppercase",letterSpacing:".5px"}}>{h}</div>)}</div><div>{empty?<Empty/>:children}</div></div>);}
function TR({cols,children,bg}:{cols:string;children:React.ReactNode;bg?:string}){return<div style={{display:"grid",gridTemplateColumns:cols,padding:"0 14px",borderBottom:`1px solid ${C.border}`,alignItems:"center",background:bg||"transparent"}}>{children}</div>;}
function TD({children,style}:{children:React.ReactNode;style?:React.CSSProperties}){return<div style={{padding:"8px 7px",fontSize:11,color:C.ink,minWidth:0,...style}}>{children}</div>;}
function CNPJCell({cnpj,sub}:{cnpj:string;sub?:string}){return<TD><span style={{fontFamily:"monospace",fontSize:"10.5px",fontWeight:600,color:C.charcoal}}>{cnpj}</span>{sub&&<div style={{fontSize:10,color:C.gray50,marginTop:1}}>{sub}</div>}</TD>;}
function RazaoCell({razao,grupo}:{razao:string;grupo:string}){return<TD><div title={razao} style={{fontWeight:600,color:C.charcoal,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{razao}</div><div style={{fontSize:10,color:C.gray50,marginTop:1}}>{grupo}</div></TD>;}
function SI({value,onChange,placeholder}:{value:string;onChange:(v:string)=>void;placeholder:string}){return(<div style={{position:"relative",flex:1,minWidth:180,maxWidth:340}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13" style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",opacity:.4,pointerEvents:"none"}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{width:"100%",fontFamily:"inherit",fontSize:12,padding:"8px 10px 8px 32px",border:`1px solid ${C.border}`,borderRadius:10,background:C.white,color:C.ink,outline:"none"}}/></div>);}
function Sel({value,onChange,children}:{value:string;onChange:(v:string)=>void;children:React.ReactNode}){return<select value={value} onChange={e=>onChange(e.target.value)} style={{fontFamily:"inherit",fontSize:12,padding:"7px 10px",border:`1px solid ${C.border}`,borderRadius:10,background:C.white,color:C.ink,outline:"none",cursor:"pointer"}}>{children}</select>;}
function EqSel({value,onChange}:{value:string;onChange:(v:string)=>void}){return(<Sel value={value} onChange={onChange}><option value="">Todas as equipes</option>{EQUIPES_OPTIONS.map(g=><optgroup key={g.group} label={g.group}>{g.items.map(eq=><option key={eq} value={eq}>{eq}</option>)}</optgroup>)}</Sel>);}
function BtnEx({onClick}:{onClick:()=>void}){return(<button onClick={onClick} style={{display:"inline-flex",alignItems:"center",gap:5,fontFamily:"inherit",fontSize:11,fontWeight:600,padding:"7px 13px",borderRadius:10,border:`1px solid ${C.border}`,background:C.white,color:C.gray70,cursor:"pointer",whiteSpace:"nowrap"}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Exportar Excel</button>);}

// ── Processamento (inline) ──
function processarDados(rawS3D:unknown[][],rawCNPJa:Record<string,unknown[][]>):Empresa[]{
  const hS=(rawS3D[0] as string[]).map(h=>String(h).trim());const cS:Record<string,number>={};hS.forEach((h,i)=>{cS[h]=i;});
  const s3d:Record<string,Record<string,unknown>>={};
  for(let i=1;i<rawS3D.length;i++){const row=rawS3D[i] as unknown[];const cnpj=fmtDoc(row[cS["CNPJ"]]);if(!cnpj)continue;const tr=String(row[cS["Tags"]]||"").trim();const tags=tr?tr.split(",").map(t=>t.trim()).filter(t=>t&&t!=="CX"):[];s3d[cnpj]={razao:String(row[cS["Razão social"]]||"").trim().substring(0,60),regime:String(row[cS["Regime"]]||"").trim(),ie:String(row[cS["Inscrições Estaduais"]]||"").trim(),isento:String(row[cS["Empresa Isenta"]]||"").trim(),im:String(row[cS["Insc. Municipal"]]||"").trim(),uf:String(row[cS["UF"]]||"").trim(),grupo:String(row[cS["Grupo de Empresas"]]||"").trim().substring(0,40),tags,is_cc:isCC(tags)};}
  const estabSheet=rawCNPJa["Estabelecimentos"];const hE=(estabSheet[1] as string[]).map(h=>String(h||"").trim());const cE:Record<string,number>={};const dataCands:number[]=[];hE.forEach((h,i)=>{cE[h]=i;const hl=h.toLowerCase();if(h.includes("Simples")&&h.includes("Optante"))cE["_simples"]=i;if(h.includes("Simples")&&h.includes("Inclus"))cE["_simples_inc"]=i;if((h==="Situação Cadastral"||(h.includes("Situa")&&h.includes("Cadastral")))&&!h.includes("Data")&&!h.includes("Motivo"))cE["_sit"]=i;if(h.includes("Situa")&&h.includes("Cadastral")&&h.includes("Data"))cE["_sit_data"]=i;if(/(data|desde|encerr|baixa|extin)/.test(hl)&&!hl.includes("especial"))dataCands.push(i);if(h.includes("Motivo"))cE["_sit_motivo"]=i;});
  // prioriza colunas de data ligadas à situação cadastral / baixa
  dataCands.sort((a,b)=>{const sc=(i:number)=>{const h=hE[i].toLowerCase();if(h.includes("cadastral"))return 0;if(h.includes("baixa")||h.includes("extin")||h.includes("encerr"))return 1;return 2;};return sc(a)-sc(b);});
  const estab:Record<string,Record<string,unknown>>={};
  const pickDate=(row:unknown[])=>{const order=cE["_sit_data"]!==undefined?[cE["_sit_data"],...dataCands.filter(i=>i!==cE["_sit_data"])]:dataCands;for(const i of order){const v=row[i];if(v==null||String(v).trim()===""||String(v).trim()==="-")continue;const d=parseAnyDate(v);if(d)return v;}return null;};
  for(let i=2;i<estabSheet.length;i++){const row=estabSheet[i] as unknown[];let cr=String(row[cE["CNPJ"]]||"").trim().replace(/\D/g,"");cr=cr.padStart(14,"0");const cnpj=cr.length===14?cr.substring(0,2)+"."+cr.substring(2,5)+"."+cr.substring(5,8)+"/"+cr.substring(8,12)+"-"+cr.substring(12):cr;estab[cnpj]={sit:String(row[cE["_sit"]!==undefined?cE["_sit"]:cE["Situação Cadastral"]]||"").trim(),sit_data:pickDate(row),sit_motivo:String(row[cE["_sit_motivo"]!==undefined?cE["_sit_motivo"]:cE["Situação Motivo"]]||"").trim(),simples:String(row[cE["_simples"]!==undefined?cE["_simples"]:cE["Simples Nacional Optante"]]||"").trim(),simples_inc:row[cE["_simples_inc"]!==undefined?cE["_simples_inc"]:cE["Simples Nacional Inclusão"]],uf:String(row[cE["Estado"]]||"").trim(),cnae:String(row[cE["Atividade Principal Código"]]||"").trim().padStart(7,"0"),cnae_desc:String(row[cE["Atividade Principal"]]||"").trim()};}
  const inscSheet=rawCNPJa["Inscrições"];const hI=(inscSheet[1] as string[]).map(h=>String(h).trim());const cI:Record<string,number>={};hI.forEach((h,i)=>{cI[h]=i;});
  const iesMap:Record<string,IE[]>={};
  for(let i=2;i<inscSheet.length;i++){const row=inscSheet[i] as unknown[];let cr=String(row[cI["CNPJ"]]||"").trim().replace(/\D/g,"");cr=cr.length<14?("00000000000000"+cr).slice(-14):cr;const cnpj=cr.length===14?cr.substring(0,2)+"."+cr.substring(2,5)+"."+cr.substring(5,8)+"/"+cr.substring(8,12)+"-"+cr.substring(12):cr;if(!iesMap[cnpj])iesMap[cnpj]=[];const ie_raw=String(row[cI["Inscrição Estadual"]]||"").trim();iesMap[cnpj].push({uf:String(row[cI["Estado"]]||"").trim(),ie_raw,ie_num:normIE(ie_raw),tipo:String(row[cI["Tipo"]]||"").trim(),hab:String(row[cI["Habilitada"]]||"").trim(),sit:String(row[cI["Situação Cadastral"]]||"").trim()});}
  const hist:Record<string,Hist[]>={};
  if(rawCNPJa["Histórico"]){const hH=rawCNPJa["Histórico"][1] as string[]||[];const cH:Record<string,number>={};hH.forEach((h,i)=>{cH[h]=i;});for(let i=2;i<rawCNPJa["Histórico"].length;i++){const row=rawCNPJa["Histórico"][i] as unknown[];let cr=String(row[cH["CNPJ"]]||"").trim().replace(/\D/g,"");cr=cr.length<14?("00000000000000"+cr).slice(-14):cr;const cnpj=cr.length===14?cr.substring(0,2)+"."+cr.substring(2,5)+"."+cr.substring(5,8)+"/"+cr.substring(8,12)+"-"+cr.substring(12):cr;if(!cnpj||cnpj==="—")continue;if(!hist[cnpj])hist[cnpj]=[];hist[cnpj].push({regime:String(row[cH["Regime Tributário"]]||"").trim(),data_ini:row[cH["Data Inicial"]],data_fim:row[cH["Data Final"]],motivo:String(row[cH["Motivo de Encerramento"]]||"").trim()});}Object.keys(hist).forEach(cnpj=>{hist[cnpj].sort((a,b)=>{const da=typeof a.data_fim==="number"?a.data_fim:(a.data_fim?new Date(a.data_fim as string).getTime():0);const db=typeof b.data_fim==="number"?b.data_fim:(b.data_fim?new Date(b.data_fim as string).getTime():0);return db-da;});});}
  const atividades:Record<string,Atividade[]>={};
  if(rawCNPJa["Atividades"]){const hA=rawCNPJa["Atividades"][1] as string[]||[];const cA:Record<string,number>={};hA.forEach((h,i)=>{cA[h]=i;});for(let i=2;i<rawCNPJa["Atividades"].length;i++){const row=rawCNPJa["Atividades"][i] as unknown[];let cr=String(row[cA["CNPJ"]]||"").trim().replace(/\D/g,"");cr=cr.length<14?("00000000000000"+cr).slice(-14):cr;const cnpj=cr.length===14?cr.substring(0,2)+"."+cr.substring(2,5)+"."+cr.substring(5,8)+"/"+cr.substring(8,12)+"-"+cr.substring(12):cr;if(!cnpj||cnpj==="—")continue;if(!atividades[cnpj])atividades[cnpj]=[];atividades[cnpj].push({principal:String(row[cA["Principal"]]||"").trim()==="Sim",cod:String(row[cA["Atividade Econômica Código"]]||"").trim().padStart(7,"0"),desc:String(row[cA["Atividade Econômica"]]||"").trim()});}}
  const socios:Record<string,Socio[]>={};
  if(rawCNPJa["Sócios"]){const hSo=rawCNPJa["Sócios"][1] as string[]||[];const cSo:Record<string,number>={};hSo.forEach((h,i)=>{cSo[h]=i;});for(let i=2;i<rawCNPJa["Sócios"].length;i++){const row=rawCNPJa["Sócios"][i] as unknown[];let cr=String(row[cSo["CNPJ"]]||"").trim().replace(/\D/g,"");cr=cr.length<14?("00000000000000"+cr).slice(-14):cr;const cnpj=cr.length===14?cr.substring(0,2)+"."+cr.substring(2,5)+"."+cr.substring(5,8)+"/"+cr.substring(8,12)+"-"+cr.substring(12):cr;if(!cnpj||cnpj==="—")continue;if(!socios[cnpj])socios[cnpj]=[];socios[cnpj].push({nome:String(row[cSo["Nome"]]||"").trim(),doc:String(row[cSo["CPF / CNPJ"]]||"").trim(),tipo:String(row[cSo["Tipo"]]||"").trim(),qualif:String(row[cSo["Qualificação"]]||"").trim(),data_entrada:row[cSo["Data de Entrada"]]});}}
  const novosDados:Empresa[]=[];
  Object.keys(s3d).forEach(cnpj=>{
    const s=s3d[cnpj];const e=estab[cnpj]||{};const consultado=!!estab[cnpj];
    const ie_list=iesMap[cnpj]||[];const isento=isentoSim(s.isento as string);
    const ies_s3d:{uf:string;raw:string;num:string}[]=[];const ie_s3d_str=String(s.ie||"");
    const re2=/UF:\s*(\S+)\s*-\s*IE:\s*(\S+)/g;let m2;while((m2=re2.exec(ie_s3d_str))!==null){ies_s3d.push({uf:m2[1].trim(),raw:m2[2].trim(),num:normIE(m2[2].trim())});}
    if(!ies_s3d.length){const re3=/IE:\s*([^\s,;\n]+)/g;let m3;while((m3=re3.exec(ie_s3d_str))!==null){ies_s3d.push({uf:"?",raw:m3[1].trim(),num:normIE(m3[1].trim())});}}
    const ie_probs:IEProb[]=[];
    if(!consultado)ie_probs.push({tipo:"NAO_CONSULTADO",desc:"CNPJ não encontrado na consulta do CNPJá"});
    if(consultado&&isento&&ie_list.length>0)ie_probs.push({tipo:"ERRO_ISENTA_COM_IE",desc:`S3D marcado como Isenta mas CNPJá tem ${ie_list.length} IE(s)`});
    if(consultado&&!isento&&ies_s3d.length===0&&ie_list.length===0)ie_probs.push({tipo:"SEM_IE",desc:"Não isenta e sem IE em nenhuma fonte"});
    if(consultado)ies_s3d.forEach(ie_s=>{const match=ie_list.find(x=>x.ie_num===ie_s.num);if(!match)ie_probs.push({tipo:"IE_NAO_ENCONTRADA",ie:ie_s.raw,uf:ie_s.uf,ie_s3d:ie_s.raw,ie_cnpja:"",sit_cnpja:"",desc:`IE ${ie_s.raw} cadastrada no S3D não encontrada no CNPJá`});else if(match.hab==="Não")ie_probs.push({tipo:"IE_NAO_HABILITADA",ie:ie_s.raw,uf:ie_s.uf,ie_s3d:ie_s.raw,ie_cnpja:match.ie_raw,sit_cnpja:match.sit,desc:`IE ${ie_s.raw} não habilitada no CNPJá (${match.sit})`});else if(match.sit!=="Sem restrição")ie_probs.push({tipo:"IE_RESTRICAO",ie:ie_s.raw,uf:ie_s.uf,ie_s3d:ie_s.raw,ie_cnpja:match.ie_raw,sit_cnpja:match.sit,desc:`IE ${ie_s.raw} com restrição: ${match.sit}`});});
    const nums_s3d=ies_s3d.map(x=>x.num);if(consultado)ie_list.forEach(ie_c=>{if(!nums_s3d.includes(ie_c.ie_num)&&!isento&&ie_c.hab==="Sim")ie_probs.push({tipo:"IE_FALTANDO_S3D",ie:ie_c.ie_raw,uf:ie_c.uf,ie_s3d:"",ie_cnpja:ie_c.ie_raw,sit_cnpja:ie_c.sit,desc:`IE ${ie_c.uf}: ${ie_c.ie_raw} consta no CNPJá mas não está no S3D`});});
    const ie_status=!consultado?"nao_consultado":isento&&ie_list.length===0?"isenta_ok":isento&&ie_list.length>0?"erro_isenta":ie_probs.length===0?"ok":"problema";
    const sn_s3d=isSN(s.regime as string);const sn_cnpja=(String(e.simples||"")).toLowerCase()==="sim";
    const cnae=String(e.cnae||"");const cnae_obrig=CNAE_MAP[cnae]||null;
    const ie_habilitada=ies_s3d.some(ie_s=>{const m=ie_list.find(x=>x.ie_num===ie_s.num);return m&&m.hab==="Sim";})||ie_list.some(x=>x.hab==="Sim");
    novosDados.push({cnpj,razao:s.razao as string,grupo:s.grupo as string,regime:s.regime as string,is_cpf:isCPF(cnpj),uf:String(s.uf||e.uf||""),isento:s.isento as string,ie_s3d:s.ie as string,im:s.im as string,tags:s.tags as string[],tags_arr:s.tags as string[],is_cc:s.is_cc as boolean,sit:String(e.sit||"Não encontrada"),sit_data:e.sit_data,sit_motivo:String(e.sit_motivo||""),simples_cnpja:String(e.simples||"Não"),simples_inc:e.simples_inc,ies:ie_list,ie_status,ie_probs,ies_s3d,sn_s3d,sn_cnpja,sn_div:Boolean((sn_s3d&&!sn_cnpja)||(sn_cnpja&&!sn_s3d)),cnae,cnae_desc:String(e.cnae_desc||""),cnae_obrig,ie_habilitada,consultado,hist:hist[cnpj]||[],atividades_all:atividades[cnpj]||[],socios_atuais:socios[cnpj]||[]});
  });
  return novosDados;
}

function buildResumoGeral(d:Empresa[],tf:string):ResumoRow[]{
  const rows:ResumoRow[]=[];
  d.forEach(e=>{
    if(e.is_cc||e.is_cpf)return;if(tf&&!e.tags_arr.includes(tf))return;
    if(e.consultado&&(SIT_PROB.includes(e.sit)))rows.push({cnpj:e.cnpj,razao:e.razao,grupo:e.grupo,tags_arr:e.tags_arr,cat:"sit",problema:e.sit,detalhe:(e.sit_motivo?e.sit_motivo+" ":"")+(e.sit_data?`desde ${fmtDataHist(e.sit_data)}`:"")});
    (e.ie_probs||[]).forEach(p=>{const lbl=p.tipo==="SEM_IE"?"Sem IE":p.tipo==="IE_NAO_ENCONTRADA"?"Não encontrada":p.tipo==="IE_FALTANDO_S3D"?"Faltando no S3D":p.tipo==="IE_NAO_HABILITADA"?"Não habilitada":p.tipo==="IE_RESTRICAO"?"Restrição":p.tipo==="ERRO_ISENTA_COM_IE"?"Isenta c/ IE":p.tipo==="NAO_CONSULTADO"?"Não consultado":p.tipo;rows.push({cnpj:e.cnpj,razao:e.razao,grupo:e.grupo,tags_arr:e.tags_arr,cat:"ie",problema:lbl,detalhe:p.desc});});
    if(e.consultado&&e.sn_div)rows.push({cnpj:e.cnpj,razao:e.razao,grupo:e.grupo,tags_arr:e.tags_arr,cat:"simples",problema:"Divergência",detalhe:`S3D: ${e.regime||"Sem regime"} | CNPJá optante: ${e.sn_cnpja?"Sim":"Não"}`});
    if(e.cnae_obrig==="S"&&!e.ie_habilitada){const temIeInativa=e.ies&&e.ies.length>0;rows.push({cnpj:e.cnpj,razao:e.razao,grupo:e.grupo,tags_arr:e.tags_arr,cat:"cnae",problema:temIeInativa?"IE cadastrada, inativa":"Sem IE nenhuma",detalhe:`CNAE ${fmtCnae(e.cnae)} (${e.cnae_desc||""}) exige IE`});}
  });
  return rows;
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

export default function AuditoriaCadastral() {
  const [dados,setDados]=useState<Empresa[]>([]);
  const [activeTab,setActiveTab]=useState<TabId>("upload");
  const [tagFilter,setTagFilter]=useState("");
  const [rawS3D,setRawS3D]=useState<unknown[][]|null>(null);
  const [rawCNPJa,setRawCNPJa]=useState<Record<string,unknown[][]>|null>(null);
  const [s3dName,setS3DName]=useState(""); const [cnpjaName,setCnpjaName]=useState("");
  const [processando,setProcessando]=useState(false); const [salvando,setSalvando]=useState(false);
  const [carregando,setCarregando]=useState(true);
  const [ultimoUpload,setUltimoUpload]=useState<{fileName:string;uploadedAt:string}|null>(null);
  const [snapCnaeDate,setSnapCnaeDate]=useState<string|null>(null);
  const [snapSociosDate,setSnapSociosDate]=useState<string|null>(null);
  const [snapCnaeData,setSnapCnaeData]=useState<{savedAt:string;empresas:Record<string,string[]>}|null>(null);
  const [snapSociosData,setSnapSociosData]=useState<{savedAt:string;empresas:Record<string,string[]>}|null>(null);
  const [toast,setToast]=useState({msg:"",show:false});
  const toastTimer=useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [openIEs,setOpenIEs]=useState<Set<string>>(new Set());
  const [baseAtiva,setBaseAtiva]=useState<{competencia:string;total:number}|null>(null);
  const [loadingBase,setLoadingBase]=useState(false);
  const [pendingReprocess,setPendingReprocess]=useState(false);



  const [pages,setPages]=useState<Record<string,number>>({resumogeral:1,sit:1,ie:1,simples:1,cc:1,cnae:1,cnaebase:1,socios:1,cpf:1});
  const sp=(tab:string,p:number)=>setPages(prev=>({...prev,[tab]:p}));

  const [searchRG,setSearchRG]=useState(""); const [filtRG,setFiltRG]=useState("all");
  const [searchSit,setSearchSit]=useState(""); const [filtSit,setFiltSit]=useState("all");
  const [searchIE,setSearchIE]=useState(""); const [filtIE,setFiltIE]=useState("problemas");
  const [searchSimples,setSearchSimples]=useState(""); const [filtSimples,setFiltSimples]=useState("all");
  const [searchCC,setSearchCC]=useState(""); const [filtCC,setFiltCC]=useState("all");
  const [searchCnae,setSearchCnae]=useState(""); const [filtCnae,setFiltCnae]=useState("all");
  const [searchCnaeBase,setSearchCnaeBase]=useState(""); const [filtCnaeBase,setFiltCnaeBase]=useState("all");
  const [searchSocios,setSearchSocios]=useState(""); const [filtSocios,setFiltSocios]=useState("all");
  const [searchCpf,setSearchCpf]=useState(""); const [filtCpf,setFiltCpf]=useState("all");

  const showToast=useCallback((msg:string)=>{setToast({msg,show:true});clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(t=>({...t,show:false})),3000);},[]);

  useEffect(()=>{(async()=>{setCarregando(true);try{const res=await carregarDadosSupabase();if(res&&res.dados.length>0){setDados(res.dados);setUltimoUpload({fileName:res.fileName,uploadedAt:res.uploadedAt});setActiveTab("resumogeral");}const{data:sc}=await supabase.from("auditoria_snapshots").select("saved_at").eq("key","cnae").single();if(sc)setSnapCnaeDate(sc.saved_at);const{data:ss}=await supabase.from("auditoria_snapshots").select("saved_at").eq("key","socios").single();if(ss)setSnapSociosDate(ss.saved_at);}catch(e){console.error(e);}setCarregando(false);})();},[]);
  useEffect(()=>{if(snapCnaeDate){supabase.from("auditoria_snapshots").select("data").eq("key","cnae").single().then(({data})=>{if(data)setSnapCnaeData(data.data as typeof snapCnaeData);});}},[snapCnaeDate]);
  useEffect(()=>{if(snapSociosDate){supabase.from("auditoria_snapshots").select("data").eq("key","socios").single().then(({data})=>{if(data)setSnapSociosData(data.data as typeof snapSociosData);});}},[snapSociosDate]);

  const tagMatch=useCallback((e:Empresa)=>{if(!tagFilter)return true;return e.tags_arr.includes(tagFilter);},[tagFilter]);

  const handleS3D=useCallback((file:File|null)=>{if(!file)return;showToast("Lendo S3D...");const r=new FileReader();r.onload=(ev)=>{try{const wb=XLSX.read(ev.target?.result,{type:"binary"});const raw=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:""}) as unknown[][];setRawS3D(raw);setS3DName(file.name);showToast(`S3D carregado! (${raw.length-1} empresas)`);}catch(ex:unknown){showToast("Erro: "+(ex instanceof Error?ex.message:String(ex)));}};r.readAsBinaryString(file);},[showToast]);
  const handleCNPJa=useCallback((file:File|null)=>{if(!file)return;showToast("Lendo CNPJá...");const r=new FileReader();r.onload=(ev)=>{try{const wb=XLSX.read(ev.target?.result,{type:"binary"});const map:Record<string,unknown[][]>={};["Estabelecimentos","Inscrições","Histórico","Atividades","Sócios"].forEach(sh=>{if(wb.Sheets[sh])map[sh]=XLSX.utils.sheet_to_json(wb.Sheets[sh],{header:1,defval:""}) as unknown[][];});setRawCNPJa(map);setCnpjaName(file.name);showToast("CNPJá carregado!");}catch(ex:unknown){showToast("Erro: "+(ex instanceof Error?ex.message:String(ex)));}};r.readAsBinaryString(file);},[showToast]);
  const carregarS3DdaBase=useCallback(async()=>{
    setLoadingBase(true);
    showToast("Carregando S3D da Base Empresas ativa...");
    try{
      const resumo=await getEmpresaBaseResumo();
      if(!resumo.importacao){showToast("Nenhuma Base Empresas ativa. Importe em /base-empresas");return;}
      const linhas=await listEmpresasAtivas();
      if(!linhas.length){showToast("Base ativa está vazia");return;}
      const matrix=matrizS3DBase(linhas);
      const nome=`Base Empresas ${String(resumo.competencia||"").slice(0,7)} · ${linhas.length} empresas`;
      setRawS3D(matrix);
      setS3DName(nome);
      setBaseAtiva({competencia:String(resumo.competencia||""),total:linhas.length});
      if(rawCNPJa){setPendingReprocess(true);showToast(`S3D atualizado (${linhas.length}). Reprocessando…`);}
      else if(dados.length){
        const atualizados=atualizarAuditoriaComBase(linhas,dados);
        setDados(atualizados);
        setActiveTab("resumogeral");
        setSalvando(true);
        try{
          await salvarDadosSupabase(atualizados,crypto.randomUUID(),nome);
          const now=new Date().toISOString();
          setUltimoUpload({fileName:nome,uploadedAt:now});
          showToast(`${atualizados.length.toLocaleString("pt-BR")} empresas atualizadas com a Base Empresas ativa!`);
        }catch(e){
          console.warn(e);
          showToast("Base atualizada na tela, mas falhou ao salvar no banco.");
        }finally{setSalvando(false);}
      }else{showToast(`S3D montado (${linhas.length}). Envie o CNPJá para processar.`);}
    }catch(e:unknown){showToast("Erro ao carregar Base: "+(e instanceof Error?e.message:String(e)));}
    finally{setLoadingBase(false);}
  },[showToast,rawCNPJa,dados]);

  useEffect(()=>{(async()=>{try{const resumo=await getEmpresaBaseResumo();if(resumo.importacao){const linhas=await listEmpresasAtivas();setBaseAtiva({competencia:String(resumo.competencia||""),total:linhas.length});}}catch{/* ignore */}})();},[]);


  const processar=useCallback(()=>{if(!rawS3D||!rawCNPJa)return;setProcessando(true);showToast("Processando...");setTimeout(()=>{try{const novosDados=processarDados(rawS3D,rawCNPJa);setDados(novosDados);setActiveTab("resumogeral");setProcessando(false);setSalvando(true);const sessionId=crypto.randomUUID();salvarDadosSupabase(novosDados,sessionId,s3dName).then(()=>{setUltimoUpload({fileName:s3dName,uploadedAt:new Date().toISOString()});showToast(`✓ ${novosDados.length.toLocaleString("pt-BR")} empresas salvas no banco!`);}).catch(()=>showToast("⚠ Dados processados mas não foi possível salvar no banco.")).finally(()=>setSalvando(false));}catch(ex:unknown){showToast("Erro: "+(ex instanceof Error?ex.message:String(ex)));setProcessando(false);}},50);},[rawS3D,rawCNPJa,s3dName,showToast]);

  useEffect(()=>{if(pendingReprocess&&rawS3D&&rawCNPJa){setPendingReprocess(false);processar();}},[pendingReprocess,rawS3D,rawCNPJa,processar]);

  const salvarSnapshotCnae=async()=>{if(!dados.length){showToast("Carregue os dados primeiro.");return;}try{const snap:Record<string,string[]>={};dados.forEach(e=>{if(!e.is_cc&&!e.is_cpf)snap[e.cnpj]=(e.atividades_all||[]).map((a:Atividade)=>a.cod).sort();});const payload={savedAt:new Date().toISOString(),totalEmpresas:dados.length,empresas:snap};await must(supabase.from("auditoria_snapshots").upsert({key:"cnae",data:payload,saved_at:new Date().toISOString()} as never));setSnapCnaeDate(new Date().toISOString());showToast("Snapshot de CNAEs salvo!");}catch{showToast("⚠ Não foi possível salvar o snapshot no banco.");}};
  const salvarSnapshotSocios=async()=>{if(!dados.length){showToast("Carregue os dados primeiro.");return;}try{const snap:Record<string,string[]>={};dados.forEach(e=>{if(!e.is_cc&&!e.is_cpf)snap[e.cnpj]=(e.socios_atuais||[]).map((s:Socio)=>s.doc||s.nome).sort();});const payload={savedAt:new Date().toISOString(),empresas:snap};await must(supabase.from("auditoria_snapshots").upsert({key:"socios",data:payload,saved_at:new Date().toISOString()} as never));setSnapSociosDate(new Date().toISOString());showToast("Snapshot de sócios salvo!");}catch{showToast("⚠ Não foi possível salvar o snapshot no banco.");}};

  // ── Derived ──
  const naoCC=useMemo(()=>dados.filter(e=>!e.is_cc&&!e.is_cpf&&tagMatch(e)),[dados,tagMatch]);
  const allRG=useMemo(()=>dados.length?buildResumoGeral(dados,tagFilter):[],[dados,tagFilter]);
  const porCatRG=useMemo(()=>{const p:Record<string,number>={sit:0,ie:0,simples:0,cnae:0};allRG.forEach(r=>{p[r.cat]=(p[r.cat]||0)+1;});return p;},[allRG]);
  const filtRGList=useMemo(()=>{let p=allRG;if(filtRG!=="all")p=p.filter(r=>r.cat===filtRG);if(searchRG)p=p.filter(r=>(r.cnpj+r.razao+r.grupo).toLowerCase().includes(searchRG.toLowerCase()));return p;},[allRG,filtRG,searchRG]);
  const filtSitList=useMemo(()=>{let p=naoCC;if(filtSit==="prob")p=p.filter(e=>SIT_PROB.includes(e.sit));else if(filtSit!=="all")p=p.filter(e=>e.sit===filtSit);if(searchSit)p=p.filter(e=>e.cnpj.includes(searchSit)||e.razao.toLowerCase().includes(searchSit.toLowerCase()));return p;},[naoCC,filtSit,searchSit]);
  // Alerta de baixas LR/LP — prazos de entrega de ECD/ECF do evento de baixa
  const baixasAlerta=useMemo(()=>{
    return naoCC.filter(e=>e.sit==="Baixada"&&isLrLp(e.regime)&&isMatriz(e.cnpj)).map(e=>{
      const histFim=(e.hist||[]).map(h=>parseAnyDate(h.data_fim)).filter(Boolean).sort((a,b)=>b!.getTime()-a!.getTime())[0]||null;
      const ev=parseAnyDate(e.sit_data)||histFim;
      const origem=parseAnyDate(e.sit_data)?"cnpjá":histFim?"histórico":"";
      const ecd=ev?prazoECD(ev):null;
      const ecf=ev?prazoECF(ev):null;
      return {e,ev,origem,ecd,ecf,sEcd:ecd?situacaoPrazo(ecd):null,sEcf:ecf?situacaoPrazo(ecf):null};
    }).sort((a,b)=>{const da=a.sEcd?.dias??9999,db=b.sEcd?.dias??9999;return da-db;});
  },[naoCC]);
  const baixasVencidas=useMemo(()=>baixasAlerta.filter(b=>(b.sEcd&&b.sEcd.dias<0)||(b.sEcf&&b.sEcf.dias<0)).length,[baixasAlerta]);
  const baixasProximas=useMemo(()=>baixasAlerta.filter(b=>(b.sEcd&&b.sEcd.dias>=0&&b.sEcd.dias<=30)||(b.sEcf&&b.sEcf.dias>=0&&b.sEcf.dias<=30)).length,[baixasAlerta]);
  const allIE=useMemo(()=>dados.filter(e=>!e.is_cc&&!e.is_cpf),[dados]);

  const {filtIEList,naoConsult,isentaOk,ieOk,faltando,naoHab,problemas,dpSemFiscal}=useMemo(()=>{const hp=(t:string)=>allIE.filter(e=>e.ie_probs&&e.ie_probs.some(p=>p.tipo===t));const nc=allIE.filter(e=>e.ie_status==="nao_consultado");const io=allIE.filter(e=>e.ie_status==="isenta_ok");const iok=allIE.filter(e=>e.ie_status==="ok");const fa=hp("IE_FALTANDO_S3D");const nh=hp("IE_NAO_HABILITADA");const pr=allIE.filter(e=>e.ie_probs&&e.ie_probs.length>0);const dpSF=pr.filter(e=>e.tags_arr.some(t=>DP_TAGS.includes(t))&&!e.tags_arr.some(t=>FISCAL_TAGS.includes(t)));let list=filtIE==="nao_consultado"?nc:filtIE==="isenta_ok"?io:filtIE==="ie_ok"?iok:filtIE==="faltando"?fa:filtIE==="nao_hab"?nh:filtIE==="dp_sem_fiscal"?dpSF:filtIE==="all"?allIE:pr;if(searchIE)list=list.filter(e=>e.cnpj.includes(searchIE)||e.razao.toLowerCase().includes(searchIE.toLowerCase()));return{filtIEList:list,naoConsult:nc,isentaOk:io,ieOk:iok,faltando:fa,naoHab:nh,problemas:pr,dpSemFiscal:dpSF};},[allIE,filtIE,searchIE]);
  const {filtSimpList,simDiv,simOk,simReentrou,simComHist,simNaoConsult,simAll}=useMemo(()=>{const all=dados.filter(e=>!e.is_cc&&!e.is_cpf);const nc=all.filter(e=>!e.consultado);const dv=all.filter(e=>e.consultado&&e.sn_div);const ok=all.filter(e=>e.consultado&&!e.sn_div&&(e.sn_s3d||e.sn_cnpja));const re=all.filter(reentrouSimples);const ch=all.filter(e=>e.hist&&e.hist.length>0);let p=filtSimples==="div"?dv:filtSimples==="ok"?ok:filtSimples==="reentrou"?re:filtSimples==="com_hist"?ch:filtSimples==="nao_consultado"?nc:all;if(searchSimples)p=p.filter(e=>e.cnpj.includes(searchSimples)||e.razao.toLowerCase().includes(searchSimples.toLowerCase()));return{filtSimpList:p,simDiv:dv,simOk:ok,simReentrou:re,simComHist:ch,simNaoConsult:nc,simAll:all};},[dados,filtSimples,searchSimples]);
  const {filtCCList,ccAll}=useMemo(()=>{const all=dados.filter(e=>e.is_cc&&tagMatch(e));let p=filtCC==="all"?all:all.filter(e=>e.sit===filtCC);if(searchCC)p=p.filter(e=>e.cnpj.includes(searchCC)||e.razao.toLowerCase().includes(searchCC.toLowerCase()));return{filtCCList:p,ccAll:all};},[dados,filtCC,searchCC,tagMatch]);
  const {filtCnaeList,cnaeTotal,cnaePtSemIe,cnaePtInativa,cnaeCond,cnaeNaoMap,cnaeOk,cnaeNaoExige}=useMemo(()=>{const all=dados.filter(e=>!e.is_cc&&!e.is_cpf&&e.consultado);const ptSI=all.filter(e=>e.cnae_obrig==="S"&&!e.ie_habilitada&&(!e.ies||!e.ies.length));const ptIN=all.filter(e=>e.cnae_obrig==="S"&&!e.ie_habilitada&&e.ies&&e.ies.length>0);const tot=all.filter(e=>e.cnae_obrig==="S"&&!e.ie_habilitada);const cond=all.filter(e=>e.cnae_obrig==="C");const nm=all.filter(e=>e.cnae&&!e.cnae_obrig);const ok=all.filter(e=>e.cnae_obrig==="S"&&e.ie_habilitada);const ne=all.filter(e=>e.cnae_obrig==="N");let p=filtCnae==="pendente_sem_ie"?ptSI:filtCnae==="pendente_inativa"?ptIN:filtCnae==="pendente"?tot:filtCnae==="condicional"?cond:filtCnae==="nao_mapeado"?nm:filtCnae==="ok"?ok:filtCnae==="nao_exige"?ne:all;if(searchCnae)p=p.filter(e=>e.cnpj.includes(searchCnae)||e.razao.toLowerCase().includes(searchCnae.toLowerCase())||(e.cnae||"").includes(searchCnae));return{filtCnaeList:p,cnaeTotal:tot,cnaePtSemIe:ptSI,cnaePtInativa:ptIN,cnaeCond:cond,cnaeNaoMap:nm,cnaeOk:ok,cnaeNaoExige:ne};},[dados,filtCnae,searchCnae]);
  const {filtCpfList,cpfAll,cpfSusp}=useMemo(()=>{const all=dados.filter(e=>e.is_cpf);const su=all.filter(e=>SIT_PROB.includes(e.sit));const ok=all.filter(e=>!SIT_PROB.includes(e.sit));let p=filtCpf==="susp"?su:filtCpf==="ok"?ok:all;if(searchCpf)p=p.filter(e=>e.cnpj.includes(searchCpf)||e.razao.toLowerCase().includes(searchCpf.toLowerCase()));return{filtCpfList:p,cpfAll:all,cpfSusp:su};},[dados,filtCpf,searchCpf]);
  const filtCnaeBaseList=useMemo(()=>{const all=dados.filter(e=>!e.is_cc&&!e.is_cpf);const withCmp=all.map(e=>{let _cmp:{temSnap:boolean;incluidos:string[];excluidos:string[];novo?:boolean}={temSnap:false,incluidos:[],excluidos:[]};if(snapCnaeData?.empresas){const ant=snapCnaeData.empresas[e.cnpj];if(ant===undefined){_cmp={temSnap:true,incluidos:[],excluidos:[],novo:true};}else{const atuais=(e.atividades_all||[]).map((a:Atividade)=>a.cod);_cmp={temSnap:true,incluidos:atuais.filter((c:string)=>!ant.includes(c)),excluidos:ant.filter((c:string)=>!atuais.includes(c))};}}return{...e,_cmp};});let p=filtCnaeBase==="alterados"?withCmp.filter(e=>e._cmp.temSnap&&(e._cmp.incluidos.length||e._cmp.excluidos.length)):filtCnaeBase==="novos"?withCmp.filter(e=>e._cmp.novo):withCmp;if(searchCnaeBase)p=p.filter(e=>e.cnpj.includes(searchCnaeBase)||e.razao.toLowerCase().includes(searchCnaeBase.toLowerCase()));return p;},[dados,filtCnaeBase,searchCnaeBase,snapCnaeData]);
  const filtSociosList=useMemo(()=>{const all=dados.filter(e=>!e.is_cc&&!e.is_cpf&&e.socios_atuais&&e.socios_atuais.length>0);const withCmp=all.map(e=>{let _cmp:{entraram:Socio[];sairam:string[];temSnap:boolean}={entraram:[],sairam:[],temSnap:false};if(snapSociosData?.empresas){const ant:string[]=snapSociosData.empresas[e.cnpj]||[];const atuais=(e.socios_atuais||[]).map((s:Socio)=>s.doc||s.nome);_cmp={temSnap:true,entraram:(e.socios_atuais||[]).filter((s:Socio)=>!ant.includes(s.doc||s.nome)),sairam:ant.filter((d:string)=>!atuais.includes(d))};}return{...e,_cmp};});let p=filtSocios==="alterados"?withCmp.filter(e=>e._cmp.temSnap&&(e._cmp.entraram.length||e._cmp.sairam.length)):withCmp;if(searchSocios)p=p.filter(e=>e.cnpj.includes(searchSocios)||e.razao.toLowerCase().includes(searchSocios.toLowerCase())||(e.socios_atuais||[]).some((s:Socio)=>s.nome.toLowerCase().includes(searchSocios.toLowerCase())));return p;},[dados,filtSocios,searchSocios,snapSociosData]);

  const handleExport=(tab:string)=>{const CL:Record<string,string>={sit:"Situação Cadastral",ie:"Inscrição Estadual",simples:"Simples Nacional",cnae:"CNAE"};if(tab==="resumogeral"){exportXlsx("auditoria_resumogeral.xlsx",["CNPJ","Razao","Grupo","Tags","Categoria","Problema","Detalhe"],filtRGList.map(r=>[r.cnpj,r.razao,r.grupo,(r.tags_arr||[]).join("; "),CL[r.cat]||r.cat,r.problema,r.detalhe]));}else if(tab==="sit"){exportXlsx("auditoria_sit.xlsx",["CNPJ","Razao","Grupo","UF","Situacao","Data","Motivo"],filtSitList.map(e=>[e.cnpj,e.razao,e.grupo,e.uf,e.sit,e.sit_data?fmtDataHist(e.sit_data):"",e.sit_motivo]));}else if(tab==="cnae"){exportXlsx("auditoria_cnae.xlsx",["CNPJ","Razao","Grupo","UF","CNAE","Atividade","Obrigatório IE","Tem IE Hab."],filtCnaeList.map(e=>[e.cnpj,e.razao,e.grupo,e.uf,fmtCnae(e.cnae),e.cnae_desc,e.cnae_obrig==="S"?"Sim":e.cnae_obrig==="N"?"Não":"Condicional",e.ie_habilitada?"Sim":"Não"]));}else if(tab==="simples"){exportXlsx("auditoria_simples.xlsx",["CNPJ","Razao","Grupo","Regime S3D","Optante CNPJá","Inclusão","Divergência"],filtSimpList.map(e=>[e.cnpj,e.razao,e.grupo,e.regime,e.simples_cnpja,e.simples_inc?fmtDataHist(e.simples_inc):"",e.sn_div?"Sim":"Não"]));}else if(tab==="cpf"){exportXlsx("auditoria_cpf.xlsx",["CPF","Nome","Grupo","Regime","Tags","Situacao"],filtCpfList.map(e=>[e.cnpj,e.razao,e.grupo,e.regime,e.tags.join("; "),e.sit]));}else if(tab==="cc"){exportXlsx("auditoria_cc.xlsx",["CNPJ","Razao","Grupo","Situacao RF","Regime","Tags CC"],filtCCList.map(e=>[e.cnpj,e.razao,e.grupo,e.sit,e.regime,e.tags.join("; ")]));}else if(tab==="ie"){const TL:Record<string,string>={NAO_CONSULTADO:"Não encontrado",ERRO_ISENTA_COM_IE:"Isenta mas tem IE",SEM_IE:"Sem IE",IE_NAO_ENCONTRADA:"Não encontrada",IE_NAO_HABILITADA:"Não habilitada",IE_RESTRICAO:"Restrição",IE_FALTANDO_S3D:"Faltando no S3D"};const rows:unknown[][]=[];filtIEList.forEach(e=>{(e.ie_probs||[]).forEach(p=>{rows.push([e.cnpj,e.razao,e.grupo,e.tags_arr.join("; "),p.uf||e.uf,TL[p.tipo]||p.tipo,p.ie_s3d||"",p.ie_cnpja||"",p.sit_cnpja||"",p.desc]);});});exportXlsx("auditoria_ie.xlsx",["CNPJ","Razao","Grupo","Tags","UF","Tipo","IE S3D","IE CNPJá","Situação","Detalhe"],rows);}showToast("Excel exportado!");};

  const TH:React.CSSProperties={fontFamily:"inherit",fontSize:12,fontWeight:600,padding:"10px 16px",border:"none",background:"none",cursor:"pointer",borderBottom:"2px solid transparent",marginBottom:-2,display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap"};
  const tabs:[TabId,string,number|string][]=[["upload","Upload",""],["resumogeral","Resumo Geral",allRG.length||"—"],["sit","Situação RF",naoCC.filter(e=>SIT_PROB.includes(e.sit)).length||"—"],["ie","Insc. Estadual",problemas?.length||"—"],["simples","Simples Nacional",simDiv?.length||"—"],["cpf","CPFs",cpfAll?.length||"—"],["cnae","CNAE",cnaeTotal?.length||"—"],["cnaebase","Histórico CNAE",""],["socios","Sócios",""],["cc","Constr. Civil",ccAll?.length||"—"]];

  if(carregando)return(<div style={{fontFamily:"'Poppins',sans-serif",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",gap:16,color:C.gray50}}><div style={{width:40,height:40,border:`3px solid ${C.gray10}`,borderTopColor:C.green,borderRadius:"50%",animation:"spin 1s linear infinite"}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style><span style={{fontSize:13,fontWeight:600}}>Carregando dados do banco...</span></div>);

  return(
    <div style={{fontFamily:"'Poppins',sans-serif",background:C.offWhite,minHeight:"100vh",fontSize:14}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      {/* TOPBAR */}
      <div style={{background:C.black,height:54,display:"flex",alignItems:"center",padding:"0 22px",gap:10,position:"sticky",top:0,zIndex:100}}>
        <div style={{width:30,height:30,background:C.green,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,color:C.black}}>P</div>
        <strong style={{color:"#fff",fontSize:13}}>Portal · Auditoria Cadastral</strong>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:10}}>
          {salvando&&<div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"rgba(255,255,255,.5)"}}><div style={{width:12,height:12,border:"2px solid rgba(255,255,255,.2)",borderTopColor:C.green,borderRadius:"50%",animation:"spin 1s linear infinite"}}/>Salvando no banco...</div>}
          {!salvando&&ultimoUpload&&<span style={{fontSize:10,color:"rgba(255,255,255,.3)"}}>Planilha: <strong style={{color:"rgba(255,255,255,.5)"}}>{ultimoUpload.fileName}</strong> · {new Date(ultimoUpload.uploadedAt).toLocaleString("pt-BR")}</span>}
          {baseAtiva&&<div style={{fontSize:10,color:"rgba(255,255,255,.6)",fontWeight:500}}>Base ativa: <strong style={{color:"#fff"}}>{baseAtiva.competencia?.slice(0,7)||"—"}</strong> · {baseAtiva.total.toLocaleString("pt-BR")} empresas</div>}
          <button onClick={()=>void carregarS3DdaBase()} disabled={loadingBase} style={{display:"flex",alignItems:"center",gap:5,fontFamily:"inherit",fontSize:11,fontWeight:600,padding:"6px 12px",borderRadius:8,border:`1px solid ${C.green}`,background:C.green,color:C.black,cursor:loadingBase?"default":"pointer",opacity:loadingBase?.6:1}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            {loadingBase?"Carregando…":"Recarregar Base Empresas"}
          </button>
        </div>
      </div>
      <div style={{background:C.white,borderBottom:`2px solid ${C.border}`,display:"flex",padding:"0 22px",overflowX:"auto",alignItems:"center"}}>
        {tabs.map(([id,label,badge])=>{const act=activeTab===id;return<button key={id} onClick={()=>setActiveTab(id)} style={{...TH,color:act?C.greenDark:C.gray50,borderBottomColor:act?C.green:"transparent"}}>{label}{badge!==""&&<span style={{fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:12,background:act?C.greenLt:C.redLt,color:act?C.greenDark:C.red}}>{badge}</span>}</button>;})}
      </div>

      <div style={{maxWidth:1200,margin:"0 auto",padding:"22px 22px 80px"}}>

        {/* ── UPLOAD ── */}
        {activeTab==="upload"&&<div>
          <div style={{fontSize:19,fontWeight:800,color:C.charcoal,marginBottom:3}}>Auditoria Cadastral</div>
          <div style={{fontSize:12,color:C.gray50,marginBottom:22}}>Carregue as planilhas para cruzar. Os dados ficam salvos no banco — todos no portal veem a versão mais recente automaticamente.</div>
          {ultimoUpload&&<div style={{marginBottom:20,padding:"12px 16px",background:C.greenLt,border:"1px solid #6ee7b7",borderRadius:12,fontSize:12,color:"#15803D",display:"flex",alignItems:"center",gap:8}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            Dados atuais: <strong>{ultimoUpload.fileName}</strong> · {new Date(ultimoUpload.uploadedAt).toLocaleString("pt-BR")}
            <button onClick={()=>setActiveTab("resumogeral")} style={{fontFamily:"inherit",fontSize:11,fontWeight:600,padding:"4px 10px",borderRadius:6,border:"1px solid #6ee7b7",background:C.white,color:"#15803D",cursor:"pointer",marginLeft:"auto"}}>Ver resumo →</button>
          </div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20}}>
            {[{id:"s3d",title:"Planilha S3D",sub:"Arquivo exportado do sistema de empresas",loaded:!!rawS3D,name:s3dName,count:rawS3D?rawS3D.length-1:0,handler:handleS3D},{id:"cnpja",title:"Planilha CNPJá",sub:"Estabelecimentos, Inscrições, Histórico, Atividades e Sócios",loaded:!!rawCNPJa,name:cnpjaName,count:0,handler:handleCNPJa}].map(card=>(
              <label key={card.id} style={{display:"block",background:card.loaded?C.greenLt:C.white,border:`2px dashed ${card.loaded?C.greenDark:C.border}`,borderRadius:16,padding:32,textAlign:"center",cursor:"pointer"}}>
                <div style={{fontSize:28,marginBottom:8}}>{card.loaded?"✅":"📁"}</div>
                <div style={{fontSize:14,fontWeight:700,color:C.charcoal,marginBottom:4}}>{card.title}</div>
                <div style={{fontSize:12,color:C.gray50,marginBottom:12}}>{card.sub}</div>
                {card.loaded?<div style={{fontSize:12,fontWeight:600,color:C.greenDark}}>{card.name}{card.count>0&&` (${card.count.toLocaleString("pt-BR")} linhas)`}</div>:<div style={{fontSize:12,color:C.gray30}}>Clique para selecionar ou arraste</div>}
                <input type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={e=>card.handler(e.target.files?.[0]??null)}/>
              </label>
            ))}
          </div>
          <div style={{textAlign:"center"}}>

            <button onClick={()=>void carregarS3DdaBase()} style={{fontFamily:"inherit",fontSize:12,fontWeight:600,padding:"8px 16px",borderRadius:8,border:`1px solid ${C.border}`,background:C.white,color:C.charcoal,cursor:"pointer",marginRight:8}}>
              ⤓ Carregar S3D da Base Empresas
            </button>
            <button disabled={!rawS3D||!rawCNPJa||processando||salvando} onClick={processar} style={{fontFamily:"inherit",fontSize:14,fontWeight:700,padding:"12px 32px",borderRadius:12,border:"none",background:rawS3D&&rawCNPJa&&!processando&&!salvando?C.green:C.gray10,color:rawS3D&&rawCNPJa&&!processando&&!salvando?C.black:C.gray50,cursor:rawS3D&&rawCNPJa&&!processando&&!salvando?"pointer":"default"}}>
              {processando?"⏳ Processando...":salvando?"⏳ Salvando no banco...":"🔍 Processar e salvar no banco"}
            </button>
            <div style={{fontSize:11,color:C.gray50,marginTop:10}}>O S3D pode vir do upload acima ou da Base Empresas ativa. O CNPJá segue por upload.</div>
          </div>

        </div>}

        {/* ── RESUMO GERAL ── */}
        {activeTab==="resumogeral"&&<div>
          <div style={{fontSize:10,fontWeight:700,color:C.gray50,textTransform:"uppercase",letterSpacing:".8px",marginBottom:4}}>Acessórias · Auditoria</div>
          <div style={{fontSize:19,fontWeight:800,color:C.charcoal,marginBottom:3}}>Resumo Geral de Pendências</div>
          <div style={{fontSize:12,color:C.gray50,marginBottom:18}}>Todas as divergências encontradas no cruzamento S3D × CNPJá</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:18}}>
            <StatCard type="warn" title="Situação Cadastral" sub="Suspensas/Inaptas/Baixadas" value={porCatRG.sit||0}/>
            <StatCard type="amb" title="Inscrição Estadual" sub="Problemas de IE" value={porCatRG.ie||0}/>
            <StatCard type="amb" title="Simples Nacional" sub="Divergências" value={porCatRG.simples||0}/>
            <StatCard type="warn" title="CNAE" sub="Pendências IE por atividade" value={porCatRG.cnae||0}/>
            <StatCard type="all" title="Total de pendências" sub="Todas as categorias" value={allRG.length}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <SI value={searchRG} onChange={v=>{setSearchRG(v);sp("resumogeral",1);}} placeholder="Buscar CNPJ, razão ou grupo..."/>
            <Sel value={filtRG} onChange={v=>{setFiltRG(v);sp("resumogeral",1);}}><option value="all">Todas as categorias</option><option value="sit">Situação Cadastral</option><option value="ie">Inscrição Estadual</option><option value="simples">Simples Nacional</option><option value="cnae">CNAE</option></Sel>
            <div style={{flex:1}}/><BtnEx onClick={()=>handleExport("resumogeral")}/>
          </div>
          <TableWrap cols="145px 1fr 140px 1fr 1fr" headers={["CNPJ / Grupo","Razão Social","Categoria","Problema","Detalhe"]} empty={!paginate(filtRGList,pages.resumogeral).slice.length}>
            {paginate(filtRGList,pages.resumogeral).slice.map((r,i)=>(
              <TR key={i} cols="145px 1fr 140px 1fr 1fr">
                <TD><span style={{fontFamily:"monospace",fontSize:"10.5px",fontWeight:600}}>{r.cnpj}</span><div style={{fontSize:10,color:C.gray50}}>{r.grupo}</div></TD>
                <TD><div title={r.razao} style={{fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.razao}</div></TD>
                <TD style={{textAlign:"center"}}><Chip type={r.cat==="sit"?"r":r.cat==="cnae"?"r":"a"}>{r.cat==="sit"?"Situação Cadastral":r.cat==="ie"?"Inscrição Estadual":r.cat==="simples"?"Simples Nacional":"CNAE"}</Chip></TD>
                <TD><span style={{fontSize:11,fontWeight:600,color:C.charcoal}}>{r.problema}</span></TD>
                <TD><span style={{fontSize:10,color:C.gray70}} title={r.detalhe}>{(r.detalhe||"").substring(0,70)}</span></TD>
              </TR>
            ))}
          </TableWrap>
          <Pager page={pages.resumogeral} total={filtRGList.length} onPage={p=>sp("resumogeral",p)}/>
        </div>}

        {/* ── SITUAÇÃO RF ── */}
        {activeTab==="sit"&&<div>
          <div style={{fontSize:19,fontWeight:800,color:C.charcoal,marginBottom:14}}>Situação Cadastral na Receita Federal</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:18}}>
            <StatCard type="warn" title="Suspensas" sub="" value={naoCC.filter(e=>e.sit==="Suspensa").length}/>
            <StatCard type="warn" title="Inaptas" sub="" value={naoCC.filter(e=>e.sit==="Inapta").length}/>
            <StatCard type="warn" title="Baixadas" sub="" value={naoCC.filter(e=>e.sit==="Baixada").length}/>
            <StatCard type="ok" title="Ativas" sub="" value={naoCC.filter(e=>e.sit==="Ativa").length}/>
            <StatCard type="all" title="Total auditado" sub="excl. CC" value={naoCC.length}/>
          </div>

          {/* ── ALERTA DE BAIXAS: ECD/ECF (Lucro Real / Presumido) ── */}
          {!!baixasAlerta.length&&<div style={{border:`1px solid ${baixasVencidas?"#fca5a5":"#fed7aa"}`,background:baixasVencidas?C.redLt:C.amberLt,borderRadius:16,padding:"14px 16px",marginBottom:18}}>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
              <span style={{fontSize:15}}>🚨</span>
              <strong style={{fontSize:14,color:C.charcoal}}>Alerta de baixas — entrega de ECD/ECF</strong>
              <Chip type="r">{baixasVencidas} vencido(s)</Chip>
              <Chip type="a">{baixasProximas} em até 30 dias</Chip>
              <Chip type="gr">{baixasAlerta.length} empresa(s) LR/LP baixadas</Chip>
            </div>
            <div style={{fontSize:10,color:C.gray70,marginBottom:10}}>
              ECD: evento de jan–mai → último dia útil de junho; jun–dez → último dia útil do mês seguinte. ECF: evento de jan–abr → último dia útil de julho; mai–dez → último dia útil do 3º mês subsequente.
            </div>
            <div style={{background:C.white,borderRadius:12,border:`1px solid ${C.border}`,overflow:"hidden"}}>
              <TableWrap cols="145px 1fr 120px 100px 130px 130px 130px" headers={["CNPJ","Razão / Grupo","Regime","Baixa","Prazo ECD","Prazo ECF","Status"]} empty={false}>
                {baixasAlerta.map((b,i)=>(
                  <TR key={i} cols="145px 1fr 120px 100px 130px 130px 130px">
                    <CNPJCell cnpj={b.e.cnpj}/><RazaoCell razao={b.e.razao} grupo={b.e.grupo}/>
                    <TD><Chip type="b">{b.e.regime||"—"}</Chip></TD>
                    <TD><div style={{display:"flex",flexDirection:"column",gap:2}}>
                      <span style={{fontSize:10,color:C.gray70,fontWeight:600}}>{b.ev?fmtDate(b.ev):"—"}</span>
                      {b.origem&&<span style={{fontSize:8,color:C.gray50}}>{b.origem}</span>}
                    </div></TD>
                    <TD>{b.ecd&&b.sEcd?<Chip type={b.sEcd.chip}>{fmtDate(b.ecd)}</Chip>:<span style={{fontSize:10,color:C.gray50}}>sem data</span>}</TD>
                    <TD>{b.ecf&&b.sEcf?<Chip type={b.sEcf.chip}>{fmtDate(b.ecf)}</Chip>:<span style={{fontSize:10,color:C.gray50}}>sem data</span>}</TD>
                    <TD><span style={{fontSize:10,fontWeight:600,color:(b.sEcd?.chip==="r"||b.sEcf?.chip==="r")?C.red:(b.sEcd?.chip==="a"||b.sEcf?.chip==="a")?C.amber:C.greenDark}}>{b.sEcd?`ECD ${b.sEcd.label}`:"—"}{b.sEcf?` · ECF ${b.sEcf.label}`:""}</span></TD>
                  </TR>
                ))}
              </TableWrap>
            </div>
          </div>}

          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <EqSel value={tagFilter} onChange={v=>{setTagFilter(v);sp("sit",1);}}/>
            <SI value={searchSit} onChange={v=>{setSearchSit(v);sp("sit",1);}} placeholder="Buscar CNPJ, razão ou grupo..."/>
            <Sel value={filtSit} onChange={v=>{setFiltSit(v);sp("sit",1);}}><option value="all">Todas</option><option value="prob">Suspensa / Inapta / Baixada</option><option value="Ativa">Ativas</option><option value="Suspensa">Suspensas</option><option value="Inapta">Inaptas</option><option value="Baixada">Baixadas</option></Sel>
            <div style={{flex:1}}/><BtnEx onClick={()=>handleExport("sit")}/>
          </div>
          <TableWrap cols="145px 1fr 70px 110px 100px 1fr" headers={["CNPJ","Razão / Grupo","UF","Situação","Data","Motivo"]} empty={!paginate(filtSitList,pages.sit).slice.length}>
            {paginate(filtSitList,pages.sit).slice.map((e,i)=>(
              <TR key={i} cols="145px 1fr 70px 110px 100px 1fr">
                <CNPJCell cnpj={e.cnpj}/><RazaoCell razao={e.razao} grupo={e.grupo}/>
                <TD><Chip type="gr">{e.uf||"—"}</Chip></TD>
                <TD><Chip type={e.sit==="Ativa"?"ok":SIT_PROB.includes(e.sit)?"r":"gr"}>{e.sit}</Chip></TD>
                <TD><span style={{fontSize:10,color:C.gray50}}>{e.sit_data?fmtDataHist(e.sit_data):"—"}</span></TD>
                <TD><span style={{fontSize:10,color:C.gray70}}>{e.sit_motivo||"—"}</span></TD>
              </TR>
            ))}
          </TableWrap>
          <Pager page={pages.sit} total={filtSitList.length} onPage={p=>sp("sit",p)}/>
        </div>}

        {/* ── INSCRIÇÃO ESTADUAL ── */}
        {activeTab==="ie"&&<div>
          <div style={{fontSize:19,fontWeight:800,color:C.charcoal,marginBottom:14}}>Inscrição Estadual</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:18}}>
            <StatCard type="warn" title="Não consultado" sub="" value={naoConsult?.length||0}/>
            <StatCard type="ok" title="Isentos OK" sub="" value={isentaOk?.length||0}/>
            <StatCard type="ok" title="IE OK" sub="" value={ieOk?.length||0}/>
            <StatCard type="warn" title="Faltando no S3D" sub="" value={faltando?.length||0}/>
            <StatCard type="warn" title="Não habilitada" sub="" value={naoHab?.length||0}/>
            <StatCard type="warn" title="Só DP – Sem Fiscal" sub="" value={dpSemFiscal?.length||0}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <EqSel value={tagFilter} onChange={v=>{setTagFilter(v);sp("ie",1);}}/>
            <SI value={searchIE} onChange={v=>{setSearchIE(v);sp("ie",1);}} placeholder="Buscar CNPJ, razão..."/>
            <Sel value={filtIE} onChange={v=>{setFiltIE(v);sp("ie",1);}}><option value="problemas">Só com problemas</option><option value="nao_consultado">Não consultado</option><option value="isenta_ok">Isenta OK</option><option value="ie_ok">IE OK</option><option value="faltando">Faltando no S3D</option><option value="nao_hab">Não habilitada</option><option value="dp_sem_fiscal">Só DP (sem Fiscal)</option><option value="all">Todas</option></Sel>
            <div style={{flex:1}}/><BtnEx onClick={()=>handleExport("ie")}/>
          </div>
          <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:16,overflow:"hidden"}}>
            <div style={{display:"grid",gridTemplateColumns:"145px 1fr 55px 55px 140px 120px",padding:"0 14px",background:C.gray05,borderBottom:`1px solid ${C.border}`}}>
              {["CNPJ","Razão / Grupo","Isento","UF","Regime","Status IE"].map(h=><div key={h} style={{padding:"9px 7px",fontSize:10,fontWeight:700,color:C.gray50,textTransform:"uppercase",letterSpacing:".5px"}}>{h}</div>)}
            </div>
            {!paginate(filtIEList,pages.ie).slice.length?<Empty/>:paginate(filtIEList,pages.ie).slice.map((e,i)=>{
              const probs=e.ie_probs||[];const tipos_u:Record<string,{descs:string[];count:number}>={};probs.forEach(p=>{if(!tipos_u[p.tipo])tipos_u[p.tipo]={descs:[],count:0};tipos_u[p.tipo].descs.push(p.desc);tipos_u[p.tipo].count++;});
              const lbl=(t:string)=>t==="SEM_IE"?"Sem IE":t==="IE_NAO_ENCONTRADA"?"Não encontrada":t==="IE_FALTANDO_S3D"?"Faltando S3D":t==="IE_NAO_HABILITADA"?"Não habilitada":t==="IE_RESTRICAO"?"Restrição":t==="ERRO_ISENTA_COM_IE"?"Isenta c/ IE":t==="NAO_CONSULTADO"?"Não consultado":"?";
              const numS3d=e.ies_s3d?e.ies_s3d.map(x=>x.num):[];const faltandoC=e.ies.filter(x=>x.hab==="Sim"&&!numS3d.includes(x.ie_num));
              const opened=openIEs.has(e.cnpj);
              return <div key={i}>
                <div onClick={()=>{const s=new Set(openIEs);if(s.has(e.cnpj))s.delete(e.cnpj);else s.add(e.cnpj);setOpenIEs(s);}} style={{display:"grid",gridTemplateColumns:"145px 1fr 55px 55px 140px 120px",padding:"0 14px",borderBottom:`1px solid ${C.border}`,alignItems:"center",cursor:"pointer",background:opened?C.gray05:"transparent"}}>
                  <TD><span style={{fontFamily:"monospace",fontSize:"10.5px",fontWeight:600}}>{e.cnpj}</span><div style={{fontSize:10,color:C.gray50}}>{e.grupo}{e.tags_arr.some(t=>DP_TAGS.includes(t))&&!e.tags_arr.some(t=>FISCAL_TAGS.includes(t))&&<span style={{marginLeft:4,fontSize:9,fontWeight:700,padding:"1px 5px",borderRadius:10,background:"#EFF6FF",color:"#2563EB"}}>DP</span>}</div></TD>
                  <TD><div title={e.razao} style={{fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{e.razao}</div></TD>
                  <TD style={{textAlign:"center"}}>{e.ie_status==="isenta_ok"?<Chip type="ok">Sim ✓</Chip>:e.ie_status==="erro_isenta"?<Chip type="r">Sim ✗</Chip>:isentoSim(e.isento)?<Chip type="b">Sim</Chip>:<Chip type="gr">{e.isento||"Não"}</Chip>}</TD>
                  <TD style={{textAlign:"center"}}><Chip type="gr">{e.uf||"—"}</Chip></TD>
                  <TD><span style={{fontSize:10,color:C.gray70}}>{(e.regime||"Sem regime").replace(" - Geral","").substring(0,22)}</span></TD>
                  <TD style={{textAlign:"center"}}>{Object.keys(tipos_u).length===0?(e.ie_status==="isenta_ok"?<Chip type="ok">Isenta ✓</Chip>:<Chip type="ok">OK</Chip>):Object.entries(tipos_u).map(([t,g])=><Chip key={t} type={["IE_NAO_ENCONTRADA","SEM_IE","IE_NAO_HABILITADA","ERRO_ISENTA_COM_IE","NAO_CONSULTADO"].includes(t)?"r":"a"}>{lbl(t)}{g.count>1?` (${g.count})`:""}</Chip>)}</TD>
                </div>
                {opened&&(e.ies_s3d?.length>0||faltandoC.length>0)&&<div style={{padding:"6px 14px 10px",background:C.gray05,borderBottom:`1px solid ${C.border}`,overflowX:"auto"}}>
                  <table style={{borderCollapse:"collapse",fontSize:11,minWidth:520,width:"100%",tableLayout:"fixed"}}><colgroup><col style={{width:90}}/><col style={{width:70}}/><col style={{width:160}}/><col/></colgroup>
                    <thead><tr style={{background:C.gray10}}>{["Fonte","UF","Número IE","Situação"].map(h=><th key={h} style={{padding:"4px 8px",fontSize:9,fontWeight:700,color:C.gray50,textTransform:"uppercase",textAlign:"left"}}>{h}</th>)}</tr></thead>
                    <tbody>
                      {(e.ies_s3d||[]).map((s,si)=>{const match=e.ies.find(x=>x.ie_num===s.num);const sc=match?(match.hab==="Não"?<Chip type="r">Inativa</Chip>:match.sit!=="Sem restrição"?<Chip type="a">{match.sit.substring(0,22)}</Chip>:<Chip type="ok">Confere ✓</Chip>):<Chip type="r">Não encontrada</Chip>;return<tr key={si}><td style={{padding:"4px 8px",textAlign:"center"}}><Chip type="b">S3D</Chip></td><td style={{padding:"4px 8px",textAlign:"center"}}><span style={{fontSize:10,fontWeight:600,padding:"2px 6px",borderRadius:4,background:C.gray10,color:C.gray70}}>{s.uf||"?"}</span></td><td style={{padding:"4px 8px",fontFamily:"monospace",fontSize:11,color:C.charcoal}}>{s.raw}</td><td style={{padding:"4px 8px"}}>{sc}</td></tr>;
                      })}
                      {faltandoC.map((x,xi)=><tr key={"f"+xi}><td style={{padding:"4px 8px",textAlign:"center"}}><Chip type="a">CNPJá</Chip></td><td style={{padding:"4px 8px",textAlign:"center"}}><span style={{fontSize:10,fontWeight:600,padding:"2px 6px",borderRadius:4,background:C.gray10,color:C.gray70}}>{x.uf}</span></td><td style={{padding:"4px 8px",fontFamily:"monospace",fontSize:11,color:C.charcoal}}>{x.ie_raw}</td><td style={{padding:"4px 8px"}}><Chip type="a">Faltando no S3D</Chip></td></tr>)}
                    </tbody>
                  </table>
                </div>}
              </div>;
            })}
          </div>
          <Pager page={pages.ie} total={filtIEList.length} onPage={p=>sp("ie",p)}/>
        </div>}

        {/* ── SIMPLES NACIONAL ── */}
        {activeTab==="simples"&&<div>
          <div style={{fontSize:19,fontWeight:800,color:C.charcoal,marginBottom:14}}>Simples Nacional</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:18}}>
            <StatCard type="warn" title="Não consultado" sub="" value={simNaoConsult?.length||0}/>
            <StatCard type="warn" title="Divergências" sub="S3D × CNPJá" value={simDiv?.length||0}/>
            <StatCard type="amb" title="Reentrou" sub="Saiu e voltou" value={simReentrou?.length||0}/>
            <StatCard type="ok" title="Simples OK" sub="" value={simOk?.length||0}/>
            <StatCard type="all" title="Com histórico" sub="" value={simComHist?.length||0}/>
            <StatCard type="all" title="Total" sub="excl. CC" value={simAll?.length||0}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <EqSel value={tagFilter} onChange={v=>{setTagFilter(v);sp("simples",1);}}/>
            <SI value={searchSimples} onChange={v=>{setSearchSimples(v);sp("simples",1);}} placeholder="Buscar CNPJ, razão..."/>
            <Sel value={filtSimples} onChange={v=>{setFiltSimples(v);sp("simples",1);}}><option value="all">Todas</option><option value="div">Divergências</option><option value="ok">Simples OK</option><option value="reentrou">Reentrou</option><option value="com_hist">Com histórico</option><option value="nao_consultado">Não consultado</option></Sel>
            <div style={{flex:1}}/><BtnEx onClick={()=>handleExport("simples")}/>
          </div>
          <TableWrap cols="145px 1fr 130px 80px 90px 90px 1fr" headers={["CNPJ","Razão / Grupo","Regime S3D","CNPJá Opt.","Inclusão","Divergência","Histórico"]} empty={!paginate(filtSimpList,pages.simples).slice.length}>
            {paginate(filtSimpList,pages.simples).slice.map((e,i)=>{
              const h=e.hist&&e.hist.length>0?e.hist[0]:null;const reentrou=reentrouSimples(e);
              return<TR key={i} cols="145px 1fr 130px 80px 90px 90px 1fr" bg={!e.consultado?"rgba(220,38,38,.03)":undefined}>
                <CNPJCell cnpj={e.cnpj}/><RazaoCell razao={e.razao} grupo={e.grupo}/>
                <TD><span style={{fontSize:10,color:C.gray70}}>{e.regime||"Sem regime"}</span></TD>
                <TD>{!e.consultado?<Chip type="gr">—</Chip>:e.sn_cnpja?<Chip type="ok">Sim</Chip>:<Chip type="gr">Não</Chip>}</TD>
                <TD><span style={{fontSize:10,color:C.gray50}}>{e.simples_inc?fmtDataHist(e.simples_inc):"—"}</span></TD>
                <TD>{!e.consultado?<Chip type="r">⚠ N/C</Chip>:e.sn_div?<Chip type="a">⚠ Diverg.</Chip>:<Chip type="ok">OK</Chip>}</TD>
                <TD>{h?<div style={{fontSize:10,lineHeight:1.5}}><strong style={{color:reentrou?C.greenDark:C.gray70}}>{reentrou?"✓ Reentrou":"Saiu"}</strong> em {fmtDataHist(h.data_fim)}<div style={{fontSize:10,color:C.gray50}}>{h.motivo.substring(0,40)}{h.motivo.length>40?"...":""}</div></div>:<span style={{fontSize:10,color:C.gray30}}>Sem histórico</span>}</TD>
              </TR>;
            })}
          </TableWrap>
          <Pager page={pages.simples} total={filtSimpList.length} onPage={p=>sp("simples",p)}/>
        </div>}

        {/* ── CNAE ── */}
        {activeTab==="cnae"&&<div>
          <div style={{fontSize:19,fontWeight:800,color:C.charcoal,marginBottom:14}}>CNAE e Obrigatoriedade de IE</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:18}}>
            <StatCard type="warn" title="Sem IE nenhuma" sub="CNAE exige, sem cadastro" value={cnaePtSemIe?.length||0}/>
            <StatCard type="warn" title="IE cadastrada, inativa" sub="Regularizar na SEFAZ" value={cnaePtInativa?.length||0}/>
            <StatCard type="amb" title="Condicional" sub="Verificar manualmente" value={cnaeCond?.length||0}/>
            <StatCard type="all" title="Não mapeado" sub="" value={cnaeNaoMap?.length||0}/>
            <StatCard type="ok" title="OK" sub="CNAE exige e tem IE ativa" value={cnaeOk?.length||0}/>
            <StatCard type="all" title="Não exige IE" sub="" value={cnaeNaoExige?.length||0}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <SI value={searchCnae} onChange={v=>{setSearchCnae(v);sp("cnae",1);}} placeholder="Buscar CNPJ, razão ou CNAE..."/>
            <Sel value={filtCnae} onChange={v=>{setFiltCnae(v);sp("cnae",1);}}><option value="all">Todas</option><option value="pendente">Pendentes</option><option value="pendente_sem_ie">Sem IE nenhuma</option><option value="pendente_inativa">IE inativa</option><option value="condicional">Condicional</option><option value="nao_mapeado">Não mapeado</option><option value="ok">OK</option><option value="nao_exige">Não exige IE</option></Sel>
            <div style={{flex:1}}/><BtnEx onClick={()=>handleExport("cnae")}/>
          </div>
          <TableWrap cols="145px 1fr 90px 130px 1fr 130px" headers={["CNPJ","Razão / Grupo","UF","CNAE","Atividade Principal","Status"]} empty={!paginate(filtCnaeList,pages.cnae).slice.length}>
            {paginate(filtCnaeList,pages.cnae).slice.map((e,i)=>(
              <TR key={i} cols="145px 1fr 90px 130px 1fr 130px">
                <CNPJCell cnpj={e.cnpj} sub={e.grupo}/><TD><div title={e.razao} style={{fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{e.razao}</div></TD>
                <TD style={{textAlign:"center"}}><Chip type="gr">{e.uf||"—"}</Chip></TD>
                <TD style={{textAlign:"center"}}><span style={{fontFamily:"monospace",fontSize:11}}>{fmtCnae(e.cnae)}</span></TD>
                <TD><span style={{fontSize:10,color:C.gray70}}>{(e.cnae_desc||"—").substring(0,40)}</span></TD>
                <TD style={{textAlign:"center"}}>{!e.cnae?<Chip type="gr">Sem CNAE</Chip>:e.cnae_obrig==="S"&&!e.ie_habilitada&&e.ies?.length?<Chip type="r">⚠ IE inativa</Chip>:e.cnae_obrig==="S"&&!e.ie_habilitada?<Chip type="r">⚠ Sem IE</Chip>:e.cnae_obrig==="S"&&e.ie_habilitada?<Chip type="ok">OK</Chip>:e.cnae_obrig==="C"?<Chip type="a">Condicional</Chip>:e.cnae_obrig==="N"?<Chip type="gr">Não exige</Chip>:<Chip type="gr">Não mapeado</Chip>}</TD>
              </TR>
            ))}
          </TableWrap>
          <Pager page={pages.cnae} total={filtCnaeList.length} onPage={p=>sp("cnae",p)}/>
        </div>}

        {/* ── HISTÓRICO CNAE ── */}
        {activeTab==="cnaebase"&&<div>
          <div style={{fontSize:19,fontWeight:800,color:C.charcoal,marginBottom:8}}>Histórico de CNAEs</div>
          <div style={{background:C.amberLt,border:"1px solid #fed7aa",borderRadius:10,padding:"10px 14px",marginBottom:14,fontSize:12,color:"#92400e"}}>
            <strong>Como funciona:</strong> clique em "Salvar snapshot" para guardar os CNAEs de hoje no banco. Na próxima consulta, o sistema compara e sinaliza inclusões e exclusões.
            {snapCnaeDate&&<span style={{marginLeft:8,color:"#15803D",fontWeight:600}}>✓ Snapshot salvo em {new Date(snapCnaeDate).toLocaleString("pt-BR")}</span>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <SI value={searchCnaeBase} onChange={v=>{setSearchCnaeBase(v);sp("cnaebase",1);}} placeholder="Buscar CNPJ, razão ou CNAE..."/>
            <Sel value={filtCnaeBase} onChange={v=>{setFiltCnaeBase(v);sp("cnaebase",1);}}><option value="all">Todos</option><option value="alterados">Com alteração</option><option value="novos">Novos</option></Sel>
            <div style={{flex:1}}/>
            <button onClick={salvarSnapshotCnae} style={{display:"inline-flex",alignItems:"center",gap:5,fontFamily:"inherit",fontSize:11,fontWeight:600,padding:"7px 13px",borderRadius:10,border:`1px solid ${C.border}`,background:C.white,color:C.gray70,cursor:"pointer"}}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>
              Salvar snapshot
            </button>
          </div>
          <TableWrap cols="145px 1fr 1fr 120px 120px" headers={["CNPJ","Razão / Grupo","CNAEs Atuais","Incluídos","Excluídos"]} empty={!paginate(filtCnaeBaseList,pages.cnaebase).slice.length}>
            {paginate(filtCnaeBaseList,pages.cnaebase).slice.map((e:Empresa&{_cmp:{temSnap:boolean;incluidos:string[];excluidos:string[];novo?:boolean}},i)=>(
              <TR key={i} cols="145px 1fr 1fr 120px 120px">
                <CNPJCell cnpj={e.cnpj} sub={e.grupo}/>
                <TD><div title={e.razao} style={{fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{e.razao}</div></TD>
                <TD><div style={{fontSize:10,color:C.gray70,lineHeight:1.6}}>{(e.atividades_all||[]).map((a:Atividade)=>fmtCnae(a.cod)).join(", ")||"—"}</div></TD>
                <TD>{e._cmp.incluidos?.length?e._cmp.incluidos.map((c:string,ci:number)=><Chip key={ci} type="ok">+{fmtCnae(c)}</Chip>):<span style={{fontSize:10,color:C.gray30}}>{e._cmp.temSnap?"—":"Sem snapshot"}</span>}</TD>
                <TD>{e._cmp.excluidos?.length?e._cmp.excluidos.map((c:string,ci:number)=><Chip key={ci} type="r">-{fmtCnae(c)}</Chip>):<span style={{fontSize:10,color:C.gray30}}>{e._cmp.temSnap?"—":"Sem snapshot"}</span>}</TD>
              </TR>
            ))}
          </TableWrap>
          <Pager page={pages.cnaebase} total={filtCnaeBaseList.length} onPage={p=>sp("cnaebase",p)}/>
        </div>}

        {/* ── SÓCIOS ── */}
        {activeTab==="socios"&&<div>
          <div style={{fontSize:19,fontWeight:800,color:C.charcoal,marginBottom:8}}>Quadro Societário</div>
          <div style={{background:C.amberLt,border:"1px solid #fed7aa",borderRadius:10,padding:"10px 14px",marginBottom:14,fontSize:12,color:"#92400e"}}>
            <strong>Como funciona:</strong> clique em "Salvar snapshot" para guardar o quadro societário atual no banco. Na próxima comparação, o sistema sinaliza entradas e saídas.
            {snapSociosDate&&<span style={{marginLeft:8,color:"#15803D",fontWeight:600}}>✓ Snapshot salvo em {new Date(snapSociosDate).toLocaleString("pt-BR")}</span>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <SI value={searchSocios} onChange={v=>{setSearchSocios(v);sp("socios",1);}} placeholder="Buscar CNPJ, razão ou sócio..."/>
            <Sel value={filtSocios} onChange={v=>{setFiltSocios(v);sp("socios",1);}}><option value="all">Todos</option><option value="alterados">Com alteração</option></Sel>
            <div style={{flex:1}}/>
            <button onClick={salvarSnapshotSocios} style={{display:"inline-flex",alignItems:"center",gap:5,fontFamily:"inherit",fontSize:11,fontWeight:600,padding:"7px 13px",borderRadius:10,border:`1px solid ${C.border}`,background:C.white,color:C.gray70,cursor:"pointer"}}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>
              Salvar snapshot
            </button>
          </div>
          <TableWrap cols="145px 1fr 1fr 130px 130px" headers={["CNPJ","Razão / Grupo","Sócios Atuais","Entraram","Saíram"]} empty={!paginate(filtSociosList,pages.socios).slice.length}>
            {paginate(filtSociosList,pages.socios).slice.map((e:Empresa&{_cmp:{entraram:Socio[];sairam:string[];temSnap:boolean}},i)=>(
              <TR key={i} cols="145px 1fr 1fr 130px 130px">
                <CNPJCell cnpj={e.cnpj} sub={e.grupo}/>
                <TD><div title={e.razao} style={{fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{e.razao}</div></TD>
                <TD><div style={{fontSize:10,color:C.gray70,lineHeight:1.6}}>{(e.socios_atuais||[]).map((s:Socio)=>s.nome).join(", ")||"—"}</div></TD>
                <TD>{e._cmp.entraram?.length?e._cmp.entraram.map((s:Socio,si:number)=><div key={si}><Chip type="ok">+ {s.nome}</Chip></div>):<span style={{fontSize:10,color:C.gray30}}>{e._cmp.temSnap?"—":"Sem snapshot"}</span>}</TD>
                <TD>{e._cmp.sairam?.length?e._cmp.sairam.map((nome:string,si:number)=><div key={si}><Chip type="r">- {nome}</Chip></div>):<span style={{fontSize:10,color:C.gray30}}>{e._cmp.temSnap?"—":"Sem snapshot"}</span>}</TD>
              </TR>
            ))}
          </TableWrap>
          <Pager page={pages.socios} total={filtSociosList.length} onPage={p=>sp("socios",p)}/>
        </div>}

        {/* ── CPFs ── */}
        {activeTab==="cpf"&&<div>
          <div style={{fontSize:19,fontWeight:800,color:C.charcoal,marginBottom:14}}>Pessoas Físicas (CPF)</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:18}}>
            <StatCard type="all" title="Total de CPFs" sub="" value={cpfAll?.length||0}/>
            <StatCard type="warn" title="Suspenso/Inapto" sub="" value={cpfSusp?.length||0}/>
            <StatCard type="ok" title="Ativo" sub="" value={(cpfAll?.length||0)-(cpfSusp?.length||0)}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <SI value={searchCpf} onChange={v=>{setSearchCpf(v);sp("cpf",1);}} placeholder="Buscar CPF ou nome..."/>
            <Sel value={filtCpf} onChange={v=>{setFiltCpf(v);sp("cpf",1);}}><option value="all">Todos</option><option value="susp">Suspenso/Inapto</option><option value="ok">Ativo</option></Sel>
            <div style={{flex:1}}/><BtnEx onClick={()=>handleExport("cpf")}/>
          </div>
          <TableWrap cols="160px 1fr 1fr 130px 110px" headers={["CPF","Nome","Regime","Tags","Situação"]} empty={!paginate(filtCpfList,pages.cpf).slice.length}>
            {paginate(filtCpfList,pages.cpf).slice.map((e,i)=>(
              <TR key={i} cols="160px 1fr 1fr 130px 110px">
                <CNPJCell cnpj={e.cnpj} sub={e.grupo}/><TD><div title={e.razao} style={{fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{e.razao}</div></TD>
                <TD><span style={{fontSize:10,color:C.gray70}}>{e.regime||"Sem regime"}</span></TD>
                <TD>{e.tags.map((t,ti)=><Chip key={ti} type="gr">{t}</Chip>)}</TD>
                <TD>{SIT_PROB.includes(e.sit)?<Chip type="r">{e.sit}</Chip>:!e.consultado||e.sit==="Não encontrada"?<Chip type="gr">Não consultado</Chip>:<Chip type="ok">{e.sit||"Ativa"}</Chip>}</TD>
              </TR>
            ))}
          </TableWrap>
          <Pager page={pages.cpf} total={filtCpfList.length} onPage={p=>sp("cpf",p)}/>
        </div>}

        {/* ── CONSTRUÇÃO CIVIL ── */}
        {activeTab==="cc"&&<div>
          <div style={{fontSize:19,fontWeight:800,color:C.charcoal,marginBottom:14}}>Construção Civil</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:18}}>
            <StatCard type="all" title="Total CC" sub="" value={ccAll?.length||0}/>
            <StatCard type="ok" title="Ativas" sub="" value={ccAll?.filter(e=>e.sit==="Ativa").length||0}/>
            <StatCard type="warn" title="Suspensas" sub="" value={ccAll?.filter(e=>e.sit==="Suspensa").length||0}/>
            <StatCard type="warn" title="Inaptas" sub="" value={ccAll?.filter(e=>e.sit==="Inapta").length||0}/>
            <StatCard type="warn" title="Baixadas" sub="" value={ccAll?.filter(e=>e.sit==="Baixada").length||0}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <EqSel value={tagFilter} onChange={v=>{setTagFilter(v);sp("cc",1);}}/>
            <SI value={searchCC} onChange={v=>{setSearchCC(v);sp("cc",1);}} placeholder="Buscar CNPJ, razão ou grupo..."/>
            <Sel value={filtCC} onChange={v=>{setFiltCC(v);sp("cc",1);}}><option value="all">Todas</option><option value="Ativa">Ativas</option><option value="Suspensa">Suspensas</option><option value="Inapta">Inaptas</option><option value="Baixada">Baixadas</option></Sel>
            <div style={{flex:1}}/><BtnEx onClick={()=>handleExport("cc")}/>
          </div>
          <TableWrap cols="145px 1fr 110px 140px 1fr" headers={["CNPJ","Razão / Grupo","Situação RF","Regime","TAGs CC"]} empty={!paginate(filtCCList,pages.cc).slice.length}>
            {paginate(filtCCList,pages.cc).slice.map((e,i)=>(
              <TR key={i} cols="145px 1fr 110px 140px 1fr">
                <CNPJCell cnpj={e.cnpj}/><RazaoCell razao={e.razao} grupo={e.grupo}/>
                <TD><Chip type={e.sit==="Ativa"?"ok":SIT_PROB.includes(e.sit)?"r":"gr"}>{e.sit}</Chip></TD>
                <TD><span style={{fontSize:10,color:C.gray70}}>{e.regime||"—"}</span></TD>
                <TD>{e.tags.filter(t=>CC_TAGS.includes(t)).map((t,ti)=><Chip key={ti} type="p">{t}</Chip>)}</TD>
              </TR>
            ))}
          </TableWrap>
          <Pager page={pages.cc} total={filtCCList.length} onPage={p=>sp("cc",p)}/>
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
