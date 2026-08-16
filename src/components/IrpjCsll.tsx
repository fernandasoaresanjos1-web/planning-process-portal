import { useState, useMemo, useRef, useEffect } from "react";
import { parseAutomacaoCSV, parseDominioXLSX, mergeIrpjData, loadStoredIrpj, pushSharedIrpj, clearSharedIrpj, syncSharedIrpj, buildIrpjMeses, type IrpjReg } from "@/lib/import-processos";
import { biLoadAll, biIsLucroReal, biHasTag, biGetTag } from "@/lib/bi-empresas";
import { exportXlsx } from "@/lib/export-xlsx";



// ── TIPOS ──────────────────────────────────────────────────────────────────────
interface Reg {
  cn: string; em: string; re: string; gr: string; ec: string;
  tem_aut: boolean; sub: string; mas: string; ult: string;
  tem_dom: boolean; mdom: string[]; udom: string[]; ndom: number;
  sit: string;
}
interface StatsMes { aut: number; dom: number; total: number; }

// ── DADOS ─────────────────────────────────────────────────────────────────────
const RAW = {"regs":[{"cn":"65.506.196/0001-36","em":"3RN SECURITIZADORA S.A.","re":"Lucro Real - Geral","gr":"Grupo 3Rn","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"28.810.269/0001-52","em":"4E EQUIPAMENTOS PARA CAMINHOES LTDA","re":"Lucro Real - Geral","gr":"Grupo Benja","ec":"Equipe Contábil 3","tem_aut":true,"sub":"trimestral","mas":"2026-04","ult":"✅ 04/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"65.268.205/0001-06","em":"A2M2 VENTURES LTDA","re":"Lucro Real - Geral","gr":"Grupo Accerte Tecnologia","ec":"Equipe Contábil 7","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"10.452.500/0001-18","em":"ACCERTE TECNOLOGIA DA INFORMACAO LTDA","re":"Lucro Real - Geral","gr":"Grupo Accerte Tecnologia","ec":"Equipe Contábil 7","tem_aut":true,"sub":"estimativa","mas":"2026-03","ult":"✅ 03/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"08.811.370/0001-10","em":"ACREFORT INDUSTRIA E COMERCIO DE RAÇÕES LTDA","re":"Lucro Real - Geral","gr":"Grupo Acrefort","ec":"Equipe Contábil 6","tem_aut":true,"sub":"estimativa","mas":"2026-04","ult":"✅ 04/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"05.616.807/0001-77","em":"ACRESUL INDUSTRIA E COMERCIO LTDA","re":"Lucro Real - Geral","gr":"Grupo Acrefort","ec":"Equipe Contábil 6","tem_aut":true,"sub":"trimestral","mas":"2026-04","ult":"✅ 04/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"64.721.644/0001-51","em":"ADORE ARTISTAS LTDA","re":"Lucro Real - Geral","gr":"Grupo Adore","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"07.134.550/0001-42","em":"AGROLOGICA AGROMERCANTIL LTDA","re":"Lucro Real - Geral","gr":"Grupo Agrológica","ec":"Equipe Contábil 5","tem_aut":true,"sub":"estimativa","mas":"2026-04","ult":"✅ 04/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"28.331.375/0001-53","em":"AGROPECUARIA MACHADINHO S/A","re":"Lucro Real - Geral","gr":"Grupo Machadinho","ec":"Equipe Contábil 2","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":true,"mdom":["2026-03"],"udom":["MAYSA.CAIXETA"],"ndom":1,"sit":"so_dominio"},{"cn":"08.382.570/0001-03","em":"AGROSANTA AGROPECUÁRIA SANTAREM LTDA","re":"Lucro Real - Geral","gr":"Grupo Agrosanta","ec":"Equipe Contábil 2","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"24.552.976/0001-35","em":"AKTIE NOW SERVICOS TECNOLOGICOS E EMPRESARIAIS LTDA","re":"Lucro Real - Geral","gr":"Grupo Coaktion","ec":"Equipe Contábil 3","tem_aut":true,"sub":"trimestral","mas":"2026-02","ult":"✅ 02/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"33.108.579/0001-60","em":"AKTIE PARTICIPACOES LTDA.","re":"Lucro Real - Geral","gr":"Grupo Coaktion","ec":"Equipe Contábil 3","tem_aut":true,"sub":"trimestral","mas":"2026-04","ult":"✅ 04/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"20.089.903/0001-06","em":"AMAZING FANS IMPORTACAO E COMERCIO DE PRODUTOS ELETRONICOS LTDA","re":"Lucro Real - Geral","gr":"Grupo Amazing Brasil","ec":"Equipe Contábil 7","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":true,"mdom":["2026-03"],"udom":["ANELYSA.O"],"ndom":1,"sit":"so_dominio"},{"cn":"49.967.961/0001-69","em":"AMERICANFLEX INDUSTRIAS REUNIDAS LTDA","re":"Lucro Real - Geral","gr":"Grupo AMX","ec":"Equipe Contábil 1","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"21.479.092/0001-04","em":"AMX COLCHOES MG LTDA","re":"Lucro Real - Geral","gr":"Grupo AMX","ec":"Equipe Contábil 1","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"06.859.452/0001-00","em":"APPLE NORDESTE COMERCIO DE ALIMENTOS LTDA","re":"Lucro Real - Geral","gr":"Grupo MC Donalds - Apple","ec":"Equipe Contábil 1","tem_aut":true,"sub":"trimestral","mas":"2026-04","ult":"✅ 04/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"44.777.817/0001-46","em":"ARZ MED DISTRIBUIDORA DE MEDICAMENTOS E PRODUTOS HOSPITALARES LTDA","re":"Lucro Real - Geral","gr":"Grupo Arz Med","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"27.673.702/0001-92","em":"ATACADAO BATERIAS LTDA","re":"Lucro Real - Geral","gr":"Grupo Atacadão","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"10.426.136/0001-11","em":"AUVO TECNOLOGIA SA","re":"Lucro Real - Geral","gr":"Grupo Auvo","ec":"Equipe Contábil 10","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"66.009.504/0001-80","em":"AUVP ASSESSOR DE INVESTIMENTOS LTDA","re":"Lucro Real - Geral","gr":"Grupo Supernova","ec":"Equipe Contábil 7","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"49.479.036/0001-99","em":"AUVP CONSULTORIA FINANCEIRA DE INVESTIMENTOS LTDA","re":"Lucro Real - Geral","gr":"Grupo Supernova","ec":"Equipe Contábil 7","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"58.180.857/0001-10","em":"AUVP CONSULTORIA FINANCEIRA DE INVESTIMENTOS SCP.","re":"Lucro Real - Geral","gr":"Grupo Supernova","ec":"Equipe Contábil 7","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"61.277.277/0001-50","em":"AUVP CORRETORA DE SEGUROS LTDA","re":"Lucro Real - Geral","gr":"Grupo Supernova","ec":"Equipe Contábil 7","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"63.672.926/0001-43","em":"AUVP SERVICOS DE CORRESPONDENTE BANCARIO LTDA","re":"Lucro Real - Geral","gr":"Grupo Supernova","ec":"Equipe Contábil 7","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"44.698.202/0001-24","em":"AWK CAFE LTDA","re":"Lucro Real - Geral","gr":"Grupo Awake","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"32.970.654/0001-34","em":"AWK CLINICA DE SAUDE INTEGRATIVA LTDA","re":"Lucro Real - Geral","gr":"Grupo Awake","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"28.496.506/0001-52","em":"BEBIDASNET ARAUJO LTDA","re":"Lucro Real - Geral","gr":"Grupo Boteco Raiz","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"97.415.673/0001-44","em":"BENJA DISTRIBUIDORA DE EQUIPAMENTOS E ACESSORIOS PARA CAMINHOES LTDA","re":"Lucro Real - Geral","gr":"Grupo Benja","ec":"Equipe Contábil 3","tem_aut":true,"sub":"trimestral","mas":"2026-05","ult":"✅ 05/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"17.623.397/0001-70","em":"BERE COMERCIO DE PERFUMES E COSMETICOS S/A","re":"Lucro Real - Geral","gr":"Grupo Natureza","ec":"Equipe Contábil 8","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"32.538.029/0001-18","em":"BIOMINAS DISTRIBUIDORA DE MEDICAMENTOS ONCOLOGICOS E HOSPITALARES LTDA","re":"Lucro Real - Geral","gr":"Grupo Hayat","ec":"Equipe Contábil 5","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"24.323.646/0001-78","em":"BOUHID  BRASIL ENGENHARIA LTDA","re":"Lucro Real - Geral","gr":"Grupo Bouhid","ec":"Equipe Contábil 6","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"21.418.616/0001-57","em":"BR SPICES","re":"Lucro Real - Geral","gr":"Grupo BR Spices","ec":"Equipe Contábil 6","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"06.234.656/0001-55","em":"BRASIL VIDA TAXI AEREO LTDA","re":"Lucro Real - Geral","gr":"Grupo Brasil Vida","ec":"Equipe Contábil 5","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":true,"mdom":["2026-01","2026-02","2026-03","2026-04","2026-05"],"udom":["RANIE.ANDRADE"],"ndom":5,"sit":"so_dominio"},{"cn":"36.774.442/0001-32","em":"BRAVA MOTO LTDA","re":"Lucro Real - Geral","gr":"Grupo Haikar","ec":"Equipe Contábil 1","tem_aut":true,"sub":"estimativa","mas":"2026-05","ult":"✅ 05/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"65.277.863/0001-56","em":"BRISSA PARTICIPACOES LTDA","re":"Lucro Real - Geral","gr":"Grupo Accerte Tecnologia","ec":"Equipe Contábil 7","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"08.469.992/0001-02","em":"BRMILL ALIMENTOS LTDA","re":"Lucro Real - Geral","gr":"Grupo BRMILL Alimentos","ec":"Equipe Contábil 6","tem_aut":true,"sub":"trimestral","mas":"2026-04","ult":"✅ 04/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"48.550.462/0001-09","em":"CAMAQ COMERCIO DE PECAS LTDA","re":"Lucro Real - Geral","gr":"Grupo CAMAQ","ec":"Equipe Contábil 3","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"04.436.009/0001-09","em":"CCL INSUMOS AGROPECUARIOS LTDA","re":"Lucro Real - Geral","gr":"Grupo Zoolutti","ec":"Equipe Contábil 7","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":true,"mdom":["2026-01","2026-02","2026-03","2026-04","2026-05"],"udom":["THAYZI.MONTEIRO"],"ndom":5,"sit":"so_dominio"},{"cn":"04.784.935/0001-67","em":"CENTRAL IRRIGACAO LTDA","re":"Lucro Real - Geral","gr":"Grupo Central Irrigação","ec":"Equipe Contábil 3","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"32.264.844/0001-36","em":"CENTRO DE EXTENSAO E PESQUISA DO INSTITUTO BRASILIENSE DE DIREITO PUBLICO - CEP-IDP","re":"Lucro Real - Geral","gr":"Grupo IDP","ec":"Equipe Contábil 10","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"16.537.746/0001-79","em":"CENTRO OESTE DISTRIBUIDORA DE PECAS AUTOMOTIVAS LTDA","re":"Lucro Real - Geral","gr":"Grupo Centro Oeste","ec":"Equipe Contábil 10","tem_aut":true,"sub":"trimestral","mas":"2026-03","ult":"✅ 03/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"02.481.364/0001-66","em":"CEREALISTA MEDEIROS LTDA","re":"Lucro Real - Geral","gr":"Grupo Cereal","ec":"Equipe Contábil 7","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":true,"mdom":["2026-03"],"udom":["GUSTAVO.MAMEDE"],"ndom":1,"sit":"so_dominio"},{"cn":"29.401.549/0001-70","em":"CFMOTO DA AMAZONIA INDUSTRIA E COMERCIO DE VEICULOS LTDA","re":"Lucro Real - Geral","gr":"Grupo Unique","ec":"Equipe Contábil 7","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":true,"mdom":["2026-01","2026-02","2026-03","2026-04","2026-05"],"udom":["ANA.CARDOSO"],"ndom":5,"sit":"so_dominio"},{"cn":"15.302.951/0001-92","em":"CIASEEDS AGRONEGOCIOS LTDA","re":"Lucro Real - Geral","gr":"Grupo Ciaseeds","ec":"Equipe Contábil 2","tem_aut":true,"sub":"trimestral","mas":"2026-03","ult":"✅ 03/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"33.632.111/0001-70","em":"CICLO S/A","re":"Lucro Real - Geral","gr":"Grupo PGMAIS","ec":"Equipe Contábil 5","tem_aut":true,"sub":"estimativa","mas":"2026-05","ult":"✅ 05/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"37.247.772/0001-32","em":"COMANDO BATERIAS AUTOMOTIVAS E LUBRIFICANTES LTDA","re":"Lucro Real - Geral","gr":"Grupo Comando Baterias","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"02.494.562/0001-64","em":"COMANDO MINAS BATERIAS LTDA","re":"Lucro Real - Geral","gr":"Grupo Comando Baterias","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"08.589.497/0001-37","em":"COMANDO NORTE COMERCIO DE BATERIAS LTDA","re":"Lucro Real - Geral","gr":"Grupo Comando Baterias","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"21.116.707/0001-38","em":"CONEXAO COSMETICOS E EMBALAGENS LTDA","re":"Lucro Real - Geral","gr":"Grupo Artesanal","ec":"Equipe Contábil 6","tem_aut":true,"sub":"trimestral","mas":"2026-03","ult":"✅ 03/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"07.489.199/0001-02","em":"CONFEITARIA RICHESSE LTDA","re":"Lucro Real - Geral","gr":"Grupo Richesse","ec":"Equipe Contábil 10","tem_aut":true,"sub":"trimestral","mas":"2026-03","ult":"✅ 03/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"12.614.560/0001-15","em":"CSFA INDUSTRIA E COMERCIO DE RACOES ANIMAL LTDA","re":"Lucro Real - Geral","gr":"Grupo Acrefort","ec":"Equipe Contábil 6","tem_aut":true,"sub":"estimativa","mas":"2026-04","ult":"✅ 04/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"29.022.151/0001-22","em":"DFA DEFENSE LTDA 29.022.151/0001-22","re":"Lucro Real - Geral","gr":"Grupo DFA","ec":"Equipe Contábil 6","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"08.961.274/0001-59","em":"DISTRIBUIDORA DE EMBALAGENS CASTROPIL LTDA.","re":"Lucro Real - Geral","gr":"Grupo Castropil","ec":"Equipe Contábil 6","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"38.099.091/0001-37","em":"DO NOT SCARE SOLUCOES INTERATIVAS LTDA","re":"Lucro Real - Geral","gr":"Grupo Supernova","ec":"Equipe Contábil 7","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"43.342.542/0001-55","em":"DROGADERMA LTDA","re":"Lucro Real - Geral","gr":"Grupo Artesanal","ec":"Equipe Contábil 6","tem_aut":true,"sub":"trimestral","mas":"2026-03","ult":"✅ 03/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"02.552.198/0001-41","em":"DROGASTORE LTDA","re":"Lucro Real - Geral","gr":"Grupo DROGASTORE","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"30.488.257/0001-03","em":"DROZ TECNOLOGIA DA INFORMACAO LTDA","re":"Lucro Real - Geral","gr":"Grupo Coaktion","ec":"Equipe Contábil 3","tem_aut":true,"sub":"trimestral","mas":"2026-05","ult":"✅ 05/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"09.360.671/0001-38","em":"E.M.B TRAFO INDUSTRIA E COMERCIO DE TRANSFORMADORES LTDA","re":"Lucro Real - Geral","gr":"Grupo EMB","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"57.228.582/0001-85","em":"EB SEEDS LTDA","re":"Lucro Real - Geral","gr":"Grupo Ciaseeds","ec":"Equipe Contábil 2","tem_aut":true,"sub":"trimestral","mas":"2026-03","ult":"✅ 03/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"24.881.237/0001-97","em":"ELETRO MECANICA BRASILEIRA DE TRANSFORMADORES LTDA","re":"Lucro Real - Geral","gr":"Grupo EMB","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"38.062.726/0001-21","em":"EMITA JA CERTIFICADOS DIGITAIS LTDA","re":"Lucro Real - Geral","gr":"Grupo VHSYS","ec":"Equipe Contábil 5","tem_aut":true,"sub":"trimestral","mas":"2026-05","ult":"✅ 05/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"55.662.963/0001-42","em":"ES ACABAMENTO LTDA 0001-42 Matriz (LR)","re":"Lucro Real - Geral","gr":"Grupo Solar","ec":"Equipe Contábil 6","tem_aut":true,"sub":"trimestral","mas":"2026-03","ult":"✅ 03/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"37.977.691/0001-98","em":"ESPACO & FORMA MOVEIS E DIVISORIAS LTDA","re":"Lucro Real - Geral","gr":"Grupo Diviforma","ec":"Equipe Contábil 10","tem_aut":true,"sub":"estimativa","mas":"2026-01","ult":"✅ 01/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"46.183.945/0001-97","em":"ESTROBILI SOLUCOES FLORESTAIS LTDA","re":"Lucro Real - Geral","gr":"Grupo Primmus","ec":"Equipe Contábil 3","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"13.236.593/0001-31","em":"EUROEX IMPORTADORA E EXPORTADORA LTDA","re":"Lucro Real - Geral","gr":"Grupo Euroex","ec":"Equipe Contábil 8","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"03.195.861/0001-60","em":"FACULDADE TREVISAN LTDA","re":"Lucro Real - Geral","gr":"Grupo Trevisan","ec":"Equipe Contábil 6","tem_aut":true,"sub":"estimativa","mas":"2026-01","ult":"✅ 01/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"19.376.822/0001-08","em":"FG5 COMERCIO E ARMAZENS GERAIS LTDA (EM RECUPERAÇÃO JUDICIAL)","re":"Lucro Real - Geral","gr":"Grupo Fortaleza","ec":"Equipe Contábil 2","tem_aut":true,"sub":"trimestral","mas":"2026-03","ult":"✅ 03/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"63.334.514/0001-01","em":"FIDIA DO BRASIL LTDA","re":"Lucro Real - Geral","gr":"Grupo Fidia","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"09.239.228/0001-03","em":"FORMOSA TRUCK CENTER LTDA","re":"Lucro Real - Geral","gr":"Grupo Evandro","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"08.728.058/0001-68","em":"FORTALEZA AGRICOLA LTDA","re":"Lucro Real - Geral","gr":"Grupo Fortaleza","ec":"Equipe Contábil 2","tem_aut":true,"sub":"trimestral","mas":"2026-03","ult":"✅ 03/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"19.681.301/0001-56","em":"FUN MOTORS IMPORTACAO E EXPORTACAO LTDA","re":"Lucro Real - Geral","gr":"Grupo Unique","ec":"Equipe Contábil 7","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":true,"mdom":["2026-01","2026-02","2026-03","2026-04","2026-05"],"udom":["ANA.CARDOSO","JAYNNE.MOREIRA"],"ndom":5,"sit":"so_dominio"},{"cn":"07.094.346/0001-45","em":"G4F SOLUCOES CORPORATIVAS LTDA","re":"Lucro Real - Geral","gr":"Grupo G4F","ec":"Equipe Contábil 10","tem_aut":true,"sub":"trimestral","mas":"2026-04","ult":"✅ 04/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"53.874.257/0001-39","em":"GADO11 AGRONEGOCIOS SA","re":"Lucro Real - Geral","gr":"Grupo Gado11","ec":"Equipe Contábil 2","tem_aut":true,"sub":"trimestral","mas":"2026-03","ult":"✅ 03/2026","tem_dom":true,"mdom":["2026-03"],"udom":["MAYSA.CAIXETA"],"ndom":1,"sit":"ambos"},{"cn":"05.125.556/0001-28","em":"GARUDA MEDICAL DO BRASIL LTDA","re":"Lucro Real - Geral","gr":"Grupo Garuda","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"53.041.902/0001-32","em":"GDS HOSP LTDA","re":"Lucro Real - Geral","gr":"Grupo GDS","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"15.027.114/0001-00","em":"GOMES DE MELO SO INJECAO LTDA","re":"Lucro Real - Geral","gr":"Grupo Só Injeção","ec":"Equipe Contábil 7","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"48.352.583/0001-46","em":"GTM DISTRIBUIDORA DE PRODUTOS OFF ROAD LTDA","re":"Lucro Real - Geral","gr":"Grupo Unique","ec":"Equipe Contábil 7","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":true,"mdom":["2026-01","2026-02","2026-03","2026-04","2026-05"],"udom":["ANA.CARDOSO"],"ndom":5,"sit":"so_dominio"},{"cn":"59.708.798/0001-73","em":"GV TRANSPORTADORA E LOGISTICA LTDA","re":"Lucro Real - Geral","gr":"Grupo Vinal E Jesus","ec":"Equipe Contábil 8","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"00.066.871/0001-08","em":"HAIKAR VEICULOS LTDA","re":"Lucro Real - Geral","gr":"Grupo Haikar","ec":"Equipe Contábil 1","tem_aut":true,"sub":"estimativa","mas":"2026-05","ult":"✅ 05/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"17.279.163/0001-58","em":"HARD SPORTS REPRESENTACOES COMERCIAIS","re":"Lucro Real - Geral","gr":"Grupo HARD SPORTS","ec":"Equipe Contábil 7","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"25.014.860/0001-05","em":"HJ PARTICIPACOES LTDA","re":"Lucro Real - Geral","gr":"Grupo Solar","ec":"Equipe Contábil 6","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"39.360.629/0001-88","em":"HOME CARE COELHO SOUZA E SOUZA ASSISTENCIA DOMICILIAR LTDA","re":"Lucro Real - Geral","gr":"Grupo Home Care","ec":"Equipe Contábil 8","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"35.397.417/0001-14","em":"HYGIENE FOR CARE LTDA","re":"Lucro Real - Geral","gr":"Grupo Hygiene","ec":"Equipe Contábil 3","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"15.352.563/0001-16","em":"IDP CURSOS E PROJETOS LTDA","re":"Lucro Real - Geral","gr":"Grupo IDP","ec":"Equipe Contábil 10","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"34.682.732/0001-20","em":"IMPERSIK COMERCIO E SERVICOS LTDA","re":"Lucro Real - Geral","gr":"Grupo IMPERSIK","ec":"Equipe Contábil 3","tem_aut":true,"sub":"trimestral","mas":"2026-05","ult":"✅ 05/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"02.474.172/0001-22","em":"INSTITUTO BRASILEIRO DE ENSINO. DESENVOLVIMENTO E PESQUISA IDP - LTDA","re":"Lucro Real - Geral","gr":"Grupo IDP","ec":"Equipe Contábil 10","tem_aut":true,"sub":"trimestral","mas":"2026-04","ult":"✅ 04/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"15.077.055/0001-77","em":"INSTITUTO DE PESQUISAS JURIDICAS E SOCIAIS DE BRASILIA - IPJUS","re":"Lucro Real - Geral","gr":"Grupo IDP","ec":"Equipe Contábil 10","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"02.498.705/0001-06","em":"IPIRANGA RECICLAGEM DE METAIS LTDA","re":"Lucro Real - Geral","gr":"Grupo Ipiranga","ec":"Equipe Contábil 1","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":true,"mdom":["2026-01","2026-02","2026-03","2026-04","2026-05"],"udom":["VERONICA.T"],"ndom":5,"sit":"so_dominio"},{"cn":"37.061.769/0001-20","em":"IRMAOS PEPE LTDA","re":"Lucro Real - Geral","gr":"Grupo Pepe Tintas","ec":"Equipe Contábil 6","tem_aut":true,"sub":"trimestral","mas":"2026-03","ult":"✅ 03/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"51.169.152/0001-53","em":"JD GESTAO DE PASSIVOS LTDA","re":"Lucro Real - Geral","gr":"Grupo João Domingos","ec":"Equipe Contábil 10","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"00.264.076/0001-24","em":"JESUINO E PARREIRA LTDA","re":"Lucro Real - Geral","gr":"Grupo Ipiranga","ec":"Equipe Contábil 1","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":true,"mdom":["2026-01","2026-02","2026-03","2026-04","2026-05"],"udom":["VERONICA.T"],"ndom":5,"sit":"so_dominio"},{"cn":"06.158.317/0001-37","em":"JF AUTOMACAO INDUSTRIAL LTDA","re":"Lucro Real - Geral","gr":"Grupo JF","ec":"Equipe Contábil 6","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"20.175.138/0001-39","em":"JOÃO DOMINGOS ADVOGADOS ASSOCIADOS","re":"Lucro Real - Geral","gr":"Grupo João Domingos","ec":"Equipe Contábil 10","tem_aut":true,"sub":"trimestral","mas":"2026-01","ult":"✅ 01/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"22.577.871/0001-05","em":"JS GRÃOS ARMAZÉNS GERAIS LTDA","re":"Lucro Real - Geral","gr":"Grupo Acrefort","ec":"Equipe Contábil 6","tem_aut":true,"sub":"estimativa","mas":"2026-04","ult":"✅ 04/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"11.957.930/0001-54","em":"KAIROS TREINAMENTOS","re":"Lucro Real - Geral","gr":"Grupo Virtus","ec":"Equipe Contábil 7","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":true,"mdom":["2026-01","2026-02","2026-03","2026-04","2026-05"],"udom":["ANGELICA.MARY","THAYZI.MONTEIRO"],"ndom":5,"sit":"so_dominio"},{"cn":"07.182.994/0001-53","em":"KIBE BARLANA INDUSTRIA E COMERCIO SA LTDA.","re":"Lucro Real - Geral","gr":"Grupo Kibarlana","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"32.138.039/0001-66","em":"KING BEEF INDUSTRIA E COMERCIO DE ALIMENTOS LTDA","re":"Lucro Real - Geral","gr":"Grupo Demarqui","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"00.185.386/0001-53","em":"L & R COMERCIO DE FRUTAS LTDA","re":"Lucro Real - Geral","gr":"Grupo Rei do melão","ec":"Equipe Contábil 5","tem_aut":true,"sub":"trimestral","mas":"2026-03","ult":"✅ 03/2026","tem_dom":true,"mdom":["2026-03"],"udom":["ANDERSON.BORGES"],"ndom":1,"sit":"ambos"},{"cn":"13.744.217/0001-58","em":"L.F. GONCALVES CONFECCOES LTDA","re":"Lucro Real - Geral","gr":"Grupo Rochedo","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"53.144.018/0001-23","em":"LEMOS PARTICIPAÇÕES LTDA","re":"Lucro Real - Geral","gr":"Grupo TBC","ec":"Equipe Contábil 6","tem_aut":true,"sub":"trimestral","mas":"2026-03","ult":"✅ 03/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"26.329.734/0001-02","em":"LINQ TELECOMUNICACOES LTDA","re":"Lucro Real - Geral","gr":"Grupo Linq","ec":"Equipe Contábil 6","tem_aut":true,"sub":"trimestral","mas":"2026-03","ult":"✅ 03/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"07.081.028/0001-40","em":"LIU JARDINI ADMINISTRADORA DE MARCAS E SERVICOS LTDA.","re":"Lucro Real - Geral","gr":"Grupo AMX","ec":"Equipe Contábil 1","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":true,"mdom":["2026-03","2026-06"],"udom":["BEATRIZ.BRITO","VERONICA.T"],"ndom":2,"sit":"so_dominio"},{"cn":"37.870.386/0001-00","em":"LOG JR TRANSPORTES LTDA","re":"Lucro Real - Geral","gr":"Grupo Atacadão","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"12.713.618/0001-88","em":"LOVEP TRANSPORTES E LOCACOES LTDA","re":"Lucro Real - Geral","gr":"Grupo Soluciona Logística","ec":"Equipe Contábil 8","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"07.228.128/0001-56","em":"MAIS POLIMEROS DO BRASIL LTDA.","re":"Lucro Real - Geral","gr":"Grupo Mais Polimeros","ec":"Equipe Contábil 6","tem_aut":true,"sub":"trimestral","mas":"2026-03","ult":"✅ 03/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"30.993.512/0001-67","em":"MARK OLEO LUBRIFICANTE LTDA","re":"Lucro Real - Geral","gr":"Grupo Mark Óleo","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"02.909.049/0001-97","em":"MAXIGIRO COMERCIO DE ALIMENTOS LTDA","re":"Lucro Real - Geral","gr":"Grupo Distrasul","ec":"Equipe Contábil 3","tem_aut":true,"sub":"trimestral","mas":"2026-05","ult":"✅ 05/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"37.566.567/0001-30","em":"MEDICARE SERVICO DE EMERGENCIA MOVEL E HOME CARE LTDA.","re":"Lucro Real - Geral","gr":"Grupo Home Care","ec":"Equipe Contábil 8","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"02.231.801/0001-93","em":"MELOTINTAS LTDA","re":"Lucro Real - Geral","gr":"Grupo Melo Tintas","ec":"Equipe Contábil 6","tem_aut":true,"sub":"estimativa","mas":"2026-04","ult":"✅ 04/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"33.412.813/0001-48","em":"MERCANTIL INDUSTRIAS REUNIDAS LTDA","re":"Lucro Real - Geral","gr":"Grupo Mercantil","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"13.183.749/0001-63","em":"MINHA BIBLIOTECA LTDA.","re":"Lucro Real - Geral","gr":"Grupo Minha Biblioteca","ec":"Equipe Contábil 6","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"10.777.061/0001-13","em":"MONTEIRO & OLIVEIRA DISTRIBUIDORA DE PECAS LTDA","re":"Lucro Real - Geral","gr":"Grupo Só Injeção","ec":"Equipe Contábil 7","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"09.097.058/0001-70","em":"MR COMERCIAL DE ALIMENTOS E BEBIDAS LTDA","re":"Lucro Real - Geral","gr":"Grupo Natureza","ec":"Equipe Contábil 8","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"14.281.410/0001-62","em":"MSC COMERCIO DE PNEUS E SERVICOS LTDA","re":"Lucro Real - Geral","gr":"Grupo MSC Pneus","ec":"Equipe Contábil 5","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"15.078.337/0001-99","em":"MULTIPLA DISTRIBUIDORA E COMERCIO S/A","re":"Lucro Real - Geral","gr":"Grupo Natureza","ec":"Equipe Contábil 8","tem_aut":true,"sub":"trimestral","mas":"2026-03","ult":"✅ 03/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"08.002.459/0001-36","em":"MUNDIAL HOSPITALAR PRODUTOS PARA SAUDE LTDA","re":"Lucro Real - Geral","gr":"Grupo Mundial Hospitalar","ec":"Equipe Contábil 6","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"10.717.581/0001-30","em":"MYPBX SERVICOS E TECNOLOGIA LTDA","re":"Lucro Real - Geral","gr":"Grupo Coaktion","ec":"Equipe Contábil 3","tem_aut":true,"sub":"trimestral","mas":"2026-04","ult":"✅ 04/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"02.870.566/0001-08","em":"NATUREZA COMERCIO SA","re":"Lucro Real - Geral","gr":"Grupo Natureza","ec":"Equipe Contábil 8","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"18.105.959/0001-57","em":"OCP FERTILIZANTES LTDA.","re":"Lucro Real - Geral","gr":"Grupo OCP","ec":"Equipe Contábil 4","tem_aut":true,"sub":"estimativa","mas":"2026-02","ult":"✅ 02/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"55.321.982/0001-05","em":"OFICINA DO LANCHE BAR, LANCHONETE E RESTAURANTE","re":"Lucro Real - Geral","gr":"Grupo Padoca","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"01.152.509/0001-12","em":"OFICINA DO LANCHE BAR, LANCHONETE E RESTAURANTE LTDA","re":"Lucro Real - Geral","gr":"Grupo Padoca","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"42.435.986/0001-72","em":"ON FACTORING LTDA","re":"Lucro Real - Geral","gr":"Grupo Grafigel","ec":"Equipe Contábil 6","tem_aut":true,"sub":"estimativa","mas":"2026-05","ult":"✅ 05/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"05.855.123/0001-28","em":"P A REZENDE & CIA LTDA","re":"Lucro Real - Geral","gr":"Grupo Rezende","ec":"Equipe Contábil 8","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"12.663.272/0001-50","em":"PAGANINI LOGISTICA LTDA","re":"Lucro Real - Geral","gr":"Grupo Paganini","ec":"Equipe Contábil 8","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"11.935.231/0001-03","em":"PARANAFERROS PARANA FERRO E ACO","re":"Lucro Real - Geral","gr":"Grupo Paranaferros","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"04.325.071/0001-15","em":"PGA SOLUCOES EM TECNOLOGIA DA INFORMACAO SA","re":"Lucro Real - Geral","gr":"Grupo PGMAIS","ec":"Equipe Contábil 5","tem_aut":true,"sub":"estimativa","mas":"2026-05","ult":"✅ 05/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"06.039.758/0001-10","em":"PHENIX - COMERCIO. LOCACOES. LOGISTICA. SERVICOS & TRANSPORTES LTDA","re":"Lucro Real - Geral","gr":"Grupo Phenix Transportes","ec":"Equipe Contábil 8","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"18.267.572/0001-05","em":"PLACK ATACADISTA DE MATERIAIS PARA CONSTRUCAO LTDA","re":"Lucro Real - Geral","gr":"Grupo Plack","ec":"Equipe Contábil 3","tem_aut":true,"sub":"trimestral","mas":"2026-04","ult":"✅ 04/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"37.021.136/0001-98","em":"PLANALTO INDUSTRIA MECANICA LTDA","re":"Lucro Real - Geral","gr":"Grupo Planalto Indústria","ec":"Equipe Contábil 6","tem_aut":true,"sub":"trimestral","mas":"2026-05","ult":"✅ 05/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"13.495.519/0001-30","em":"PLUVI IRRIGACAO LTDA","re":"Lucro Real - Geral","gr":"Grupo Pluvi","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"31.916.386/0001-00","em":"PORTAL DA REFORMA TRIBUTARIA LTDA","re":"Lucro Real - Geral","gr":"Grupo ROIT","ec":"Equipe Contábil 3","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"01.091.559/0001-37","em":"POTENCIA MEDICOES LTDA EM RECUPERACAO JUDICIAL","re":"Lucro Real - Geral","gr":"Grupo Potência Medições","ec":"Equipe Contábil 8","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"18.723.151/0001-33","em":"PREMA COMERCIO E EXPORTACAO DE CEREAIS LTDA","re":"Lucro Real - Geral","gr":"Grupo Prema","ec":"Equipe Contábil 2","tem_aut":true,"sub":"trimestral","mas":"2026-03","ult":"✅ 03/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"27.880.419/0001-31","em":"PREMIUM ALIMENTOS PR LTDA","re":"Lucro Real - Geral","gr":"Grupo Cereal","ec":"Equipe Contábil 7","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":true,"mdom":["2026-03"],"udom":["GUSTAVO.MAMEDE"],"ndom":1,"sit":"so_dominio"},{"cn":"64.526.594/0001-51","em":"PREMIUM COMERCIO DE COMBUSTIVEIS E LUBRIFICANTES LTDA","re":"Lucro Real - Geral","gr":"Grupo Solar","ec":"Equipe Contábil 6","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"25.220.232/0001-86","em":"PRIMMUS G&R FLORESTAL LTDA","re":"Lucro Real - Geral","gr":"Grupo Primmus","ec":"Equipe Contábil 3","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"45.875.611/0001-11","em":"R L DE NAPOLI TRANSPORTADORA LTDA","re":"Lucro Real - Geral","gr":"Grupo Trans Freitas","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"47.434.617/0001-89","em":"RENOVAR LOGISTICA LTDA","re":"Lucro Real - Geral","gr":"Grupo Renovar","ec":"Equipe Contábil 1","tem_aut":true,"sub":"trimestral","mas":"2026-04","ult":"✅ 04/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"13.397.065/0001-64","em":"RENOVAR ÓLEOS VEGETAIS LTDA","re":"Lucro Real - Geral","gr":"Grupo Renovar","ec":"Equipe Contábil 1","tem_aut":true,"sub":"trimestral","mas":"2026-04","ult":"✅ 04/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"50.707.404/0001-98","em":"RM PARTICIPACOES E EMPREENDIMENTOS LTDA","re":"Lucro Real - Geral","gr":"Grupo DROGASTORE","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"21.969.751/0001-90","em":"RODRIGUES PARTICIPACOES LTDA","re":"Lucro Real - Geral","gr":"Grupo Comando Baterias","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"11.216.711/0001-14","em":"ROIT INNOVATION DESENVOLVIMENTO S/A","re":"Lucro Real - Geral","gr":"Grupo ROIT","ec":"Equipe Contábil 3","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"32.168.658/0001-01","em":"ROIT PEOPLE S/A","re":"Lucro Real - Geral","gr":"Grupo ROIT","ec":"Equipe Contábil 3","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"24.146.818/0001-85","em":"RUACH SERVICE LTDA","re":"Lucro Real - Geral","gr":"Grupo Ruach","ec":"Equipe Contábil 8","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"43.137.855/0001-71","em":"S 2 COMERCIO DE COMBUSTIVEIS E LUBRIFICANTES LTDA","re":"Lucro Real - Geral","gr":"Grupo Solar","ec":"Equipe Contábil 6","tem_aut":true,"sub":"trimestral","mas":"2026-03","ult":"✅ 03/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"50.256.880/0001-30","em":"S 3 COMERCIO DE COMBUSTIVEIS E LUBRIFCANTES LTDA","re":"Lucro Real - Geral","gr":"Grupo Solar","ec":"Equipe Contábil 6","tem_aut":true,"sub":"trimestral","mas":"2026-03","ult":"✅ 03/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"57.483.591/0001-12","em":"S 4 COMERCIO DE COMBUSTIVEIS E LUBRIFICANTES LTDA","re":"Lucro Real - Geral","gr":"Grupo Solar","ec":"Equipe Contábil 6","tem_aut":true,"sub":"trimestral","mas":"2026-02","ult":"✅ 02/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"61.811.953/0001-24","em":"S 5 COMERCIO DE COMBUSTIVEIS E LUBRIFICANTES LTDA","re":"Lucro Real - Geral","gr":"Grupo Solar","ec":"Equipe Contábil 6","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"63.667.178/0001-00","em":"S 6 COMERCIO DE COMBUSTIVEIS E LUBRIFICANTES LTDA","re":"Lucro Real - Geral","gr":"Grupo Solar","ec":"Equipe Contábil 6","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"06.315.490/0001-00","em":"SAFRA AGRICOLA E PECUARIA LTDA","re":"Lucro Real - Geral","gr":"Grupo Safra","ec":"Equipe Contábil 3","tem_aut":true,"sub":"estimativa","mas":"2026-05","ult":"✅ 05/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"47.702.009/0001-08","em":"SAFRA INDUSTRIA DE MOVEIS HOSPITALARES LTDA","re":"Lucro Real - Geral","gr":"Grupo Sam Medic","ec":"Equipe Contábil 7","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"21.983.850/0001-27","em":"SAM MEDIC INDUSTRIA DE EQUIPAMENTOS HOSPITALARES LTDA","re":"Lucro Real - Geral","gr":"Grupo Sam Medic","ec":"Equipe Contábil 7","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":true,"mdom":["2026-03"],"udom":["GUSTAVO.MAMEDE"],"ndom":1,"sit":"so_dominio"},{"cn":"06.001.970/0001-98","em":"SANDUICHERIA KOMIKETO LTDA","re":"Lucro Real - Geral","gr":"Grupo Komiketo","ec":"Equipe Contábil 5","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"39.595.526/0001-05","em":"SAO JOSE AGROPECUARIA E EMPREENDIMENTOS S/A","re":"Lucro Real - Geral","gr":"Grupo Machadinho","ec":"Equipe Contábil 2","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"04.545.387/0001-12","em":"SO INJECAO DISTRIBUIDORA LTDA","re":"Lucro Real - Geral","gr":"Grupo Só Injeção","ec":"Equipe Contábil 7","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"33.319.245/0001-35","em":"SOLAR ATACADO E VAREJO DE MATERIAIS PARA CONSTRUCAO LTDA","re":"Lucro Real - Geral","gr":"Grupo Solar","ec":"Equipe Contábil 6","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"29.172.431/0001-17","em":"SOLAR COMERCIO DE COMBUSTIVEIS E LUBRIFICANTES LTDA","re":"Lucro Real - Geral","gr":"Grupo Solar","ec":"Equipe Contábil 6","tem_aut":true,"sub":"trimestral","mas":"2026-03","ult":"✅ 03/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"21.706.100/0001-08","em":"SOLAR COMERCIO DE MATERIAL DE CONSTRUCAO LTDA","re":"Lucro Real - Geral","gr":"Grupo Solar","ec":"Equipe Contábil 6","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"29.652.490/0001-92","em":"SOLAR TRANSPORTES E CONSTRUCOES LTDA","re":"Lucro Real - Geral","gr":"Grupo Solar","ec":"Equipe Contábil 6","tem_aut":true,"sub":"trimestral","mas":"2026-03","ult":"✅ 03/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"51.545.486/0001-84","em":"SOLO ATACADISTA DE MATERIAIS DE CONSTRUCAO LTDA","re":"Lucro Real - Geral","gr":"Grupo Pepe Tintas","ec":"Equipe Contábil 6","tem_aut":true,"sub":"trimestral","mas":"2026-03","ult":"✅ 03/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"19.700.976/0001-03","em":"SOLUCIONA LOGISTICA E TRANSPORTE LTDA","re":"Lucro Real - Geral","gr":"Grupo Soluciona Logística","ec":"Equipe Contábil 8","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"28.891.829/0001-40","em":"SUCESSO TOTAL COMERCIO DE ARTIGOS DE CAMA. MESA E BANHO LTDA","re":"Lucro Real - Geral","gr":"Grupo First Class","ec":"Equipe Contábil 8","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":true,"mdom":["2026-01","2026-02","2026-03","2026-04","2026-05"],"udom":["DENISE.FIDELIS"],"ndom":5,"sit":"so_dominio"},{"cn":"36.922.812/0001-31","em":"SUCESSO UNIVERSAL ATACADISTA LTDA","re":"Lucro Real - Geral","gr":"Grupo First Class","ec":"Equipe Contábil 8","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":true,"mdom":["2026-01","2026-02","2026-03","2026-04","2026-05"],"udom":["DENISE.FIDELIS"],"ndom":5,"sit":"so_dominio"},{"cn":"39.469.535/0001-41","em":"TBC DISTRIBUICAO LTDA","re":"Lucro Real - Geral","gr":"Grupo TBC","ec":"Equipe Contábil 6","tem_aut":true,"sub":"estimativa","mas":"2026-05","ult":"✅ 05/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"09.585.929/0001-02","em":"TBC SOLUCOES EM GESTAO LTDA","re":"Lucro Real - Geral","gr":"Grupo TBC","ec":"Equipe Contábil 6","tem_aut":true,"sub":"estimativa","mas":"2026-05","ult":"✅ 05/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"01.296.044/0001-73","em":"TBC TRIANGULO LTDA","re":"Lucro Real - Geral","gr":"Grupo TBC","ec":"Equipe Contábil 6","tem_aut":true,"sub":"estimativa","mas":"2026-05","ult":"✅ 05/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"07.346.020/0001-68","em":"TECH MED EQUIPAMENTOS HOSPITALARES LTDA","re":"Lucro Real - Geral","gr":"Grupo TechMed","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"10.768.129/0001-06","em":"TECHLAV - TECNOLOGIA E ESTERELIZACAO LTDA","re":"Lucro Real - Geral","gr":"Grupo Techlave","ec":"Equipe Contábil 8","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"13.626.555/0001-95","em":"TERRA COMERCIAL AGRICOLA LTDA","re":"Lucro Real - Geral","gr":"Grupo Safra","ec":"Equipe Contábil 3","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"24.177.273/0001-74","em":"TERRA HOSPITALAR DISTRIBUIDORA DE MEDICAMENTOS LTDA","re":"Lucro Real - Geral","gr":"Grupo Terra","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":true,"mdom":["2026-03"],"udom":["LUNA.CECILLE"],"ndom":1,"sit":"so_dominio"},{"cn":"30.213.373/0001-01","em":"THE BRAIN MARKETING EDUCACAO E TECNOLOGIA LTDA","re":"Lucro Real - Geral","gr":"Grupo Supernova","ec":"Equipe Contábil 7","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"02.907.061/0001-62","em":"TOKARSKI COMERCIO & INDUSTRIA LTDA","re":"Lucro Real - Geral","gr":"Grupo Artesanal","ec":"Equipe Contábil 6","tem_aut":true,"sub":"trimestral","mas":"2026-03","ult":"✅ 03/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"11.172.836/0001-90","em":"TOP MED IMPORTAÇÃO E DISTRIBUIÇÃO LTDA","re":"Lucro Real - Geral","gr":"Grupo Top Med","ec":"Equipe Contábil 6","tem_aut":true,"sub":"trimestral","mas":"2026-05","ult":"✅ 05/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"76.929.660/0001-13","em":"TOYO SEN-I DO BRASIL - AGRO-INDUSTRIAL LTDA.","re":"Lucro Real - Geral","gr":"Grupo Toyo","ec":"Equipe Contábil 5","tem_aut":true,"sub":"estimativa","mas":"2026-05","ult":"✅ 05/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"13.712.782/0001-33","em":"TRANSPORTADORA 3 REIS LTDA","re":"Lucro Real - Geral","gr":"Grupo Transportadora 3 Reis","ec":"Equipe Contábil 8","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":true,"mdom":["2026-03"],"udom":["LUCAS.BENICIO"],"ndom":1,"sit":"so_dominio"},{"cn":"75.303.222/0001-82","em":"TRANSPORTADORA DALASTRA LTDA","re":"Lucro Real - Geral","gr":"Grupo Dalastra","ec":"Equipe Contábil 8","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"18.871.450/0001-15","em":"TSA - HOLDING GROUP LTDA","re":"Lucro Real - Geral","gr":"Grupo TSA","ec":"Equipe Contábil 6","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"41.644.702/0001-95","em":"TWT IMPORTADORA E DISTRIBUIDORA DE EQUIPAMENTOS LTDA","re":"Lucro Real - Geral","gr":"Grupo Benja","ec":"Equipe Contábil 3","tem_aut":true,"sub":"trimestral","mas":"2026-05","ult":"✅ 05/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"29.910.022/0001-70","em":"UNIAO FARMA COMERCIAL LTDA","re":"Lucro Real - Geral","gr":"Grupo União Farma","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"62.525.151/0001-10","em":"UNIDADE PERMANENTE DE AQUISICAO DE RESINA S.A","re":"Lucro Real - Geral","gr":"Grupo Primmus","ec":"Equipe Contábil 3","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"08.815.199/0001-18","em":"VALOR EMPREENDIMENTOS E PARTICIPACOES LTDA","re":"Lucro Real - Geral","gr":"Grupo Agrológica","ec":"Equipe Contábil 5","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"07.932.597/0001-51","em":"VALPARTS MAQUINAS AGRICOLAS LTDA","re":"Lucro Real - Geral","gr":"Grupo Valparts","ec":"Equipe Contábil 9","tem_aut":true,"sub":"trimestral","mas":"2026-01","ult":"✅ 01/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"16.804.948/0001-30","em":"VBG COMERCIO DE ALIMENTOS LTDA","re":"Lucro Real - Geral","gr":"Grupo Padoca","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"09.534.517/0001-35","em":"VENTURA VEICULOS LTDA","re":"Lucro Real - Geral","gr":"Grupo Haikar","ec":"Equipe Contábil 1","tem_aut":true,"sub":"estimativa","mas":"2026-05","ult":"✅ 05/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"12.702.717/0001-64","em":"VHSYS SISTEMA DE GESTAO SA","re":"Lucro Real - Geral","gr":"Grupo VHSYS","ec":"Equipe Contábil 5","tem_aut":true,"sub":"trimestral","mas":"2026-04","ult":"✅ 04/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"37.088.556/0001-91","em":"VIDA PRODUTOS AGROPECUÁRIOS E VETERINÁRIOS LTDA","re":"Lucro Real - Geral","gr":"Grupo Cia da Terra","ec":"Equipe Contábil 3","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"34.749.266/0001-53","em":"VILA PET COMERCIO DE PRODUTOS VETERINARIOS LTDA","re":"Lucro Real - Geral","gr":"Grupo Cia da Terra","ec":"Equipe Contábil 3","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"13.119.354/0001-00","em":"VL MEDICAMENTOS LTDA","re":"Lucro Real - Geral","gr":"Grupo GDS","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"04.821.224/0001-15","em":"VPN SOLUCOES EM TI LTDA","re":"Lucro Real - Geral","gr":"Grupo Venha Pra Nuvem","ec":"Equipe Contábil 5","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"54.417.231/0001-24","em":"W3 UTILIDADES LTDA","re":"Lucro Real - Geral","gr":"Grupo Big Store","ec":"Equipe Contábil 3","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"53.212.848/0001-40","em":"WORKISE SERVICOS TECNOLOGICOS E EMPRESARIAIS LTDA","re":"Lucro Real - Geral","gr":"Grupo Coaktion","ec":"Equipe Contábil 3","tem_aut":true,"sub":"trimestral","mas":"2026-05","ult":"✅ 05/2026","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"so_automatizacao"},{"cn":"48.250.135/0001-31","em":"YELLOT MOB LTDA","re":"Lucro Real - Geral","gr":"Grupo Bouhid","ec":"Equipe Contábil 6","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"},{"cn":"11.052.797/0001-97","em":"ZION PARTICIPACOES E EMPREENDIMENTOS S/A","re":"Lucro Real - Geral","gr":"Grupo Zion","ec":"Equipe Contábil 9","tem_aut":false,"sub":"","mas":"","ult":"","tem_dom":false,"mdom":[],"udom":[],"ndom":0,"sit":"sem_dados"}],"meses":["2026-01","2026-02","2026-03","2026-04","2026-05","2026-06"],"ml":{"2026-01":"Jan/26","2026-02":"Fev/26","2026-03":"Mar/26","2026-04":"Abr/26","2026-05":"Mai/26","2026-06":"Jun/26"},"stats_mes":{"2026-01":{"aut":68,"dom":20,"total":86},"2026-02":{"aut":64,"dom":20,"total":82},"2026-03":{"aut":61,"dom":20,"total":79},"2026-04":{"aut":37,"dom":11,"total":48},"2026-05":{"aut":20,"dom":11,"total":31},"2026-06":{"aut":0,"dom":1,"total":1}}};
const _stored = typeof window !== "undefined" ? loadStoredIrpj() : null;
// Merge: usa dados importados quando existirem, mas garante que empresas
// da base RAW não fiquem de fora quando o cache foi criado antes de novas
// empresas serem adicionadas à base.
const REGS: Reg[] = (() => {
  const baseRaw = RAW.regs as Reg[];
  if (!_stored?.regs?.length) return baseRaw;
  const storedRegs = _stored.regs as Reg[];
  const known = new Set(storedRegs.map(r => r.cn));
  const missing = baseRaw.filter(r => !known.has(r.cn));
  return [...storedRegs, ...missing];
})();
const MESES: string[] = _stored?.meses ?? RAW.meses;
const ML: Record<string,string> = _stored?.ml ?? RAW.ml;
const STATS_MES: Record<string,StatsMes> = RAW.stats_mes;

// ── HELPERS ───────────────────────────────────────────────────────────────────
function P(u: number, b: number) { return b ? Math.round(u / b * 100) : 0; }
function normEC(s: string) { return s.replace('Equipe Contábil ','EC '); }

function apAut(mas: string, m: string): boolean | null {
  if (!mas) return null;
  return mas >= m ? true : null;
}
function apDom(mdom: string[], m: string): boolean {
  return mdom.indexOf(m) >= 0;
}
function pColor(p: number) {
  return p >= 70 ? '#00BF63' : p >= 40 ? '#FA6914' : '#DC2626';
}

// BADGES
function SrcBadge({ sit }: { sit: string }) {
  const cfg: Record<string, { lbl: string; cls: string }> = {
    ambos:            { lbl: '✅ Auto + Dom.',    cls: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
    so_automatizacao: { lbl: '🤖 Automatização',  cls: 'bg-blue-50 text-blue-700 border-blue-300' },
    so_dominio:       { lbl: '🏛 Domínio',         cls: 'bg-yellow-50 text-yellow-800 border-yellow-300' },
    sem_dados:        { lbl: '❌ Sem apuração',    cls: 'bg-red-50 text-red-700 border-red-300' },
  };
  const c = cfg[sit] || cfg.sem_dados;
  return <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full border ${c.cls} whitespace-nowrap`}>{c.lbl}</span>;
}

function SubBadge({ sub }: { sub: string }) {
  if (sub === 'trimestral') return <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full border bg-yellow-50 text-yellow-800 border-yellow-300">Trimestral</span>;
  if (sub === 'estimativa') return <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full border bg-purple-50 text-purple-700 border-purple-300">Estimativa</span>;
  return <span className="text-gray-300 text-[10px]">—</span>;
}

function ApCell({ val }: { val: boolean | null }) {
  if (val === true)  return <span className="inline-flex w-5 h-5 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 text-xs font-bold">✓</span>;
  if (val === false) return <span className="inline-flex w-5 h-5 items-center justify-center rounded-md bg-red-50 text-red-500 text-xs font-bold">✗</span>;
  return <span className="text-gray-300 text-xs">—</span>;
}

function Pag({ page, total, pp, onPage }: { page: number; total: number; pp: number; onPage: (p: number) => void }) {
  const tp = Math.max(1, Math.ceil(total / pp));
  if (tp <= 1) return null;
  return (
    <div className="flex justify-center items-center gap-2 mt-3">
      <button onClick={() => onPage(page - 1)} disabled={page <= 1} className="text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 disabled:opacity-30 hover:border-yellow-400 hover:text-yellow-700 transition">← Anterior</button>
      <span className="text-[11px] text-gray-400 min-w-[80px] text-center">Página {page} de {tp}</span>
      <button onClick={() => onPage(page + 1)} disabled={page >= tp} className="text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 disabled:opacity-30 hover:border-yellow-400 hover:text-yellow-700 transition">Próxima →</button>
    </div>
  );
}

function ImportButtons() {
  const refAut = useRef<HTMLInputElement>(null);
  const refDom = useRef<HTMLInputElement>(null);

  async function applyMerge(aut: any, dom: any) {
    const base = REGS as IrpjReg[];
    const merged = mergeIrpjData(base, aut, dom);
    const { meses, ml } = buildIrpjMeses(merged);
    await pushSharedIrpj({ regs: merged, meses, ml });
    alert(`Importado. Total: ${merged.length} empresas.`);
    location.reload();
  }
  async function onAut(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const text = await f.text();
    const aut = parseAutomacaoCSV(text);
    if (!aut.length) { alert("CSV vazio ou fora do padrão."); return; }
    await applyMerge(aut, null);
  }
  async function onDom(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const buf = await f.arrayBuffer();
    const dom = await parseDominioXLSX(buf);
    if (!dom.size) { alert("XLSX vazio ou fora do padrão."); return; }
    await applyMerge(null, dom);
  }
  async function onReset() {
    if (!confirm("Restaurar dados originais?")) return;
    try { await clearSharedIrpj(); } catch { /* noop */ }
    location.reload();
  }
  return (
    <div className="ml-auto flex items-center gap-2">
      <input ref={refAut} type="file" accept=".csv,text/csv" onChange={onAut} className="hidden" />
      <input ref={refDom} type="file" accept=".xlsx,.xls" onChange={onDom} className="hidden" />
      <button onClick={() => refAut.current?.click()} className="text-[11px] font-semibold px-3 py-1.5 rounded-md border border-yellow-300 bg-yellow-50 text-yellow-800 hover:bg-yellow-100">📥 Automação CSV</button>
      <button onClick={() => refDom.current?.click()} className="text-[11px] font-semibold px-3 py-1.5 rounded-md border border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100">📥 Domínio XLSX</button>
      <button onClick={onReset} className="text-[11px] font-semibold px-2 py-1.5 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50" title="Restaurar dados originais">↺</button>
    </div>
  );
}



// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function IrpjCsll() {
  useEffect(() => {
    syncSharedIrpj().then((changed) => { if (changed) location.reload(); }).catch(() => {});
  }, []);
  const [tab, setTab] = useState<'geral'|'empresa'|'auto'|'dom'|'sem'|'alerta'>('geral');
  const [mesFiltro, setMesFiltro] = useState<string>('all');
  const [q1,setQ1]=useState(''); const [fEq1,setFEq1]=useState(''); const [fSrc1,setFSrc1]=useState(''); const [fSub1,setFSub1]=useState('');
  const [q2,setQ2]=useState(''); const [fEq2,setFEq2]=useState(''); const [fSub2,setFSub2]=useState('');
  const [q3,setQ3]=useState(''); const [fEq3,setFEq3]=useState('');
  const [q4,setQ4]=useState(''); const [fEq4,setFEq4]=useState('');
  const [q5,setQ5]=useState(''); const [fEq5,setFEq5]=useState(''); const [fAp5,setFAp5]=useState('');
  const [p1,setP1]=useState(1); const [p2,setP2]=useState(1); const [p3,setP3]=useState(1); const [p4,setP4]=useState(1); const [p5,setP5]=useState(1);
  const PP = 50;

  const equipes = useMemo(() => [...new Set(REGS.map(r=>r.ec).filter(Boolean))].sort(), []);

  // Visíveis: mes_aut >= mesFiltro OU dom >= mesFiltro
  const vis = useMemo(() => {
    if (mesFiltro === 'all') return REGS;
    return REGS.filter(r => {
      const autOk = r.mas && r.mas >= mesFiltro;
      const domOk = r.tem_dom && r.mdom.some(d => d >= mesFiltro);
      return autOk || domOk;
    });
  }, [mesFiltro]);

  const nAut = useMemo(() => vis.filter(r => mesFiltro==='all' ? r.tem_aut : r.mas && r.mas>=mesFiltro).length, [vis, mesFiltro]);
  const nDom = useMemo(() => vis.filter(r => mesFiltro==='all' ? r.tem_dom : r.mdom.some(d=>d>=mesFiltro)).length, [vis, mesFiltro]);
  const nSem = useMemo(() => REGS.filter(r => {
    if (mesFiltro==='all') return r.sit==='sem_dados';
    return !(r.mas && r.mas>=mesFiltro) && !r.mdom.some(d=>d>=mesFiltro);
  }).length, [mesFiltro]);

  // Filtros por aba
  const fil1 = useMemo(() => vis.filter(r =>
    (!fEq1||r.ec===fEq1) && (!fSrc1||r.sit===fSrc1) && (!fSub1||r.sub===fSub1) &&
    (!q1||r.em.toLowerCase().includes(q1.toLowerCase())||r.cn.includes(q1)||r.gr.toLowerCase().includes(q1.toLowerCase()))
  ), [vis,q1,fEq1,fSrc1,fSub1]);

  const fil2 = useMemo(() => REGS.filter(r => {
    if (!r.tem_aut) return false;
    if (mesFiltro!=='all' && !(r.mas && r.mas>=mesFiltro)) return false;
    return (!fEq2||r.ec===fEq2) && (!fSub2||r.sub===fSub2) &&
           (!q2||r.em.toLowerCase().includes(q2.toLowerCase())||r.cn.includes(q2));
  }), [mesFiltro,q2,fEq2,fSub2]);

  const fil3 = useMemo(() => REGS.filter(r => {
    if (!r.tem_dom) return false;
    if (mesFiltro!=='all' && !r.mdom.some(d=>d>=mesFiltro)) return false;
    return (!fEq3||r.ec===fEq3) && (!q3||r.em.toLowerCase().includes(q3.toLowerCase())||r.cn.includes(q3));
  }), [mesFiltro,q3,fEq3]);

  const fil4 = useMemo(() => REGS.filter(r => {
    const autOk = mesFiltro==='all' ? r.sit!=='sem_dados' : r.mas && r.mas>=mesFiltro;
    const domOk = mesFiltro==='all' ? r.tem_dom : r.mdom.some(d=>d>=mesFiltro);
    if (autOk || domOk) return false;
    return (!fEq4||r.ec===fEq4) && (!q4||r.em.toLowerCase().includes(q4.toLowerCase())||r.cn.includes(q4)||r.gr.toLowerCase().includes(q4.toLowerCase()));
  }), [mesFiltro,q4,fEq4]);

  // Tabela por equipe
  const eqStats = useMemo(() => {
    const m: Record<string,{base:number;aut:number;dom:number;sem:number}> = {};
    REGS.forEach(r => {
      if (!r.ec) return;
      if (!m[r.ec]) m[r.ec]={base:0,aut:0,dom:0,sem:0};
      m[r.ec].base++;
      const autOk = mesFiltro==='all'?r.tem_aut:(r.mas&&r.mas>=mesFiltro)||false;
      const domOk = mesFiltro==='all'?r.tem_dom:r.mdom.some(d=>d>=mesFiltro);
      if (autOk) m[r.ec].aut++;
      if (domOk) m[r.ec].dom++;
      if (!autOk && !domOk) m[r.ec].sem++;
    });
    return m;
  }, [mesFiltro]);

  // ── ALERTA: cruzamento com Base Informações Empresas ──
  type Apur = 'Mensal'|'Trimestral'|'Não classificada';
  type Sistema = 'Automação'|'Domínio'|'—';
  type AlertRow = {
    cn: string; em: string; gr: string; ec: string;
    apuracao: Apur;
    sistema: Sistema;
    perMonth: Record<string, 'apurou'|'risco'|'na'>;
    riscoTotal: number;
  };

  const digits = (s: string) => (s || '').replace(/\D/g, '');
  const isTriMonth = (m: string) => ['03','06','09','12'].includes(m.slice(5,7));
  const [alertRows, setAlertRows] = useState<AlertRow[]>([]);
  const [alertLoading, setAlertLoading] = useState(false);
  const [alertErr, setAlertErr] = useState('');
  useEffect(() => {
    let cancel = false;
    setAlertLoading(true); setAlertErr('');
    biLoadAll().then(({ empresas, contCfg }) => {
      if (cancel) return;
      const regsByCn = new Map<string, Reg>();
      REGS.forEach(r => regsByCn.set(digits(r.cn), r as Reg));
      const rows: AlertRow[] = [];
      empresas.forEach(e => {
        if (!biHasTag(e.tags, 'contabil')) return;
        if (!biIsLucroReal(e.regime)) return;
        const dcn = digits(e.cnpj);
        if (dcn.length !== 14 || dcn.slice(8,12) !== '0001') return; // só matriz

        const apRaw = (contCfg[e.cnpj]?.apuracao || '').trim();
        const ap: Apur = apRaw === 'Mensal' ? 'Mensal'
          : apRaw === 'Trimestral' ? 'Trimestral'
          : 'Não classificada';
        const intRaw = (contCfg[e.cnpj]?.integrado || '').trim().toLowerCase();
        const sistema: Sistema = intRaw === 'sim' ? 'Automação' : intRaw === 'nao' ? 'Domínio' : '—';
        const r = regsByCn.get(dcn);
        const perMonth: Record<string,'apurou'|'risco'|'na'> = {};
        let risco = 0;
        MESES.forEach(m => {
          // Sem classificação: considera todos os meses como devidos (não sabemos a cadência)
          const devido = ap === 'Mensal' ? true
            : ap === 'Trimestral' ? isTriMonth(m)
            : true;
          if (!devido) { perMonth[m] = 'na'; return; }
          const apurouAut = !!(r && r.mas && r.mas === m);
          const apurouDom = !!(r && r.mdom?.includes(m));
          if (apurouAut || apurouDom) perMonth[m] = 'apurou';
          else { perMonth[m] = 'risco'; risco++; }
        });
        rows.push({
          cn: e.cnpj, em: e.razao || '(sem razão)', gr: e.grupo || '',
          ec: r?.ec || (() => {
            const t = biGetTag(e.tags || '', 'Cont[áa]bil');
            if (!t) return '';
            const num = t.match(/(\d+)/)?.[1];
            return num ? `Equipe Contábil ${num}` : t;
          })(), apuracao: ap, sistema,
          perMonth, riscoTotal: risco,
        });
      });


      rows.sort((a,b) => b.riscoTotal - a.riscoTotal || a.em.localeCompare(b.em));
      setAlertRows(rows);
    }).catch(err => { if (!cancel) setAlertErr(String(err?.message || err)); })
      .finally(() => { if (!cancel) setAlertLoading(false); });
    return () => { cancel = true; };
  }, []);

  const equipesAlert = useMemo(() => [...new Set(alertRows.map(r => r.ec).filter(Boolean))].sort(), [alertRows]);

  const fil5 = useMemo(() => alertRows.filter(r => {
    if (fEq5 && r.ec !== fEq5) return false;
    if (fAp5 && r.apuracao !== fAp5) return false;
    if (mesFiltro !== 'all' && r.perMonth[mesFiltro] !== 'risco') return false;
    if (q5) {
      const t = q5.toLowerCase();
      if (!(r.em.toLowerCase().includes(t) || r.cn.includes(q5) || r.gr.toLowerCase().includes(t))) return false;
    }
    return true;
  }), [alertRows, fEq5, fAp5, mesFiltro, q5]);

  const nRisco = useMemo(() => {
    if (mesFiltro === 'all') return alertRows.reduce((s,r) => s + r.riscoTotal, 0);
    return alertRows.filter(r => r.perMonth[mesFiltro] === 'risco').length;
  }, [alertRows, mesFiltro]);

  const TABS = [
    {id:'geral',lbl:'📊 Visão Geral'},
    {id:'empresa',lbl:'📋 Por Empresa',badge:REGS.length},
    {id:'auto',lbl:'🤖 Automatização',badge:nAut},
    {id:'dom',lbl:'🏛️ Domínio',badge:nDom},
    {id:'sem',lbl:'❌ Sem Apuração',badge:nSem,danger:true},
    {id:'alerta',lbl:'🚨 Alerta',badge:nRisco,danger:true},
  ];

  // Filtro busca
  function Toolbar({ q,setQ,extras,cnt }: { q:string;setQ:(v:string)=>void;extras?:React.ReactNode;cnt:number }) {
    return (
      <div className="flex gap-2 mb-2.5 flex-wrap items-center">
        <div className="relative flex-1 min-w-[160px] max-w-[240px]">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 opacity-30" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx={11} cy={11} r={8}/><path d="M21 21l-4.35-4.35"/></svg>
          <input value={q} onChange={e=>{setQ(e.target.value);}} placeholder="Buscar empresa..." className="w-full text-[12px] pl-7 pr-3 py-1.5 border border-gray-200 rounded-lg outline-none focus:border-yellow-400 bg-white"/>
        </div>
        {extras}
        <span className="text-[11px] text-gray-400 ml-auto whitespace-nowrap">{cnt.toLocaleString('pt-BR')} empresas</span>
      </div>
    );
  }

  function EqSel({val,set}:{val:string;set:(v:string)=>void}) {
    return (
      <select value={val} onChange={e=>set(e.target.value)} className="text-[12px] px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white outline-none cursor-pointer focus:border-yellow-400">
        <option value="">Todas as equipes</option>
        {equipes.map(eq=><option key={eq} value={eq}>{eq}</option>)}
      </select>
    );
  }

  // Linha de tabela por mês
  function MesCells({ r }: { r: Reg }) {
    return <>
      {MESES.map(m => {
        const av = apAut(r.mas, m);
        const dv = apDom(r.mdom, m);
        const combined = (av===true||dv) ? true : null;
        return <td key={m} className="px-2 py-1.5 text-center"><ApCell val={combined}/></td>;
      })}
    </>;
  }

  const thMes = "px-2 py-2 text-center text-[9px] font-bold text-gray-400 uppercase tracking-wide whitespace-nowrap";
  const tableHead = (
    <thead><tr className="bg-gray-50 border-b border-gray-200">
      <th className="px-2.5 py-2 text-left text-[9px] font-bold text-gray-400 uppercase">Empresa</th>
      <th className="px-2.5 py-2 text-left text-[9px] font-bold text-gray-400 uppercase">CNPJ</th>
      <th className="px-2.5 py-2 text-left text-[9px] font-bold text-gray-400 uppercase">Grupo</th>
      <th className="px-2.5 py-2 text-left text-[9px] font-bold text-gray-400 uppercase">Equipe</th>
      <th className="px-2.5 py-2 text-left text-[9px] font-bold text-gray-400 uppercase">Fonte</th>
      <th className="px-2.5 py-2 text-left text-[9px] font-bold text-gray-400 uppercase">Sub-regime</th>
      {MESES.map(m=><th key={m} className={thMes}>{ML[m]}</th>)}
    </tr></thead>
  );

  function TRow({ r }: { r: Reg }) {
    return (
      <tr className="border-b border-gray-100 hover:bg-yellow-50/20 transition">
        <td className="px-2.5 py-1.5 max-w-[180px]"><div className="text-[11.5px] font-semibold text-gray-800 truncate" title={r.em}>{r.em}</div></td>
        <td className="px-2.5 py-1.5"><span className="font-mono text-[11px] text-gray-400">{r.cn}</span></td>
        <td className="px-2.5 py-1.5 max-w-[110px]"><div className="text-[11px] text-gray-500 truncate">{r.gr||'—'}</div></td>
        <td className="px-2.5 py-1.5 text-[11px] text-gray-500 whitespace-nowrap">{normEC(r.ec||'—')}</td>
        <td className="px-2.5 py-1.5"><SrcBadge sit={r.sit}/></td>
        <td className="px-2.5 py-1.5"><SubBadge sub={r.sub}/></td>
        <MesCells r={r}/>
      </tr>
    );
  }

  const tabLbl = TABS.find(t => t.id === tab)?.lbl.replace(/^\S+\s/, '') || 'Visão Geral';

  const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');
.icroot{--g:#0AE18C;--gd:#00BF63;--glt:#EAFBF4;--bk:#0C0C0C;--ch:#1A1A1A;--g70:#4A4A4A;--g50:#646464;--g30:#CDCDCD;--g10:#E8E8E8;--g05:#F5F5F5;--off:#FAFAFA;--wh:#FFF;--bd:#E2E2E2;--red:#DC2626;--rlt:#FEE2E2;--amb:#FA6914;--abl:#FFF7ED;--blue:#0284C7;--blt:#EFF6FF;--pur:#7C3AED;--yel:#FACC15;--ylt:#FEFCE8;--ydk:#92400E;background:var(--off);color:#2C2C2C;font-family:'Poppins',sans-serif;font-size:13px;-webkit-font-smoothing:antialiased}
.icroot *,.icroot *::before,.icroot *::after{box-sizing:border-box}
.icroot .top{background:var(--bk);height:54px;display:flex;align-items:center;padding:0 20px;gap:10px;position:sticky;top:0;z-index:100}
.icroot .logo{width:32px;height:32px;background:var(--yel);border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:8.5px;color:var(--bk);flex-shrink:0;line-height:1.1;text-align:center}
.icroot .mes-bar{background:var(--wh);border-bottom:2px solid var(--bd);padding:0 20px;overflow-x:auto}
.icroot .mes-inner{display:flex;align-items:stretch;gap:0}
.icroot .mes-btn{font-family:inherit;font-size:11px;font-weight:600;padding:10px 16px;border:none;background:none;cursor:pointer;color:var(--g50);border-bottom:2px solid transparent;margin-bottom:-2px;display:flex;flex-direction:column;align-items:center;gap:2px;transition:all .15s;white-space:nowrap;min-width:80px}
.icroot .mes-btn:hover{color:var(--ch)}
.icroot .mes-btn.act{color:var(--ydk);border-bottom-color:var(--yel)}
.icroot .mes-n{font-size:10px;font-weight:700;color:var(--ch)}
.icroot .mes-btn.act .mes-n{color:var(--ydk)}
.icroot .mes-tot{font-size:14px;font-weight:800;color:var(--ch)}
.icroot .mes-btn.act .mes-tot{color:var(--ydk)}
.icroot .mes-sub{font-size:9px;color:var(--g50)}
.icroot .mes-btn.act .mes-sub{color:var(--ydk);opacity:.7}
.icroot .tabs{background:var(--wh);border-bottom:2px solid var(--bd);display:flex;padding:0 20px;overflow-x:auto}
.icroot .tab{font-family:inherit;font-size:12px;font-weight:600;padding:11px 16px;border:none;background:none;color:var(--g50);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;display:flex;align-items:center;gap:5px;transition:all .15s;white-space:nowrap}
.icroot .tab:hover{color:var(--ch)}
.icroot .tab.act{color:var(--ydk);border-bottom-color:var(--yel)}
.icroot .tbg{font-size:10px;font-weight:700;padding:2px 6px;border-radius:10px;background:var(--g10);color:var(--g50)}
.icroot .tab.act .tbg{background:var(--ylt);color:var(--ydk)}
.icroot .tbg.r{background:var(--rlt);color:var(--red)}
.icroot .tbg.b{background:var(--blt);color:var(--blue)}
.icroot .tbg.p{background:#F5F3FF;color:var(--pur)}
.icroot .main{max-width:1600px;margin:0 auto;padding:18px 20px 80px}
.icroot .cards{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}
.icroot .card{background:var(--wh);border:1px solid var(--bd);border-radius:13px;padding:12px 16px;flex:1;min-width:120px}
.icroot .card-l{font-size:9px;font-weight:700;color:var(--g50);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px}
.icroot .card-v{font-size:26px;font-weight:800;color:var(--ch);line-height:1.1}
.icroot .card-s{font-size:10px;color:var(--g50);margin-top:2px}
.icroot .cg{border-color:#86EFAC;background:var(--glt)} .icroot .cg .card-v{color:var(--gd)}
.icroot .cr{border-color:#FCA5A5;background:var(--rlt)} .icroot .cr .card-v{color:var(--red)}
.icroot .cb{border-color:#93C5FD;background:var(--blt)} .icroot .cb .card-v{color:var(--blue)}
.icroot .cy{border-color:var(--yel);background:var(--ylt)} .icroot .cy .card-v{color:var(--ydk)}
.icroot .box{background:var(--wh);border:1px solid var(--bd);border-radius:14px;padding:14px 18px;margin-bottom:14px}
.icroot .box-title{font-size:12px;font-weight:700;color:var(--ch);margin-bottom:12px}
.icroot .eq-table{width:100%;border-collapse:collapse}
.icroot .eq-table th{font-size:9px;font-weight:700;color:var(--g50);text-transform:uppercase;padding:5px 8px;border-bottom:2px solid var(--bd);white-space:nowrap;text-align:left}
.icroot .eq-table th.r,.icroot .eq-table td.r{text-align:right}
.icroot .eq-table td{padding:6px 8px;font-size:11.5px;border-bottom:1px solid var(--g10);color:var(--ch)}
.icroot .eq-table tbody tr:last-child td{border-bottom:none}
.icroot .eq-table tbody tr:hover{background:var(--g05)}
.icroot .bar-t{display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap}
.icroot .sw{position:relative;flex:1;min-width:160px;max-width:250px}
.icroot .sw svg{position:absolute;left:9px;top:50%;transform:translateY(-50%);opacity:.35;pointer-events:none}
.icroot .si{width:100%;font-family:inherit;font-size:12px;padding:6px 10px 6px 29px;border:1px solid var(--bd);border-radius:9px;background:var(--wh);outline:none;color:#2C2C2C}
.icroot .si:focus{border-color:var(--yel)}
.icroot .si::placeholder{color:var(--g30)}
.icroot .sel{font-family:inherit;font-size:12px;padding:6px 10px;border:1px solid var(--bd);border-radius:9px;background:var(--wh);outline:none;cursor:pointer;color:#2C2C2C}
.icroot .sel:focus{border-color:var(--yel)}
.icroot .cnt{font-size:11px;color:var(--g50);margin-left:auto;white-space:nowrap}
.icroot .tw{background:var(--wh);border:1px solid var(--bd);border-radius:14px;overflow:hidden;overflow-x:auto}
.icroot .tt{width:100%;border-collapse:collapse}
.icroot .tt thead tr{background:var(--g05);border-bottom:1px solid var(--bd)}
.icroot .tt th{padding:7px 10px;text-align:left;font-size:9px;font-weight:700;color:var(--g50);text-transform:uppercase;letter-spacing:.3px;white-space:nowrap}
.icroot .tt th.c,.icroot .tt td.c{text-align:center}
.icroot .tt tbody tr{border-bottom:1px solid var(--bd)}
.icroot .tt tbody tr:last-child{border-bottom:none}
.icroot .tt tbody tr:hover{background:#FAFFFD}
.icroot .tt td{padding:6px 10px;font-size:11.5px;vertical-align:middle;color:var(--ch)}
.icroot .tn{font-weight:600;color:var(--ch);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px}
.icroot .tm{font-family:monospace;font-size:11px;color:var(--g50);white-space:nowrap}
.icroot .tg{font-size:11px;color:var(--g70);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:110px}
.icroot .chip{display:inline-block;font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px;border:1px solid;white-space:nowrap}
.icroot .chip-tr{background:var(--ylt);color:var(--ydk);border-color:var(--yel)}
.icroot .chip-est{background:#F5F3FF;color:var(--pur);border-color:#DDD6FE}
.icroot .src{display:inline-block;font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px;border:1px solid;white-space:nowrap}
.icroot .src-aut{background:var(--blt);color:var(--blue);border-color:#93C5FD}
.icroot .src-dom{background:var(--ylt);color:var(--ydk);border-color:var(--yel)}
.icroot .src-amb{background:var(--glt);color:var(--gd);border-color:#6EE7B7}
.icroot .src-nd{background:var(--rlt);color:var(--red);border-color:#FCA5A5}
.icroot .ap-ok{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;background:var(--glt);color:var(--gd);font-size:12px;font-weight:700}
.icroot .ap-no{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;background:var(--rlt);color:var(--red);font-size:12px;font-weight:700}
.icroot .ap-na{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;background:var(--g05);color:var(--g30);font-size:12px}
.icroot .nota{border-radius:10px;padding:10px 14px;font-size:11.5px;margin-bottom:14px;line-height:1.5}
.icroot .nota-y{background:var(--ylt);border:1px solid var(--yel);color:var(--ydk)}
.icroot .nota-b{background:var(--blt);border:1px solid #93C5FD;color:var(--blue)}
.icroot .nota-r{background:var(--rlt);border:1px solid #FCA5A5;color:var(--red)}
.icroot .pag{display:flex;justify-content:center;align-items:center;gap:8px;margin-top:10px}
.icroot .pb{font-family:inherit;font-size:11px;font-weight:600;padding:5px 12px;border-radius:8px;border:1px solid var(--bd);background:var(--wh);color:var(--g70);cursor:pointer;transition:all .15s}
.icroot .pb:hover:not(:disabled){border-color:var(--yel);color:var(--ydk)}
.icroot .pb:disabled{opacity:.35;cursor:default}
.icroot .pi{font-size:11px;color:var(--g50);min-width:80px;text-align:center}
.icroot .empty{padding:32px;text-align:center;color:var(--g30);font-size:12px}
`;

  const searchSvg = <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>;

  function SrcHtml({ sit }: { sit: string }) {
    const cfg: Record<string, { lbl: string; cls: string }> = {
      ambos: { lbl: "✅ Automat. + Dom.", cls: "src-amb" },
      so_automatizacao: { lbl: "🤖 Automatização", cls: "src-aut" },
      so_dominio: { lbl: "🏛 Domínio", cls: "src-dom" },
      sem_dados: { lbl: "❌ Sem apuração", cls: "src-nd" },
    };
    const c = cfg[sit] || cfg.sem_dados;
    return <span className={`src ${c.cls}`}>{c.lbl}</span>;
  }
  function SubHtml({ sub }: { sub: string }) {
    if (sub === "trimestral") return <span className="chip chip-tr">Trimestral</span>;
    if (sub === "estimativa") return <span className="chip chip-est">Estimativa</span>;
    return <span style={{ fontSize: 10, color: "var(--g30)" }}>—</span>;
  }
  function ApH({ val }: { val: boolean | null }) {
    if (val === true) return <span className="ap-ok">✓</span>;
    if (val === false) return <span className="ap-no">✗</span>;
    return <span className="ap-na">—</span>;
  }

  function ToolbarH({ q, setQ, extras, cnt }: { q: string; setQ: (v: string) => void; extras?: React.ReactNode; cnt: number }) {
    return (
      <div className="bar-t">
        <div className="sw">{searchSvg}
          <input className="si" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar empresa..." />
        </div>
        {extras}
        <span className="cnt">{cnt.toLocaleString("pt-BR")} empresas</span>
      </div>
    );
  }
  function EqSelH({ val, set }: { val: string; set: (v: string) => void }) {
    return (
      <select className="sel" value={val} onChange={(e) => set(e.target.value)}>
        <option value="">Todas as equipes</option>
        {equipes.map((eq) => <option key={eq} value={eq}>{eq}</option>)}
      </select>
    );
  }

  function exportarExcel() {
    const sitLbl = (s: string) => s === 'ambos' ? 'Automação + Domínio' : s === 'so_automatizacao' ? 'Só Automação' : s === 'so_dominio' ? 'Só Domínio' : 'Sem dados';
    exportXlsx("irpj-csll-lucro-real", [
      {
        name: "Por Empresa",
        rows: fil1.map((r) => ({
          CNPJ: r.cn, Empresa: r.em, Grupo: r.gr, Equipe: r.ec, Regime: r.re,
          Apuração: r.sub, Situação: sitLbl(r.sit),
          "Último mês automação": r.ult || "", "Meses Domínio": r.mdom.map((m) => ML[m] || m).join(", "),
          "Qtd. meses Domínio": r.ndom,
        })),
      },
      {
        name: "Automatização",
        rows: fil2.map((r) => ({ CNPJ: r.cn, Empresa: r.em, Grupo: r.gr, Equipe: r.ec, Apuração: r.sub, "Último mês": r.ult || "" })),
      },
      {
        name: "Domínio",
        rows: fil3.map((r) => ({ CNPJ: r.cn, Empresa: r.em, Grupo: r.gr, Equipe: r.ec, "Meses": r.mdom.map((m) => ML[m] || m).join(", "), "Usuários": r.udom.join(", ") })),
      },
      {
        name: "Sem Apuração",
        rows: fil4.map((r) => ({ CNPJ: r.cn, Empresa: r.em, Grupo: r.gr, Equipe: r.ec, Regime: r.re })),
      },
      {
        name: "Alerta",
        rows: fil5.map((r) => ({
          CNPJ: r.cn, Empresa: r.em, Grupo: r.gr, Equipe: r.ec, Apuração: r.apuracao, Sistema: r.sistema,
          "Meses em risco": MESES.filter((m) => r.perMonth[m] === 'risco').map((m) => ML[m] || m).join(", "),
          "Qtd. risco": r.riscoTotal,
        })),
      },
    ]);
  }

  return (
    <div className="icroot w-full">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* TOPBAR */}
      <div className="top">
        <div className="logo">IRPJ<br />CSLL</div>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,.45)", marginLeft: 4 }}>
          <strong style={{ color: "#fff" }}>IRPJ / CSLL — Lucro Real</strong>
          <span style={{ opacity: .3 }}> / </span>
          <span>{tabLbl}</span>
        </span>
        <ImportButtons />
        <button onClick={exportarExcel} className="text-[11px] font-semibold px-3 py-1.5 rounded-md border border-yellow-300 bg-white text-yellow-700 hover:bg-yellow-50">
          ⬇️ Exportar Excel
        </button>
      </div>


      {/* FILTRO MÊS */}
      <div className="mes-bar">
        <div className="mes-inner">
          <button onClick={() => setMesFiltro("all")} className={`mes-btn ${mesFiltro === "all" ? "act" : ""}`}>
            <span className="mes-n">Todos</span>
            <span className="mes-sub">{REGS.length} emp.</span>
          </button>
          {MESES.map((m) => {
            const s = STATS_MES[m] || { aut: 0, dom: 0, total: 0 };
            return (
              <button key={m} onClick={() => setMesFiltro(m)} className={`mes-btn ${mesFiltro === m ? "act" : ""}`}>
                <span className="mes-n">{ML[m]}</span>
                <span className="mes-tot">{s.total}</span>
                <span className="mes-sub">{s.aut} Aut · {s.dom} Dom</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TABS */}
      <div className="tabs">
        {TABS.map((t) => {
          const tbgCls = t.id === "auto" ? "b" : t.id === "dom" ? "p" : (t as any).danger ? "r" : "";
          return (
            <button key={t.id} onClick={() => setTab(t.id as any)} className={`tab ${tab === t.id ? "act" : ""}`}>
              {t.lbl}
              {t.badge != null && <span className={`tbg ${tbgCls}`}>{t.badge}</span>}
            </button>
          );
        })}
      </div>

      <div className="main">

        {/* ── GERAL ── */}
        {tab === "geral" && (
          <div>
            <div className="nota nota-y">
              ⚙️ <strong>Automatização:</strong> controle_gerencial_balancetes — sistema interno da Planning.&nbsp;&nbsp;|&nbsp;&nbsp;
              <strong>Domínio:</strong> log_dominio_IRPJ-CSLL — execuções registradas no sistema Domínio.
            </div>
            <div className="cards">
              {[
                { lbl: "Base LR Geral", v: REGS.length, sub: "Equipe Contábil · sem filial · sem CC", cls: "cb" },
                { lbl: "🤖 Automatização", v: nAut, sub: `${P(nAut, REGS.length)}% da base`, cls: "cb" },
                { lbl: "🏛 Domínio", v: nDom, sub: `${P(nDom, REGS.length)}% da base`, cls: "cy" },
                { lbl: "✅ Em ambas", v: REGS.filter((r) => r.sit === "ambos").length, sub: "cobertos por 2 fontes", cls: "cg" },
                { lbl: "❌ Sem apuração", v: nSem, sub: `${P(nSem, REGS.length)}% da base`, cls: "cr" },
              ].map(({ lbl, v, sub, cls }) => (
                <div key={lbl} className={`card ${cls}`}>
                  <div className="card-l">{lbl}</div>
                  <div className="card-v">{v}</div>
                  <div className="card-s">{sub}</div>
                </div>
              ))}
            </div>
            <div className="box">
              <div className="box-title">👥 Por equipe contábil</div>
              <table className="eq-table">
                <thead><tr>
                  <th>Equipe</th>
                  <th className="r">Base LR</th>
                  <th className="r" style={{ color: "var(--blue)" }}>Automat.</th>
                  <th className="r" style={{ color: "var(--ydk)" }}>Domínio</th>
                  <th className="r">Cobertos</th>
                  <th className="r">% Cobertura</th>
                  <th className="r" style={{ color: "var(--red)" }}>Sem dados</th>
                </tr></thead>
                <tbody>
                  {equipes.map((eq) => {
                    const v = eqStats[eq] || { base: 0, aut: 0, dom: 0, sem: 0 };
                    const cob = v.aut + v.dom;
                    const pct = P(cob, v.base);
                    const pc = pColor(pct);
                    return (
                      <tr key={eq}>
                        <td style={{ fontWeight: 700 }}>{eq}</td>
                        <td className="r" style={{ fontWeight: 600 }}>{v.base}</td>
                        <td className="r" style={{ fontWeight: 700, color: "var(--blue)" }}>{v.aut}</td>
                        <td className="r" style={{ fontWeight: 700, color: "var(--ydk)" }}>{v.dom}</td>
                        <td className="r" style={{ fontWeight: 700 }}>{cob}</td>
                        <td className="r">
                          <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                            <div style={{ width: 48, height: 6, background: "var(--g10)", borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${pct}%`, background: pc, borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: pc }}>{pct}%</span>
                          </div>
                        </td>
                        <td className="r" style={{ fontWeight: 700, color: v.sem > 0 ? "var(--red)" : "var(--g30)" }}>{v.sem}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── POR EMPRESA ── */}
        {tab === "empresa" && (
          <div>
            <ToolbarH q={q1} setQ={(v) => { setQ1(v); setP1(1); }} cnt={fil1.length} extras={<>
              <EqSelH val={fEq1} set={(v) => { setFEq1(v); setP1(1); }} />
              <select className="sel" value={fSrc1} onChange={(e) => { setFSrc1(e.target.value); setP1(1); }}>
                <option value="">Todas as fontes</option>
                <option value="ambos">✅ Ambas</option>
                <option value="so_automatizacao">🤖 Só Automatização</option>
                <option value="so_dominio">🏛 Só Domínio</option>
                <option value="sem_dados">❌ Sem apuração</option>
              </select>
            </>} />
            <div className="tw"><table className="tt" style={{ minWidth: 1120 }}>
              <thead><tr>
                <th>Empresa</th><th>CNPJ</th><th>Grupo</th><th>Equipe Contábil</th>
                <th>Fonte</th><th>Sub-regime</th>
                {MESES.map((m) => <th key={m} className="c">{ML[m]}</th>)}
              </tr></thead>
              <tbody>
                {fil1.slice((p1 - 1) * PP, p1 * PP).map((r) => (
                  <tr key={r.cn}>
                    <td><div className="tn" title={r.em}>{r.em}</div></td>
                    <td><span className="tm">{r.cn}</span></td>
                    <td><div className="tg">{r.gr || "—"}</div></td>
                    <td style={{ fontSize: 11, color: "var(--g70)", whiteSpace: "nowrap" }}>{normEC(r.ec || "—")}</td>
                    <td><SrcHtml sit={r.sit} /></td>
                    <td><SubHtml sub={r.sub} /></td>
                    {MESES.map((m) => {
                      const av = apAut(r.mas, m);
                      const dv = apDom(r.mdom, m);
                      const combined = (av === true || dv) ? true : null;
                      return <td key={m} className="c"><ApH val={combined} /></td>;
                    })}
                  </tr>
                ))}
                {fil1.length === 0 && <tr><td colSpan={6 + MESES.length} className="empty">Nenhuma empresa.</td></tr>}
              </tbody>
            </table></div>
            <Pag page={p1} total={fil1.length} pp={PP} onPage={(p) => setP1(Math.max(1, Math.min(Math.ceil(fil1.length / PP), p)))} />
          </div>
        )}

        {/* ── AUTOMATIZAÇÃO ── */}
        {tab === "auto" && (
          <div>
            <div className="nota nota-b">🤖 Empresas no <strong>sistema de automatização</strong> (controle_gerencial_balancetes). Sub-regime define os meses de apuração esperados.</div>
            <ToolbarH q={q2} setQ={(v) => { setQ2(v); setP2(1); }} cnt={fil2.length} extras={<>
              <EqSelH val={fEq2} set={(v) => { setFEq2(v); setP2(1); }} />
              <select className="sel" value={fSub2} onChange={(e) => { setFSub2(e.target.value); setP2(1); }}>
                <option value="">Todos os sub-regimes</option>
                <option value="trimestral">Trimestral</option>
                <option value="estimativa">Estimativa</option>
              </select>
            </>} />
            <div className="tw"><table className="tt" style={{ minWidth: 960 }}>
              <thead><tr>
                <th>Empresa</th><th>CNPJ</th><th>Grupo</th><th>Equipe Contábil</th>
                <th>Sub-regime</th><th>Último Registro</th>
                {MESES.map((m) => <th key={m} className="c">{ML[m]}</th>)}
              </tr></thead>
              <tbody>
                {fil2.slice((p2 - 1) * PP, p2 * PP).map((r) => (
                  <tr key={r.cn}>
                    <td><div className="tn" title={r.em}>{r.em}</div></td>
                    <td><span className="tm">{r.cn}</span></td>
                    <td><div className="tg">{r.gr || "—"}</div></td>
                    <td style={{ fontSize: 11, color: "var(--g70)", whiteSpace: "nowrap" }}>{normEC(r.ec || "—")}</td>
                    <td><SubHtml sub={r.sub} /></td>
                    <td><span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--gd)" }}>✅ {r.ult.replace("✅ ","")}</span></td>
                    {MESES.map((m) => <td key={m} className="c"><ApH val={apAut(r.mas, m)} /></td>)}
                  </tr>
                ))}
                {fil2.length === 0 && <tr><td colSpan={6 + MESES.length} className="empty">Nenhuma empresa.</td></tr>}
              </tbody>
            </table></div>
            <Pag page={p2} total={fil2.length} pp={PP} onPage={(p) => setP2(Math.max(1, Math.min(Math.ceil(fil2.length / PP), p)))} />
          </div>
        )}

        {/* ── DOMÍNIO ── */}
        {tab === "dom" && (
          <div>
            <div className="nota nota-y">🏛️ Empresas com apuração registrada no <strong>sistema Domínio</strong> (log_dominio_IRPJ-CSLL). Cada ✓ = competência apurada no mês.</div>
            <ToolbarH q={q3} setQ={(v) => { setQ3(v); setP3(1); }} cnt={fil3.length} extras={<EqSelH val={fEq3} set={(v) => { setFEq3(v); setP3(1); }} />} />
            <div className="tw"><table className="tt" style={{ minWidth: 1000 }}>
              <thead><tr>
                <th>Empresa</th><th>CNPJ</th><th>Grupo</th><th>Equipe Contábil</th>
                <th>Usuário(s)</th>
                {MESES.map((m) => <th key={m} className="c">{ML[m]}</th>)}
                <th className="c">Total</th>
              </tr></thead>
              <tbody>
                {fil3.slice((p3 - 1) * PP, p3 * PP).map((r) => (
                  <tr key={r.cn}>
                    <td><div className="tn" title={r.em}>{r.em}</div></td>
                    <td><span className="tm">{r.cn}</span></td>
                    <td><div className="tg">{r.gr || "—"}</div></td>
                    <td style={{ fontSize: 11, color: "var(--g70)", whiteSpace: "nowrap" }}>{normEC(r.ec || "—")}</td>
                    <td style={{ fontSize: 10, color: "var(--g50)", whiteSpace: "nowrap" }}>{r.udom.join(", ") || "—"}</td>
                    {MESES.map((m) => <td key={m} className="c"><ApH val={apDom(r.mdom, m) ? true : null} /></td>)}
                    <td className="c" style={{ fontWeight: 700 }}>{r.ndom}</td>
                  </tr>
                ))}
                {fil3.length === 0 && <tr><td colSpan={5 + MESES.length + 1} className="empty">Nenhuma empresa.</td></tr>}
              </tbody>
            </table></div>
            <Pag page={p3} total={fil3.length} pp={PP} onPage={(p) => setP3(Math.max(1, Math.min(Math.ceil(fil3.length / PP), p)))} />
          </div>
        )}

        {/* ── SEM APURAÇÃO ── */}
        {tab === "sem" && (
          <div>
            <div className="nota nota-r">❌ Empresas <strong>LR Geral + Equipe Contábil</strong> sem registro em nenhuma fonte no período selecionado.</div>
            <ToolbarH q={q4} setQ={(v) => { setQ4(v); setP4(1); }} cnt={fil4.length} extras={<EqSelH val={fEq4} set={(v) => { setFEq4(v); setP4(1); }} />} />
            <div className="tw"><table className="tt" style={{ minWidth: 700 }}>
              <thead><tr>
                {["Empresa","CNPJ","Grupo","Equipe Contábil"].map((h) => <th key={h}>{h}</th>)}
              </tr></thead>
              <tbody>
                {fil4.slice((p4 - 1) * PP, p4 * PP).map((r) => (
                  <tr key={r.cn}>
                    <td><div className="tn" title={r.em}>{r.em}</div></td>
                    <td><span className="tm">{r.cn}</span></td>
                    <td><div className="tg">{r.gr || "—"}</div></td>
                    <td style={{ fontSize: 11, color: "var(--g70)", whiteSpace: "nowrap" }}>{normEC(r.ec || "—")}</td>
                  </tr>
                ))}
                {fil4.length === 0 && <tr><td colSpan={4} className="empty">Todas as empresas têm apuração no período.</td></tr>}
              </tbody>
            </table></div>
            <Pag page={p4} total={fil4.length} pp={PP} onPage={(p) => setP4(Math.max(1, Math.min(Math.ceil(fil4.length / PP), p)))} />
          </div>
        )}

        {/* ── ALERTA ── */}
        {tab === "alerta" && (
          <div>
            <div className="nota nota-r">
              🚨 <strong>Risco de não apuração</strong> — cruza a <strong>Base de Informações Empresas</strong> (regime Lucro Real + Apur. LR Mensal/Trimestral) com o que está apurado neste portal (Automatização + Domínio), <strong>apenas para empresas com TAG Contábil</strong>.
              &nbsp;Mensal deve apurar todo mês; Trimestral apenas em 03/06/09/12. Selecione um mês na barra superior para filtrar só o risco daquela competência.
            </div>
            {alertLoading && <div className="nota nota-y">Carregando base de empresas…</div>}
            {alertErr && <div className="nota nota-r">Erro ao carregar base: {alertErr}</div>}
            <ToolbarH q={q5} setQ={(v) => { setQ5(v); setP5(1); }} cnt={fil5.length} extras={<>
              <EqSelH val={fEq5} set={(v) => { setFEq5(v); setP5(1); }} />
              <select className="sel" value={fAp5} onChange={(e) => { setFAp5(e.target.value); setP5(1); }}>
                <option value="">Toda apuração LR</option>
                <option value="Mensal">Mensal</option>
                <option value="Trimestral">Trimestral</option>
                <option value="Não classificada">Não classificada</option>
              </select>
            </>} />
            <div className="cards" style={{ marginBottom: 10 }}>
              <div className="card cr">
                <div className="card-l">🚨 Risco {mesFiltro === 'all' ? 'total' : ML[mesFiltro] || mesFiltro}</div>
                <div className="card-v">{nRisco}</div>
                <div className="card-s">{mesFiltro === 'all' ? 'competências pendentes' : 'empresas sem apuração no mês'}</div>
              </div>
              <div className="card cb">
                <div className="card-l">Base LR com TAG Contábil</div>
                <div className="card-v">{alertRows.length}</div>
                <div className="card-s">Mensal: {alertRows.filter(r=>r.apuracao==='Mensal').length} · Trim.: {alertRows.filter(r=>r.apuracao==='Trimestral').length} · N/Class.: {alertRows.filter(r=>r.apuracao==='Não classificada').length}</div>
                <div className="card-s">Automação: {alertRows.filter(r=>r.sistema==='Automação').length} · Domínio: {alertRows.filter(r=>r.sistema==='Domínio').length} · s/ sistema: {alertRows.filter(r=>r.sistema==='—').length}</div>
              </div>
            </div>


            <div className="tw"><table className="tt" style={{ minWidth: 1200 }}>
              <thead><tr>
                <th>Empresa</th><th>CNPJ</th><th>Grupo</th><th>Equipe</th><th>Apur. LR</th><th>Sistema</th>

                {MESES.map((m) => <th key={m} className="c">{ML[m]}</th>)}
                <th className="c">Risco</th>
              </tr></thead>
              <tbody>
                {fil5.slice((p5 - 1) * PP, p5 * PP).map((r) => (
                  <tr key={r.cn}>
                    <td><div className="tn" title={r.em}>{r.em}</div></td>
                    <td><span className="tm">{r.cn}</span></td>
                    <td><div className="tg">{r.gr || "—"}</div></td>
                    <td style={{ fontSize: 11, color: "var(--g70)", whiteSpace: "nowrap" }}>{normEC(r.ec || "—")}</td>
                    <td>
                      <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full border ${r.apuracao === 'Mensal' ? 'bg-blue-50 text-blue-700 border-blue-300' : r.apuracao === 'Trimestral' ? 'bg-yellow-50 text-yellow-800 border-yellow-300' : 'bg-gray-100 text-gray-700 border-gray-300'}`}>
                        {r.apuracao}
                      </span>
                    </td>
                    <td>
                      <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full border ${r.sistema === 'Automação' ? 'bg-purple-50 text-purple-700 border-purple-300' : r.sistema === 'Domínio' ? 'bg-teal-50 text-teal-700 border-teal-300' : 'bg-gray-100 text-gray-500 border-gray-300'}`} title={r.sistema === 'Automação' ? 'Sistema integrado — deve apurar via Automação' : r.sistema === 'Domínio' ? 'Sem integração — deve apurar via Domínio' : 'Sem classificação de sistema'}>
                        {r.sistema}
                      </span>
                    </td>

                    {MESES.map((m) => {
                      const st = r.perMonth[m];
                      return (
                        <td key={m} className="c">
                          {st === 'apurou' ? <span className="inline-flex w-5 h-5 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 text-xs font-bold" title="Apurado">✓</span>
                            : st === 'risco' ? <span className="inline-flex w-5 h-5 items-center justify-center rounded-md bg-red-100 text-red-600 text-xs font-bold" title="Sem apuração — RISCO">🚨</span>
                            : <span className="text-gray-300 text-xs" title="Não é competência de apuração">—</span>}
                        </td>
                      );
                    })}
                    <td className="c" style={{ fontWeight: 700, color: r.riscoTotal > 0 ? 'var(--red)' : 'var(--g30)' }}>{r.riscoTotal}</td>
                  </tr>
                ))}
                {!alertLoading && fil5.length === 0 && (
                  <tr><td colSpan={7 + MESES.length} className="empty">Nenhuma empresa em risco para o filtro atual.</td></tr>
                )}
              </tbody>
            </table></div>
            <Pag page={p5} total={fil5.length} pp={PP} onPage={(p) => setP5(Math.max(1, Math.min(Math.ceil(fil5.length / PP), p)))} />
          </div>
        )}

      </div>
    </div>
  );
}
