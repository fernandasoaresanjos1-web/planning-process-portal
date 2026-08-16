// MatrizRaci.tsx
// Cole em src/components/MatrizRaci.tsx no seu projeto Lovable
// Dependência: npm install xlsx
// Uso: <MatrizRaci /> em qualquer página

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import * as XLSX from "xlsx";

// ─── TIPOS ───────────────────────────────────────────────────────────────────

interface Demanda {
  id: string;
  grupo: string;
  processo: string;
  demanda: string;
  solicitar: string;
  autoriza: string;
  faz: string;
  dono: string;
  canal: string;
  obs: string;
  sla_gr: string;
  sla_ti: string;
  sla_geral: string;
}

type MainTab = "raci" | "config";
type ViewMode = "raci" | "sla";

// ─── CONSTANTES ──────────────────────────────────────────────────────────────

const STORAGE_KEY = "raci_v7";

const DEFAULT_GRUPOS = ["Acessórias", "SAAM", "SITTAX"];
const DEFAULT_PROCESSOS = ["Onboarding", "Offboarding", "Grupo Existente", "Sistema", "Onboarding Colaborador", "Colaborador Ativo", "Offboarding Colaborador"];
const DEFAULT_DEPTOS = ["Gestão de Risco", "T.I", "CS", "Coordenador", "Supervisor", "Analista", "Gerentes", "Gerente", "Head", "RH"];

