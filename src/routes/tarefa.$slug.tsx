import { createFileRoute, Link } from "@tanstack/react-router";
import { HubShell } from "@/components/HubShell";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { getVersaoAtivaHtmlTarefa } from "@/lib/tarefas-versoes";
import { OkrAccessGate, OkrSessionBadge } from "@/components/OkrAccessGate";
import type { OkrSessao } from "@/lib/okr-acessos";
import PainelOKR from "@/components/PainelOKR";

const tarefas: Record<string, { nome: string; descricao: string }> = {
  "painel-okr": {
    nome: "Painel de OKRs",
    descricao: "Acompanhamento visual dos objetivos, resultados-chave e evolução dos OKRs.",
  },
};

const htmlQO = (slug: string) =>
  queryOptions({
    queryKey: ["tarefa-html", slug],
    queryFn: () => getVersaoAtivaHtmlTarefa(slug),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });

function prepareTarefaHtml(slug: string, html: string, sessao?: { nome: string; perfil: "gestor" | "colaborador" }) {
  if (slug !== "painel-okr") return html;

  const sessaoJson = JSON.stringify(sessao ?? null);

  const okrLoginFix = `<style id="okr-hide-login">.login-screen{display:none!important}</style>
<script>
window.OKR_LOGIN_FIX_V3=true;
window.OKR_SESSAO_EXTERNA=${sessaoJson};
(function(){
  function norm(s){return String(s||"").trim().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").replace(/\\s+/g," ").toLowerCase();}
  function gestor(nome){var n=norm(nome);return n==="fernanda"||n.indexOf("fernanda ")===0;}
  function nomePessoaLocal(p){try{return typeof nomePessoa==="function"?nomePessoa(p):(typeof p==="string"?p:(p&&p.nome?p.nome:""));}catch(e){return typeof p==="string"?p:(p&&p.nome?p.nome:"");}}
  window.normalizaNome=norm;
  window.usuarioEhGestorPadrao=gestor;
  window.findUsuario=function(nome){
    var nn=norm(nome),list=(typeof getUsuarios==="function"?getUsuarios():[]);
    var exact=list.find(function(u){return norm(typeof usuarioNome==="function"?usuarioNome(u):(u&&u.nome))===nn;});
    if(exact)return exact;
    return list.find(function(u){var un=norm(typeof usuarioNome==="function"?usuarioNome(u):(u&&u.nome));return nn.length>=4&&un&&((un.indexOf(nn)===0)||(nn.indexOf(un)===0&&nn.length-un.length<=2));});
  };
  window.syncUsuariosComPessoas=function(){
    var pessoas=Array.isArray(window.PESSOAS)?window.PESSOAS:[];
    if(!Array.isArray(window.USUARIOS))window.USUARIOS=[];
    var temGestor=pessoas.some(function(p){return gestor(nomePessoaLocal(p));});
    if(!window.USUARIOS.length){window.USUARIOS=pessoas.map(function(p,i){var n=nomePessoaLocal(p),g=gestor(n)||(!temGestor&&i===0);return {nome:n,perfil:g?"gestor":"colaborador",permissao:g?"total":"minhas_atividades",ativo:true};});}
    pessoas.forEach(function(p){var n=nomePessoaLocal(p),g=gestor(n);if(n&&!window.findUsuario(n))window.USUARIOS.push({nome:n,perfil:g?"gestor":"colaborador",permissao:g?"total":"minhas_atividades",ativo:true});});
    ["Fernanda","Fernanda Soares"].forEach(function(n){var u=window.findUsuario(n);if(!u){window.USUARIOS.push({nome:n,perfil:"gestor",permissao:"total",ativo:true});}else{u.perfil="gestor";u.permissao="total";u.ativo=true;}});
  };
  function autoLogin(){
    var ext=window.OKR_SESSAO_EXTERNA;
    if(!ext||!ext.nome)return false;
    if(typeof window.aplicarSessao!=="function")return false;
    try{
      if(typeof window.syncUsuariosComPessoas==="function")window.syncUsuariosComPessoas();
      var u=window.findUsuario(ext.nome);
      if(!u){
        if(!Array.isArray(window.USUARIOS))window.USUARIOS=[];
        u={nome:ext.nome,perfil:ext.perfil||"colaborador",permissao:ext.perfil==="gestor"?"total":"minhas_atividades",ativo:true};
        window.USUARIOS.push(u);
      }else{
        u.perfil=ext.perfil||u.perfil;
        u.permissao=ext.perfil==="gestor"?"total":(u.permissao||"minhas_atividades");
        u.ativo=true;
      }
      var ini=(typeof iniciaisNome==="function"?iniciaisNome(u.nome):(u.nome||"?").slice(0,2).toUpperCase());
      if(window._sessao){window._sessao.nome=u.nome;window._sessao.perfil=u.perfil;window._sessao.permissao=u.permissao;window._sessao.iniciais=ini;}
      try{if(window.SESSION_KEY)sessionStorage.setItem(window.SESSION_KEY,JSON.stringify(window._sessao||{nome:u.nome,perfil:u.perfil,permissao:u.permissao,iniciais:ini}));}catch(e){}
      window.aplicarSessao();
      var ls=document.getElementById("loginScreen");if(ls)ls.style.display="none";
      return true;
    }catch(e){console.warn("autoLogin OKR falhou",e);}
    return false;
  }
  window.OKR_AUTO_LOGIN=autoLogin;
  function tentar(){
    if(autoLogin())return;
    var n=0,iv=setInterval(function(){n++;if(autoLogin()||n>60)clearInterval(iv);},150);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",tentar);else tentar();
  window.addEventListener("load",tentar);
})();
<\/script>`;

  const okrHubSync = `<script>
(function(){
  if(window.OKR_HUB_SYNC_V1)return;window.OKR_HUB_SYNC_V1=true;
  var BASE=location.origin+"/api/public/okr-sync";
  var MAP={"painel_okr_v3":"painel","painel_impl_v1":"implantacao"};
  // 1) Pré-carrega estado do banco para o localStorage ANTES dos scripts do app rodarem
  function pull(key,chave){
    try{
      var x=new XMLHttpRequest();
      x.open("GET",BASE+"?chave="+encodeURIComponent(chave),false); // sync
      x.send(null);
      if(x.status>=200&&x.status<300){
        var r=JSON.parse(x.responseText||"{}");
        if(r&&r.dados&&Object.keys(r.dados).length){
          localStorage.setItem(key,JSON.stringify(r.dados));
        }
      }
    }catch(e){console.warn("OKR pull falhou",chave,e);}
  }
  Object.keys(MAP).forEach(function(k){pull(k,MAP[k]);});
  // 2) Intercepta writes e empurra para o banco (debounce)
  var timers={};
  function push(key,value){
    var chave=MAP[key];if(!chave)return;
    clearTimeout(timers[chave]);
    timers[chave]=setTimeout(function(){
      try{
        var body=JSON.parse(value);
        var autor=(window.OKR_SESSAO_EXTERNA&&window.OKR_SESSAO_EXTERNA.nome)||"";
        fetch(BASE+"?chave="+encodeURIComponent(chave),{
          method:"POST",
          headers:{"Content-Type":"application/json","X-Okr-Autor":autor},
          body:JSON.stringify(body)
        }).catch(function(e){console.warn("OKR push falhou",chave,e);});
      }catch(e){}
    },600);
  }
  var orig=Storage.prototype.setItem;
  Storage.prototype.setItem=function(k,v){
    var r=orig.apply(this,arguments);
    if(this===localStorage&&MAP[k])push(k,v);
    return r;
  };
})();
<\/script>`;

  let out = html;
  if (out.includes("<head>")) out = out.replace("<head>", `<head>${okrHubSync}`);
  else out = `${okrHubSync}${out}`;
  // Insere antes do ÚLTIMO </body> (o primeiro pode estar dentro de strings JS do exportarHTML)
  const idx = out.lastIndexOf("</body>");
  if (idx >= 0) out = out.slice(0, idx) + okrLoginFix + out.slice(idx);
  else out = `${out}${okrLoginFix}`;
  return out;
}