const C = {
  green: "#0AE18C", greenDark: "#00BF63", greenLt: "#EAFBF4",
  black: "#0C0C0C", charcoal: "#1A1A1A", ink: "#2C2C2C",
  gray70: "#4A4A4A", gray50: "#646464", gray30: "#CDCDCD",
  gray10: "#E8E8E8", gray05: "#F5F5F5", offWhite: "#FAFAFA",
  white: "#FFFFFF", border: "#E2E2E2",
  red: "#DC2626", redLt: "#FEE2E2",
  amber: "#FA6914", amberLt: "#FFF3E0",
  blue: "#14C8FA", blueLt: "#DDF6FF",
  purple: "#7C3AED", purpleLt: "#F5F3FF",
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function defaultData(): Demanda[] {
  const u = uid;
  return [
  { id: u(), grupo: "Acessórias", processo: "Onboarding", demanda: "Cadastrar Empresa (CNPJ)", solicitar: "CS", autoriza: "Gestão de Risco", faz: "T.I", sla_gr: "Inicio da Competencia", sla_ti: "Inicio da Competencia", sla_geral: "-", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Onboarding", demanda: "Incluir Regime Tributário", solicitar: "CS", autoriza: "Gestão de Risco", faz: "T.I", sla_gr: "Inicio da Competencia", sla_ti: "Inicio da Competencia", sla_geral: "-", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Onboarding", demanda: "Incluir Inscrições Fiscais", solicitar: "CS", autoriza: "Gestão de Risco", faz: "T.I", sla_gr: "Inicio da Competencia", sla_ti: "Inicio da Competencia", sla_geral: "-", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Onboarding", demanda: "Incluir Regime Tributário", solicitar: "CS", autoriza: "Gestão de Risco", faz: "T.I", sla_gr: "Inicio da Competencia", sla_ti: "Inicio da Competencia", sla_geral: "-", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Onboarding", demanda: "Vincular Obrigações (Contábil, Fiscal e Folha)", solicitar: "Coordenador", autoriza: "Gestão de Risco", faz: "Gestão de Risco", sla_gr: "Inicio da Competencia", sla_ti: "Inicio da Competencia", sla_geral: "-", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Onboarding", demanda: "Vincular Obrigações Específicas (Contábil, Fiscal e Folha)", solicitar: "Coordenador", autoriza: "Gestão de Risco", faz: "Gestão de Risco", sla_gr: "Inicio da Competencia", sla_ti: "Inicio da Competencia", sla_geral: "-", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Offboarding", demanda: "Inativar Empresa (CNPJ)", solicitar: "CS", autoriza: "Gestão de Risco", faz: "T.I", sla_gr: "Final da Competencia", sla_ti: "Final da Competencia", sla_geral: "-", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Offboarding", demanda: "Inativar obrigações", solicitar: "Gestão de Risco", autoriza: "Gestão de Risco", faz: "T.I", sla_gr: "Final da Competencia", sla_ti: "Final da Competencia", sla_geral: "-", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Offboarding", demanda: "Inativar Tarefa", solicitar: "Gestão de Risco", autoriza: "Gestão de Risco", faz: "T.I", sla_gr: "Final da Competencia", sla_ti: "Final da Competencia", sla_geral: "-", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Grupo Existente", demanda: "Cadastrar Empresa (CNPJ)", solicitar: "CS", autoriza: "Gestão de Risco", faz: "T.I", sla_gr: "", sla_ti: "48h", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Grupo Existente", demanda: "Alterar dados da Empresa", solicitar: "Coordenador", autoriza: "Gestão de Risco", faz: "Gestão de Risco", sla_gr: "48 h", sla_ti: "-", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Grupo Existente", demanda: "Inativar Empresa (CNPJ)", solicitar: "CS", autoriza: "Gestão de Risco", faz: "T.I", sla_gr: "", sla_ti: "48h", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Grupo Existente", demanda: "Incluir Regime Tributário", solicitar: "CS", autoriza: "Gestão de Risco", faz: "T.I", sla_gr: "", sla_ti: "48h", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Grupo Existente", demanda: "Alterar Regime Tributário", solicitar: "Coordenador", autoriza: "Gestão de Risco", faz: "Gestão de Risco", sla_gr: "48 h", sla_ti: "-", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Grupo Existente", demanda: "Incluir Inscrições Fiscais", solicitar: "CS", autoriza: "Gestão de Risco", faz: "T.I", sla_gr: "", sla_ti: "48h", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Grupo Existente", demanda: "Alterar Inscrições Fiscais", solicitar: "Coordenador", autoriza: "Gestão de Risco", faz: "Gestão de Risco", sla_gr: "48 h", sla_ti: "-", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Grupo Existente", demanda: "Vincular Obrigações (Contábil, Fiscal e Folha)", solicitar: "Coordenador", autoriza: "Gestão de Risco", faz: "Gestão de Risco", sla_gr: "48 h", sla_ti: "-", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Grupo Existente", demanda: "Vincular Obrigações Específicas (Contábil, Fiscal e Folha)", solicitar: "Coordenador", autoriza: "Gestão de Risco", faz: "Gestão de Risco", sla_gr: "48 h", sla_ti: "-", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Sistema", demanda: "Criar Obrigação", solicitar: "Coordenador", autoriza: "Gestão de Risco", faz: "Gestão de Risco", sla_gr: "48 h", sla_ti: "-", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Sistema", demanda: "Alterar Obrigações", solicitar: "Coordenador", autoriza: "Gestão de Risco", faz: "Gestão de Risco", sla_gr: "48 h", sla_ti: "-", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Sistema", demanda: "Alterar Datas das Obrigações", solicitar: "Coordenador", autoriza: "Gestão de Risco", faz: "Gestão de Risco", sla_gr: "48 h", sla_ti: "-", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Sistema", demanda: "Inativar Obrigação", solicitar: "Coordenador", autoriza: "Gestão de Risco", faz: "Gestão de Risco", sla_gr: "48 h", sla_ti: "-", sla_geral: "", canal: "Acessórias", dono: "T.I", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Sistema", demanda: "Vincular Tarefas (Contábil, Fiscal e Folha)", solicitar: "Coordenador", autoriza: "Gestão de Risco", faz: "Gestão de Risco", sla_gr: "48 h", sla_ti: "-", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Sistema", demanda: "Criar Tarefas", solicitar: "Coordenador | Supervisor", autoriza: "Gestão de Risco", faz: "Gestão de Risco", sla_gr: "48 h", sla_ti: "-", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Sistema", demanda: "Alterar Tarefas", solicitar: "Coordenador | Supervisor", autoriza: "Gestão de Risco", faz: "Gestão de Risco", sla_gr: "48 h", sla_ti: "-", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Sistema", demanda: "Inativar Tarefa", solicitar: "Coordenador", autoriza: "Gestão de Risco", faz: "Gestão de Risco", sla_gr: "48 h", sla_ti: "-", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Sistema", demanda: "Criar Processo", solicitar: "Coordenador", autoriza: "Gestão de Risco", faz: "Gestão de Risco", sla_gr: "48 h", sla_ti: "-", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Sistema", demanda: "Excluir Processo", solicitar: "Coordenador", autoriza: "Gestão de Risco", faz: "Gestão de Risco", sla_gr: "48 h", sla_ti: "-", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Sistema", demanda: "Abrir Processo Operacional", solicitar: "Coordenador", autoriza: "Gestão de Risco", faz: "Gestão de Risco", sla_gr: "48 h", sla_ti: "-", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Sistema", demanda: "Abrir Onboarding de Cliente", solicitar: "CS", autoriza: "Gestão de Risco", faz: "Gestão de Risco", sla_gr: "Competencia Inicial", sla_ti: "Competencia Inicial", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Sistema", demanda: "Abrir Offboarding de Cliente", solicitar: "CS", autoriza: "Gestão de Risco", faz: "Gestão de Risco", sla_gr: "Competencia Final", sla_ti: "Competencia Final", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Sistema", demanda: "Abrir Transferencia de Cliente", solicitar: "Gerentes", autoriza: "Gerentes", faz: "Gestão de Risco", sla_gr: "48 h", sla_ti: "-", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Sistema", demanda: "Vincular Processo Recorrente", solicitar: "Coordenador | Supervisor", autoriza: "Gestão de Risco", faz: "Gestão de Risco", sla_gr: "48 h", sla_ti: "-", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Sistema", demanda: "Homologar Documentos", solicitar: "Supervisor | Analista", autoriza: "Gestão de Risco", faz: "Gestão de Risco", sla_gr: "48 h", sla_ti: "-", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Sistema", demanda: "Criar TAG", solicitar: "Gerentes", autoriza: "Gerentes", faz: "T.I", sla_gr: "", sla_ti: "48h", sla_geral: "", canal: "Acessórias", dono: "T.I", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Sistema", demanda: "Vincular TAG", solicitar: "Gerentes", autoriza: "Gerentes", faz: "T.I", sla_gr: "", sla_ti: "48h", sla_geral: "", canal: "Acessórias", dono: "T.I", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Sistema", demanda: "Alterar TAG", solicitar: "Gerentes", autoriza: "Gestão de Risco", faz: "T.I", sla_gr: "", sla_ti: "48h", sla_geral: "", canal: "Acessórias", dono: "T.I", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Onboarding Colaborador", demanda: "Cadastrar usuário", solicitar: "RH", autoriza: "RH", faz: "T.I", sla_gr: "", sla_ti: "48h", sla_geral: "", canal: "Acessórias", dono: "T.I", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Colaborador Ativo", demanda: "Alterar usuário", solicitar: "Coordenador | Supervisor", autoriza: "Coordenador | Supervisor", faz: "T.I", sla_gr: "", sla_ti: "48h", sla_geral: "", canal: "Acessórias", dono: "T.I", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Offboarding Colaborador", demanda: "Inativar usuário", solicitar: "RH", autoriza: "RH", faz: "T.I", sla_gr: "", sla_ti: "48h", sla_geral: "", canal: "Acessórias", dono: "T.I", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Sistema", demanda: "Criação de Departamento", solicitar: "Head | Gerente | T.I", autoriza: "T.I", faz: "T.I", sla_gr: "", sla_ti: "48h", sla_geral: "", canal: "Acessórias", dono: "T.I", obs: "" },
  { id: u(), grupo: "Acessórias", processo: "Sistema", demanda: "Inativação de Departamento", solicitar: "Head | Gerente | T.I", autoriza: "T.I", faz: "T.I", sla_gr: "", sla_ti: "48h", sla_geral: "", canal: "Acessórias", dono: "T.I", obs: "" },
  { id: u(), grupo: "SAAM", processo: "Onboarding", demanda: "Cadastrar Empresa (CNPJ)", solicitar: "CS", autoriza: "Gestão de Risco", faz: "T.I", sla_gr: "Inicio da Competencia", sla_ti: "Inicio da Competencia", sla_geral: "-", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "SAAM", processo: "Offboarding", demanda: "Inativar Empresa (CNPJ)", solicitar: "CS", autoriza: "Gestão de Risco", faz: "T.I", sla_gr: "Final da Competencia", sla_ti: "Final da Competencia", sla_geral: "-", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "SAAM", processo: "Grupo Existente", demanda: "Cadastrar Empresa (CNPJ)", solicitar: "CS", autoriza: "Gestão de Risco", faz: "T.I", sla_gr: "", sla_ti: "48h", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "SAAM", processo: "Grupo Existente", demanda: "Vincular Certificados Digital", solicitar: "Coordenador | Supervisor", autoriza: "Coordenador | Supervisor", faz: "T.I", sla_gr: "", sla_ti: "48h", sla_geral: "", canal: "certificados@planning.com.br", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "SAAM", processo: "Onboarding Colaborador", demanda: "Cadastrar Usuário", solicitar: "RH", autoriza: "RH", faz: "T.I", sla_gr: "", sla_ti: "48h", sla_geral: "", canal: "Acessórias", dono: "T.I", obs: "" },
  { id: u(), grupo: "SAAM", processo: "Colaborador Ativo", demanda: "Alterar Usuário", solicitar: "Coordenador | Supervisor", autoriza: "Coordenador | Supervisor", faz: "T.I", sla_gr: "", sla_ti: "48h", sla_geral: "", canal: "Acessórias", dono: "T.I", obs: "" },
  { id: u(), grupo: "SAAM", processo: "Offboarding Colaborador", demanda: "Inativar usuário", solicitar: "RH", autoriza: "RH", faz: "T.I", sla_gr: "", sla_ti: "48h", sla_geral: "", canal: "Acessórias", dono: "T.I", obs: "" },
  { id: u(), grupo: "SAAM", processo: "Sistema", demanda: "Liberar Rotinas", solicitar: "Coordenador | Supervisor", autoriza: "Gestão de Risco", faz: "Gestão de Risco", sla_gr: "48 h", sla_ti: "-", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "SAAM", processo: "Sistema", demanda: "Liberar checklist", solicitar: "Coordenador | Supervisor", autoriza: "Gestão de Risco", faz: "Gestão de Risco", sla_gr: "48 h", sla_ti: "-", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "SITTAX", processo: "Onboarding", demanda: "Cadastrar Empresa (CNPJ)", solicitar: "CS", autoriza: "Gestão de Risco", faz: "Gestão de Risco", sla_gr: "Inicio da Competencia", sla_ti: "-", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "SITTAX", processo: "Offboarding", demanda: "Inativar Empresa (CNPJ)", solicitar: "CS", autoriza: "Gestão de Risco", faz: "Gestão de Risco", sla_gr: "Final da Competencia", sla_ti: "-", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "SITTAX", processo: "Grupo Existente", demanda: "Cadastrar Empresa (CNPJ)", solicitar: "Coordenador | Supervisor", autoriza: "Gestão de Risco", faz: "Gestão de Risco", sla_gr: "24 h", sla_ti: "-", sla_geral: "", canal: "Acessórias", dono: "", obs: "" },
  { id: u(), grupo: "SITTAX", processo: "Grupo Existente", demanda: "Inativar Empresa (CNPJ)", solicitar: "Coordenador | Supervisor", autoriza: "Gestão de Risco", faz: "Gestão de Risco", sla_gr: "24 h", sla_ti: "-", sla_geral: "", canal: "Acessórias", dono: "", obs: "" },
  { id: u(), grupo: "SITTAX", processo: "Sistema", demanda: "Cadastrar usuário", solicitar: "Coordenador | Supervisor", autoriza: "Gestão de Risco", faz: "Gestão de Risco", sla_gr: "24 h", sla_ti: "-", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  { id: u(), grupo: "SITTAX", processo: "Sistema", demanda: "Inativar usuário", solicitar: "Coordenador | Supervisor", autoriza: "Gestão de Risco", faz: "Gestão de Risco", sla_gr: "24 h", sla_ti: "-", sla_geral: "", canal: "Acessórias", dono: "Gestão de Risco", obs: "" },
  ];
}

// ─── SUB-COMPONENTES ─────────────────────────────────────────────────────────

const ChipRole = ({ val, cls, letter, bg, color, letterBg }: { val: string; cls?: string; letter: string; bg: string; color: string; letterBg: string }) => {
  if (!val || val === "-") return <span style={{ color: C.gray30, fontSize: 12 }}>—</span>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {val.split("|").map(v => v.trim()).filter(v => v && v !== "-").map((v, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 500, padding: "3px 7px 3px 3px", borderRadius: 6, background: bg, color, whiteSpace: "nowrap", width: "fit-content" }}>
          <span style={{ display: "inline-grid", placeItems: "center", width: 16, height: 16, borderRadius: 4, fontSize: 8, fontWeight: 800, background: letterBg, color: "#fff", flexShrink: 0 }}>{letter}</span>
          {v}
        </span>
      ))}
    </div>
  );
};