export const Route = createFileRoute("/tarefa/$slug")({
  head: ({ params }) => ({
    meta: [{ title: `${tarefas[params.slug]?.nome ?? "Tarefa"} — Planning Hub` }],
  }),
  loader: ({ context, params }) => context.queryClient.fetchQuery(htmlQO(params.slug)),
  component: TarefaPage,
});

function TarefaPage() {
  const { slug } = Route.useParams();
  const t = tarefas[slug];
  const { data: html } = useSuspenseQuery(htmlQO(slug));
  const fallbackSrc = `/tarefas/${slug}.html`;

  if (!t) {
    return (
      <HubShell>
        <div className="max-w-[1280px] mx-auto px-8 py-8">
          <Link to="/tarefas" className="text-sm text-muted-foreground">← Voltar</Link>
          <p className="mt-6">Tarefa não encontrada.</p>
        </div>
      </HubShell>
    );
  }

  const conteudo = (sessao?: OkrSessao, extras?: React.ReactNode) => {
    const preparedHtml = html
      ? prepareTarefaHtml(slug, html, sessao ? { nome: sessao.nome, perfil: sessao.perfil } : undefined)
      : null;
    return (
      <div className="w-full px-2 py-1">
        <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
          <div className="flex items-center gap-3">
            <Link to="/tarefas" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-charcoal">
              <ArrowLeft size={13} /> Gestão de Tarefas
            </Link>
            <span className="text-muted-foreground/40">·</span>
            <h1 className="text-[14px] font-bold text-charcoal leading-tight">{t.nome}</h1>
          </div>
          <div className="flex items-center gap-2">
            {extras}
            <a href={fallbackSrc} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-charcoal border border-border rounded-md px-3 py-1 hover:bg-secondary">
              Abrir em tela cheia <ExternalLink size={12} />
            </a>
            <Link to="/admin" className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-charcoal border border-border rounded-md px-3 py-1 hover:bg-secondary">
              Atualizar HTML ↗
            </Link>
          </div>
        </div>
        {preparedHtml ? (
          <iframe
            srcDoc={preparedHtml}
            sandbox="allow-scripts allow-forms allow-popups allow-downloads"
            title={t.nome}
            className="w-full border border-border rounded-lg bg-white"
            style={{ height: "calc(100vh - 44px)" }}
          />

        ) : (
          <iframe
            src={fallbackSrc}
            title={t.nome}
            className="w-full border border-border rounded-lg bg-white"
            style={{ height: "calc(100vh - 44px)" }}
          />
        )}
      </div>
    );
  };

  if (slug === "painel-okr") {
    return (
      <HubShell>
        <OkrAccessGate>
          {(sessao, logout) => (
            <div className="w-full">
              <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border bg-white">
                <div className="flex items-center gap-3">
                  <Link to="/tarefas" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-charcoal">
                    <ArrowLeft size={13} /> Gestão de Tarefas
                  </Link>
                  <span className="text-muted-foreground/40">·</span>
                  <h1 className="text-[14px] font-bold text-charcoal leading-tight">{t.nome}</h1>
                </div>
                <OkrSessionBadge sessao={sessao} onLogout={logout} />
              </div>
              <PainelOKR />
            </div>
          )}
        </OkrAccessGate>
      </HubShell>
    );
  }


  return <HubShell>{conteudo()}</HubShell>;
}