const SlaBadge = ({ val, type }: { val: string; type: "gr" | "ti" | "g" }) => {
  if (!val || val === "-") return <span style={{ color: C.gray30, fontSize: 12 }}>—</span>;
  const styles = {
    gr: { background: C.greenLt, color: C.greenDark },
    ti: { background: C.blueLt, color: "#0078A8" },
    g:  { background: C.amberLt, color: C.amber },
  }[type];
  return <span style={{ display: "inline-flex", alignItems: "center", fontSize: "10.5px", fontWeight: 600, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap", ...styles }}>{val}</span>;
};

const CanalTag = ({ val }: { val: string }) => {
  if (!val) return <span style={{ color: C.gray30, fontSize: 12 }}>—</span>;
  return <span style={{ fontSize: "10.5px", fontWeight: 600, padding: "2px 8px", borderRadius: 5, background: C.gray05, color: C.gray70, border: `1px solid ${C.border}`, width: "fit-content", display: "block" }}>{val}</span>;
};

const SectionDivider = ({ label, count }: { label: string; count: number }) => (
  <div style={{ padding: "6px 16px", background: C.gray05, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: C.gray50 }}>{label}</span>
    <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 10, background: C.gray10, color: C.gray50 }}>{count}</span>
  </div>
);

function Modal({ open, data, grupos, processos, onClose, onSave }: {
  open: boolean; data: Demanda | null; grupos: string[]; processos: string[];
  onClose: () => void; onSave: (d: Demanda) => void;
}) {
  const empty: Demanda = { id: "", grupo: "", processo: "", demanda: "", solicitar: "", autoriza: "", faz: "", dono: "", canal: "", obs: "", sla_gr: "", sla_ti: "", sla_geral: "" };
  const [form, setForm] = useState<Demanda>(empty);

  useEffect(() => { setForm(data ? { ...data } : empty); }, [data, open]);

  const set = (k: keyof Demanda) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = () => {
    if (!form.demanda.trim()) { alert("Informe a demanda."); return; }
    if (!form.grupo) { alert("Selecione o grupo."); return; }
    onSave({ ...form, id: form.id || uid() });
  };

  const fi: React.CSSProperties = { border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 10px", fontFamily: "inherit", fontSize: 12, color: C.ink, outline: "none", background: C.white, width: "100%" };
  const fl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: C.gray70, marginBottom: 4, display: "block" };

  if (!open) return null;
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: C.white, borderRadius: 16, width: 840, maxWidth: "96vw", maxHeight: "90vh", overflowY: "auto", padding: "26px 28px", boxShadow: "0 4px 16px rgba(0,0,0,.10)" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.charcoal, marginBottom: 2 }}>{data ? "Editar demanda" : "Nova demanda"}</div>
        <div style={{ fontSize: "11.5px", color: C.gray50, marginBottom: 18 }}>Preencha as informações e responsabilidades</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={fl}>Demanda *</label>
            <input style={fi} value={form.demanda} onChange={set("demanda")} placeholder="Ex: Cadastrar Empresa (CNPJ)" />
          </div>
          <div>
            <label style={fl}>Grupo *</label>
            <select style={fi} value={form.grupo} onChange={set("grupo")}>
              <option value="">Selecione</option>
              {grupos.map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label style={fl}>Processo</label>
            <select style={fi} value={form.processo} onChange={set("processo")}>
              <option value="">Selecione</option>
              {processos.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label style={fl}>Quem pode solicitar</label>
            <input style={fi} value={form.solicitar} onChange={set("solicitar")} placeholder="Ex: CS | Coordenador" />
            <div style={{ fontSize: "9.5px", color: C.gray50, fontStyle: "italic", marginTop: 2 }}>Separe múltiplos com |</div>
          </div>
          <div>
            <label style={fl}>Quem autoriza</label>
            <input style={fi} value={form.autoriza} onChange={set("autoriza")} placeholder="Ex: Gestão de Risco" />
          </div>
          <div>
            <label style={fl}>Quem faz</label>
            <input style={fi} value={form.faz} onChange={set("faz")} placeholder="Ex: T.I | Gestão de Risco" />
          </div>
          <div>
            <label style={fl}>Dono do Processo</label>
            <input style={fi} value={form.dono} onChange={set("dono")} placeholder="Ex: Gestão de Risco" />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={fl}>Canal de Abertura</label>
            <input style={fi} value={form.canal} onChange={set("canal")} placeholder="Ex: Acessórias" />
          </div>
        </div>

        <hr style={{ border: "none", borderTop: `1px solid ${C.border}`, margin: "16px 0 14px" }} />
        <div style={{ fontSize: "9.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".6px", color: C.gray50, marginBottom: 10 }}>SLA</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div><label style={fl}>SLA Gestão de Risco</label><input style={fi} value={form.sla_gr} onChange={set("sla_gr")} placeholder="Ex: 48h" /></div>
          <div><label style={fl}>SLA T.I</label><input style={fi} value={form.sla_ti} onChange={set("sla_ti")} placeholder="Ex: 48h" /></div>
          <div><label style={fl}>SLA Geral</label><input style={fi} value={form.sla_geral} onChange={set("sla_geral")} placeholder="Ex: 72h" /></div>
        </div>

        <hr style={{ border: "none", borderTop: `1px solid ${C.border}`, margin: "16px 0 14px" }} />
        <div style={{ gridColumn: "1/-1" }}>
          <label style={fl}>Observações</label>
          <textarea style={{ ...fi, resize: "vertical", minHeight: 54 }} value={form.obs} onChange={set("obs")} placeholder="Informações adicionais..." />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
          <button onClick={onClose} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: C.ink, cursor: "pointer" }}>Cancelar</button>
          <button onClick={handleSave} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.green}`, background: C.green, fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: C.black, cursor: "pointer" }}>Salvar demanda</button>
        </div>
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────

export default function MatrizRaci() {
  const [P, setP] = useState<Demanda[]>([]);
  const [grupos, setGrupos] = useState<string[]>(DEFAULT_GRUPOS);
  const [processos, setProcessos] = useState<string[]>(DEFAULT_PROCESSOS);
  const [deptos, setDeptos] = useState<string[]>(DEFAULT_DEPTOS);

  const [mainTab, setMainTab] = useState<MainTab>("raci");
  const [aTab, setATab] = useState("Todos");
  const [aProc, setAProc] = useState("Todos");
  const [view, setView] = useState<ViewMode>("raci");
  const [search, setSearch] = useState("");
  const [filtDep, setFiltDep] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editData, setEditData] = useState<Demanda | null>(null);

  const [toast, setToast] = useState({ msg: "", show: false });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Config inline-add
  const [newGrupo, setNewGrupo] = useState("");
  const [newProcesso, setNewProcesso] = useState("");
  const [newDepto, setNewDepto] = useState("");

  const showToast = useCallback((msg: string) => {
    setToast({ msg, show: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, show: false })), 2800);
  }, []);

  const persist = useCallback((data: Demanda[], grps: string[], procs: string[], dpts: string[]) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ data, grupos: grps, processos: procs, deptos: dpts })); } catch {}
  }, []);

  // Load on mount
  useEffect(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s) {
        const obj = JSON.parse(s);
        const parsed = obj.data || obj;
        const invalid = Array.isArray(parsed) && parsed.some((p: Demanda) =>
          !p.demanda || p.demanda.indexOf("DEMANDA") === 0 || p.grupo.indexOf("GRUPO") === 0
        );
        if (!invalid && Array.isArray(parsed) && parsed.length) {
          setP(parsed);
          if (obj.grupos) setGrupos(obj.grupos);
          if (obj.processos) setProcessos(obj.processos);
          if (obj.deptos) setDeptos(obj.deptos);
          return;
        }
      }
    } catch {}
    setP(defaultData());
  }, []);

  // ── DERIVED ──
  const gruposAtivos = useMemo(() => {
    const used = grupos.filter(g => P.some(p => p.grupo === g));
    const unused = grupos.filter(g => !P.some(p => p.grupo === g));
    return [...new Set([...used, ...unused])];
  }, [grupos, P]);

  const procsForTab = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    P.forEach(p => {
      if ((aTab === "Todos" || p.grupo === aTab) && p.processo && !seen.has(p.processo)) {
        seen.add(p.processo); result.push(p.processo);
      }
    });
    return result;
  }, [P, aTab]);

  const filteredList = useMemo(() => {
    const s = search.toLowerCase();
    const d = filtDep.toLowerCase();
    return P.filter(p => {
      if (aTab !== "Todos" && p.grupo !== aTab) return false;
      if (aProc !== "Todos" && p.processo !== aProc) return false;
      if (s && !(p.demanda || "").toLowerCase().includes(s)) return false;
      if (d) {
        const all = [p.solicitar, p.autoriza, p.faz, p.dono].join("|").toLowerCase();
        if (!all.includes(d)) return false;
      }
      return true;
    });
  }, [P, aTab, aProc, search, filtDep]);

  // Group by grupo > processo
  const grouped = useMemo(() => {
    const map: Record<string, Record<string, Demanda[]>> = {};
    const gkeys: string[] = [];
    filteredList.forEach(p => {
      const g = p.grupo || "Sem grupo";
      const pr = p.processo || "Sem processo";
      if (!map[g]) { map[g] = {}; gkeys.push(g); }
      if (!map[g][pr]) map[g][pr] = [];
      map[g][pr].push(p);
    });
    return { map, gkeys };
  }, [filteredList]);

  // ── CRUD ──
  const openModal = (data: Demanda | null) => { setEditData(data); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditData(null); };

  const handleSave = (entry: Demanda) => {
    const next = editData ? P.map(p => p.id === entry.id ? entry : p) : [...P, entry];
    setP(next);
    persist(next, grupos, processos, deptos);
    closeModal();
    showToast(editData ? "Demanda atualizada!" : "Demanda criada!");
  };

  const handleDelete = (id: string) => {
    if (!confirm("Excluir esta demanda?")) return;
    const next = P.filter(p => p.id !== id);
    setP(next);
    persist(next, grupos, processos, deptos);
    showToast("Demanda excluída.");
  };

  // ── IMPORT / EXPORT ──
  const handleImportXls = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "binary" });
        const ws = wb.Sheets["RACI"] || wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as string[][];
        let start = -1;
        for (let i = 0; i < rows.length; i++) {
          const v = String(rows[i][0] || "").trim();
          if (v && !v.includes("GRUPO") && !v.includes("Preencha") && v !== "Matriz RACI") { start = i; break; }
        }
        if (start < 0) { showToast("Formato inválido."); return; }
        if (String(rows[start][0]).includes("GRUPO")) start++;
        const imp: Demanda[] = [];
        for (let i = start; i < rows.length; i++) {
          const r = rows[i];
          const g = String(r[0] || "").trim(); const d = String(r[2] || "").trim();
          if (!g || !d) continue;
          imp.push({ id: uid(), grupo: g, processo: String(r[1] || "").trim(), demanda: d, solicitar: String(r[3] || "").trim(), autoriza: String(r[4] || "").trim(), faz: String(r[5] || "").trim(), sla_gr: String(r[6] || "").trim(), sla_ti: String(r[7] || "").trim(), sla_geral: String(r[8] || "").trim(), canal: String(r[9] || "").trim(), dono: String(r[10] || "").trim(), obs: String(r[11] || "").trim() });
        }
        if (!imp.length) { showToast("Nenhuma linha válida."); return; }
        setP(imp); persist(imp, grupos, processos, deptos); setATab("Todos"); setAProc("Todos");
        showToast(`${imp.length} demandas importadas!`);
      } catch (ex: unknown) { showToast("Erro: " + (ex instanceof Error ? ex.message : String(ex))); }
      e.target.value = "";
    };
    reader.readAsBinaryString(file);
  };

  const handleExportXls = () => {
    const hdr = ["Grupo de Processo", "Processo", "Demanda", "Quem pode solicitar", "Quem autoriza", "Quem faz", "SLA Gestão de Risco", "SLA T.I", "SLA Geral", "Canal de Abertura", "Dono do Processo", "Observações"];
    const rows = [hdr, ...P.map(p => [p.grupo, p.processo, p.demanda, p.solicitar, p.autoriza, p.faz, p.sla_gr, p.sla_ti, p.sla_geral, p.canal, p.dono, p.obs])];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [18, 18, 34, 18, 18, 18, 20, 14, 14, 16, 18, 30].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "RACI");
    XLSX.writeFile(wb, "matriz_raci_export.xlsx");
    showToast("Excel exportado!");
  };

  const handleBackupJson = () => {
    const d = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify({ v: 5, date: d, data: P }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `raci_backup_${d}.json`; a.click(); URL.revokeObjectURL(a.href);
    showToast("Backup salvo!");
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const obj = JSON.parse(ev.target?.result as string);
        const data = obj.data || obj;
        if (!Array.isArray(data) || !data.length) throw new Error("Formato inválido");
        setP(data); persist(data, grupos, processos, deptos); setATab("Todos"); setAProc("Todos");
        showToast(`${data.length} demandas restauradas!`);
      } catch (ex: unknown) { showToast("Erro: " + (ex instanceof Error ? ex.message : String(ex))); }
      e.target.value = "";
    };
    reader.readAsText(file);
  };

  const handleReset = () => {
    if (!confirm("Apagar todos os dados e restaurar os dados padrão?")) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    const d = defaultData();
    setP(d); setGrupos(DEFAULT_GRUPOS); setProcessos(DEFAULT_PROCESSOS); setDeptos(DEFAULT_DEPTOS);
    persist(d, DEFAULT_GRUPOS, DEFAULT_PROCESSOS, DEFAULT_DEPTOS);
    showToast("Dados restaurados ao padrão!");
  };

  // ── CONFIG HELPERS ──
  const addGrupo = () => {
    const n = newGrupo.trim(); if (!n) return;
    if (grupos.includes(n)) { showToast("Grupo já existe."); return; }
    const next = [...grupos, n]; setGrupos(next); persist(P, next, processos, deptos); setNewGrupo(""); showToast(`Grupo "${n}" adicionado!`);
  };
  const addProcesso = () => {
    const n = newProcesso.trim(); if (!n) return;
    if (processos.includes(n)) { showToast("Processo já existe."); return; }
    const next = [...processos, n]; setProcessos(next); persist(P, grupos, next, deptos); setNewProcesso(""); showToast(`Processo "${n}" adicionado!`);
  };
  const addDepto = () => {
    const n = newDepto.trim(); if (!n) return;
    if (deptos.includes(n)) { showToast("Departamento já existe."); return; }
    const next = [...deptos, n]; setDeptos(next); persist(P, grupos, processos, next); setNewDepto(""); showToast(`Departamento "${n}" adicionado!`);
  };
  const delGrupo = (i: number) => {
    const nome = grupos[i];
    const inUso = P.some(p => p.grupo === nome);
    if (inUso && !confirm(`"${nome}" está em uso. Remover mesmo assim?`)) return;
    const next = grupos.filter((_, j) => j !== i); setGrupos(next); persist(P, next, processos, deptos); showToast(`"${nome}" removido.`);
  };
  const delProcesso = (i: number) => {
    const nome = processos[i];
    const inUso = P.some(p => p.processo === nome);
    if (inUso && !confirm(`"${nome}" está em uso. Remover mesmo assim?`)) return;
    const next = processos.filter((_, j) => j !== i); setProcessos(next); persist(P, grupos, next, deptos); showToast(`"${nome}" removido.`);
  };
  const delDepto = (i: number) => {
    const nome = deptos[i]; const next = deptos.filter((_, j) => j !== i); setDeptos(next); persist(P, grupos, processos, next); showToast(`"${nome}" removido.`);
  };

  // ── STYLES ──
  const btnStyle = (active?: boolean): React.CSSProperties => ({
    fontFamily: "inherit", fontSize: 11, fontWeight: 600, padding: "7px 14px", borderRadius: 8,
    border: `1px solid ${active ? C.black : C.border}`, background: active ? C.black : C.white,
    color: active ? "#fff" : C.gray50, cursor: "pointer",
  });
  const tabRow: React.CSSProperties = { display: "flex", gap: 0, borderBottom: `2px solid ${C.border}`, marginBottom: 18 };
  const mainTabStyle = (active: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit", fontSize: 12, fontWeight: 600,
    padding: "10px 16px", border: "none", background: "none",
    color: active ? C.greenDark : C.gray50, cursor: "pointer",
    borderBottom: active ? `2px solid ${C.green}` : "2px solid transparent", marginBottom: -2,
  });
  const groupTabStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "7px 16px", borderRadius: 9,
    border: "none", background: active ? C.black : "none", color: active ? "#fff" : C.gray50, cursor: "pointer",
  });
  const procTabStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: "inherit", fontSize: 11, fontWeight: 600, padding: "5px 13px", borderRadius: 20,
    border: `1px solid ${active ? C.gray30 : C.border}`, background: active ? C.gray10 : C.white,
    color: active ? C.charcoal : C.gray50, cursor: "pointer", whiteSpace: "nowrap",
  });

  const RACI_TPL = "2fr 1.1fr 1.1fr 1.1fr 130px 1fr 60px";
  const SLA_TPL = "2fr 1.3fr 1.1fr 1fr 130px 60px";

  const icBtn = (onClick: () => void, danger?: boolean, title?: string, children?: React.ReactNode) => (
    <button onClick={onClick} title={title} style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.gray50 }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = danger ? C.redLt : C.gray05; (e.currentTarget as HTMLElement).style.color = danger ? C.red : C.ink; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = C.gray50; }}>
      {children}
    </button>
  );

  return (
    <div style={{ fontFamily: "'Poppins', sans-serif", background: C.offWhite, minHeight: "100vh", fontSize: 14, WebkitFontSmoothing: "antialiased" }}>

      {/* TOPBAR */}
      <div style={{ background: C.black, height: 54, display: "flex", alignItems: "center", padding: "0 22px", gap: 10, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ width: 30, height: 30, background: C.green, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, color: C.black }}>P</div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, color: "rgba(255,255,255,.4)", fontSize: 11, fontWeight: 500 }}>
          <span>Portal</span><span style={{ color: "rgba(255,255,255,.25)" }}>›</span>
          <strong style={{ color: "#fff" }}>Matriz RACI</strong>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <button onClick={() => openModal(null)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 13px", borderRadius: 8, border: `1px solid ${C.green}`, background: C.green, fontFamily: "inherit", fontSize: 11, fontWeight: 600, color: C.black, cursor: "pointer" }}>
            + Nova demanda
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "22px 22px 80px" }}>

        {/* MAIN TABS */}
        <div style={tabRow}>
          <button style={mainTabStyle(mainTab === "raci")} onClick={() => setMainTab("raci")}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
            Matriz RACI
          </button>
          <button style={mainTabStyle(mainTab === "config")} onClick={() => setMainTab("config")}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            Configuração
          </button>
        </div>

        {/* ── ABA RACI ── */}
        {mainTab === "raci" && (
          <div>
            {/* GROUP TABS */}
            <div style={{ display: "flex", gap: 0, background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 4, marginBottom: 8, flexWrap: "wrap", boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
              {["Todos", ...gruposAtivos].map(g => (
                <button key={g} style={groupTabStyle(aTab === g)} onClick={() => { setATab(g); setAProc("Todos"); }}>{g}</button>
              ))}
            </div>

            {/* PROC TABS */}
            {procsForTab.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                {["Todos", ...procsForTab].map(p => (
                  <button key={p} style={procTabStyle(aProc === p)} onClick={() => setAProc(p)}>{p}</button>
                ))}
              </div>
            )}

            {/* TOOLBAR */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              <div style={{ position: "relative", minWidth: 180, maxWidth: 260 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13" style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", opacity: 0.4, pointerEvents: "none" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar demanda..." style={{ width: "100%", fontFamily: "inherit", fontSize: 12, padding: "8px 10px 8px 32px", border: `1px solid ${C.border}`, borderRadius: 10, background: C.white, color: C.ink, outline: "none" }} />
              </div>
              <select value={filtDep} onChange={e => setFiltDep(e.target.value)} style={{ fontFamily: "inherit", fontSize: 12, padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 10, background: C.white, color: C.ink, outline: "none", cursor: "pointer" }}>
                <option value="">Todos os deptos</option>
                {deptos.map(d => <option key={d}>{d}</option>)}
              </select>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 12, background: C.gray10, color: C.gray50 }}>{filteredList.length} {filteredList.length === 1 ? "demanda" : "demandas"}</span>
              <div style={{ display: "flex", gap: 3, marginLeft: "auto" }}>
                <button style={btnStyle(view === "raci")} onClick={() => setView("raci")}>RACI</button>
                <button style={btnStyle(view === "sla")} onClick={() => setView("sla")}>SLA</button>
              </div>
            </div>

            {/* TABLE */}
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "auto", boxShadow: "0 1px 4px rgba(0,0,0,.06)", maxHeight: "calc(100vh - 280px)" }}>
              {filteredList.length === 0 ? (
                <div style={{ padding: "52px 20px", textAlign: "center", color: C.gray30 }}>
                  <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                  <p style={{ fontSize: 12, marginTop: 8, color: C.gray50 }}>Nenhuma demanda. Clique em + Nova demanda.</p>
                </div>
              ) : (
                <>
                  {/* HEADER */}
                  <div style={{ display: "grid", gridTemplateColumns: view === "raci" ? RACI_TPL : SLA_TPL, padding: "9px 16px", background: C.gray05, borderBottom: `2px solid ${C.border}`, position: "sticky", top: 0, zIndex: 10 }}>
                    {(view === "raci"
                      ? ["Demanda / Processo", "Quem pode solicitar", "Quem autoriza", "Quem faz", "Canal de abertura", "Dono do processo", ""]
                      : ["Demanda / Processo", "SLA Gest. Risco", "SLA T.I", "SLA Geral", "Canal", ""]
                    ).map(h => <div key={h} style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".8px", textTransform: "uppercase", color: C.gray70 }}>{h}</div>)}
                  </div>

                  {/* ROWS */}
                  {grouped.gkeys.map(g => (
                    Object.keys(grouped.map[g]).map(proc => {
                      const items = grouped.map[g][proc];
                      const secLabel = aTab === "Todos" ? `${g} › ${proc}` : proc;
                      return (
                        <div key={g + proc}>
                          <SectionDivider label={secLabel} count={items.length} />
                          {items.map(p => (
                            <div key={p.id} style={{ display: "grid", gridTemplateColumns: view === "raci" ? RACI_TPL : SLA_TPL, borderBottom: `1px solid #F4F4F6`, alignItems: "stretch" }}>
                              <div style={{ padding: "11px 0 11px 16px", display: "flex", flexDirection: "column", justifyContent: "flex-start" }}>
                                <div style={{ fontSize: "12.5px", fontWeight: 600, color: C.charcoal, lineHeight: 1.35 }}>{p.demanda}</div>
                                {p.obs && <div style={{ fontSize: 10, color: C.gray50, marginTop: 2 }}>{p.obs}</div>}
                              </div>
                              {view === "raci" ? (
                                <>
                                  <div style={{ padding: "11px 16px 11px 0" }}><ChipRole val={p.solicitar} letter="S" bg={C.blueLt} color="#006B8A" letterBg={C.blue} /></div>
                                  <div style={{ padding: "11px 16px 11px 0" }}><ChipRole val={p.autoriza} letter="A" bg={C.amberLt} color="#8B3A00" letterBg={C.amber} /></div>
                                  <div style={{ padding: "11px 16px 11px 0" }}><ChipRole val={p.faz} letter="F" bg={C.greenLt} color={C.greenDark} letterBg={C.greenDark} /></div>
                                  <div style={{ padding: "11px 16px 11px 0" }}><CanalTag val={p.canal} /></div>
                                  <div style={{ padding: "11px 16px 11px 0" }}><ChipRole val={p.dono} letter="D" bg={C.purpleLt} color={C.purple} letterBg={C.purple} /></div>
                                </>
                              ) : (
                                <>
                                  <div style={{ padding: "11px 16px 11px 0" }}><SlaBadge val={p.sla_gr} type="gr" /></div>
                                  <div style={{ padding: "11px 16px 11px 0" }}><SlaBadge val={p.sla_ti} type="ti" /></div>
                                  <div style={{ padding: "11px 16px 11px 0" }}><SlaBadge val={p.sla_geral} type="g" /></div>
                                  <div style={{ padding: "11px 16px 11px 0" }}><CanalTag val={p.canal} /></div>
                                </>
                              )}
                              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", padding: "10px 10px 10px 0", alignItems: "flex-start" }}>
                                {icBtn(() => openModal(p), false, "Editar",
                                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                )}
                                {icBtn(() => handleDelete(p.id), true, "Excluir",
                                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })
                  ))}

                  {/* LEGEND */}
                  {view === "raci" && (
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", padding: "10px 16px", borderTop: `1px solid ${C.border}`, background: C.gray05 }}>
                      {[
                        { l: "S", label: "Solicita", bg: C.blueLt, color: "#006B8A", lb: C.blue },
                        { l: "A", label: "Autoriza", bg: C.amberLt, color: "#8B3A00", lb: C.amber },
                        { l: "F", label: "Faz", bg: C.greenLt, color: C.greenDark, lb: C.greenDark },
                        { l: "D", label: "Dono", bg: C.purpleLt, color: C.purple, lb: C.purple },
                      ].map(({ l, label, bg, color, lb }) => (
                        <span key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "9.5px", color: C.gray50, fontWeight: 500 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 500, padding: "3px 7px 3px 3px", borderRadius: 6, background: bg, color }}>
                            <span style={{ display: "inline-grid", placeItems: "center", width: 16, height: 16, borderRadius: 4, fontSize: 8, fontWeight: 800, background: lb, color: "#fff" }}>{l}</span>
                            {label}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── ABA CONFIG ── */}
        {mainTab === "config" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
              {/* GRUPOS */}
              <ConfigCard title="Grupos de Processo" sub="Categorias principais da matriz">
                {grupos.map((g, i) => (
                  <CfgItem key={g} name={g} count={P.filter(p => p.grupo === g).length} onDel={() => delGrupo(i)} />
                ))}
                {!grupos.length && <div style={{ padding: 20, textAlign: "center", fontSize: 11, color: C.gray30 }}>Nenhum cadastrado</div>}
                <CfgAddRow value={newGrupo} onChange={setNewGrupo} onAdd={addGrupo} placeholder="Nome do grupo..." />
              </ConfigCard>
              {/* PROCESSOS */}
              <ConfigCard title="Processos" sub="Sub-categorias dentro dos grupos">
                {processos.map((p, i) => (
                  <CfgItem key={p} name={p} count={P.filter(d => d.processo === p).length} onDel={() => delProcesso(i)} />
                ))}
                {!processos.length && <div style={{ padding: 20, textAlign: "center", fontSize: 11, color: C.gray30 }}>Nenhum cadastrado</div>}
                <CfgAddRow value={newProcesso} onChange={setNewProcesso} onAdd={addProcesso} placeholder="Nome do processo..." />
              </ConfigCard>
              {/* DEPTOS */}
              <ConfigCard title="Departamentos" sub="Quem pode solicitar, autorizar e fazer">
                {deptos.map((d, i) => {
                  const cnt = P.filter(p => [p.solicitar, p.autoriza, p.faz, p.dono].join("|").includes(d)).length;
                  return <CfgItem key={d} name={d} count={cnt} onDel={() => delDepto(i)} dotColor={C.blue} />;
                })}
                {!deptos.length && <div style={{ padding: 20, textAlign: "center", fontSize: 11, color: C.gray30 }}>Nenhum departamento</div>}
                <CfgAddRow value={newDepto} onChange={setNewDepto} onAdd={addDepto} placeholder="Nome do departamento..." />
              </ConfigCard>
            </div>

            {/* DADOS E BACKUP */}
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.06)", marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.charcoal }}>Dados e Backup</div>
                  <div style={{ fontSize: 10, color: C.gray50, marginTop: 2 }}>Importar, exportar e gerenciar os dados da matriz</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10, padding: "14px 16px" }}>
                <DataBtn color={C.blue} title="Importar Excel" sub="Substitui os dados por uma planilha .xlsx">
                  <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleImportXls} />
                </DataBtn>
                <DataBtn color={C.gray50} title="Restaurar backup" sub="Carrega um arquivo .json salvo anteriormente" onClick={() => {}}>
                  <input type="file" accept=".json" style={{ display: "none" }} onChange={handleImportJson} />
                </DataBtn>
                <DataBtn color={C.amber} title="Backup JSON" sub="Salva uma cópia completa dos dados atuais" onClick={handleBackupJson} />
                <DataBtn color={C.gray50} title="Exportar Excel" sub="Baixa todas as demandas em planilha .xlsx" onClick={handleExportXls} />
                <DataBtn color={C.red} title="Resetar dados" sub="Apaga tudo e restaura os dados padrão" onClick={handleReset} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL */}
      <Modal open={modalOpen} data={editData} grupos={grupos} processos={processos} onClose={closeModal} onSave={handleSave} />

      {/* TOAST */}
      <div style={{ position: "fixed", bottom: 20, right: 20, background: C.black, color: "#fff", padding: "10px 16px", borderRadius: 10, fontFamily: "inherit", fontSize: "11.5px", fontWeight: 600, display: "flex", alignItems: "center", gap: 7, zIndex: 2000, pointerEvents: "none", boxShadow: "0 4px 16px rgba(0,0,0,.10)", transition: "all .25s", transform: toast.show ? "translateY(0)" : "translateY(14px)", opacity: toast.show ? 1 : 0 }}>
        <svg width="12" height="12" fill="none" stroke={C.green} strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        {toast.msg}
      </div>
    </div>
  );
}

// ─── CONFIG SUB-COMPONENTS ───────────────────────────────────────────────────

function ConfigCard({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.charcoal }}>{title}</div>
          <div style={{ fontSize: 10, color: C.gray50, marginTop: 2 }}>{sub}</div>
        </div>
      </div>
      <div style={{ padding: 8 }}>{children}</div>
    </div>
  );
}

function CfgItem({ name, count, onDel, dotColor }: { name: string; count: number; onDel: () => void; dotColor?: string }) {
  const [hover, setHover] = useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: hover ? C.gray05 : "transparent" }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor || C.green, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: C.charcoal }}>{name}</span>
      {count > 0 && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 10, background: C.gray10, color: C.gray50 }}>{count} dem.</span>}
      <button onClick={onDel} style={{ width: 22, height: 22, borderRadius: 5, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.gray30, opacity: hover ? 1 : 0 }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.redLt; (e.currentTarget as HTMLElement).style.color = C.red; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = C.gray30; }}>
        <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  );
}

function CfgAddRow({ value, onChange, onAdd, placeholder }: { value: string; onChange: (v: string) => void; onAdd: () => void; placeholder: string }) {
  return (
    <div style={{ display: "flex", gap: 6, padding: 8 }}>
      <input value={value} onChange={e => onChange(e.target.value)} onKeyDown={e => e.key === "Enter" && onAdd()} placeholder={placeholder}
        style={{ flex: 1, fontFamily: "inherit", fontSize: 12, padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 8, outline: "none", color: C.ink }} />
      <button onClick={onAdd} style={{ fontFamily: "inherit", fontSize: 11, fontWeight: 700, padding: "7px 12px", borderRadius: 8, border: "none", background: C.green, color: C.black, cursor: "pointer" }}>+</button>
    </div>
  );
}

function DataBtn({ title, sub, color, onClick, children }: { title: string; sub: string; color: string; onClick?: () => void; children?: React.ReactNode }) {
  const [hover, setHover] = useState(false);
  const isLabel = !!children;
  const style: React.CSSProperties = { display: "flex", alignItems: "flex-start", gap: 10, textAlign: "left", padding: 12, borderRadius: 10, border: `1px solid ${C.border}`, background: hover ? C.gray05 : C.white, cursor: "pointer", fontFamily: "inherit", position: "relative", width: "100%", transition: "all .15s" };
  const inner = (
    <>
      <svg width="15" height="15" fill="none" stroke={color} strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
      <div><div style={{ fontSize: 12, fontWeight: 700, color: C.charcoal }}>{title}</div><div style={{ fontSize: 10, color: C.gray50, marginTop: 2, lineHeight: 1.4 }}>{sub}</div></div>
      {children}
    </>
  );
  if (isLabel) return (
    <label style={style} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>{inner}</label>
  );
  return (
    <button style={style} onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>{inner}</button>
  );
}
