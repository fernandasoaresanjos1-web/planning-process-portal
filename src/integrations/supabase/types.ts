export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      acessorias_api_empresas: {
        Row: {
          cnpj: string
          departamentos: Json
          inscricoes_estaduais: Json
          obrigacoes: Json
          razao: string | null
          regime: string | null
          sincronizado_em: string
          status: string | null
          uf: string | null
        }
        Insert: {
          cnpj: string
          departamentos?: Json
          inscricoes_estaduais?: Json
          obrigacoes?: Json
          razao?: string | null
          regime?: string | null
          sincronizado_em?: string
          status?: string | null
          uf?: string | null
        }
        Update: {
          cnpj?: string
          departamentos?: Json
          inscricoes_estaduais?: Json
          obrigacoes?: Json
          razao?: string | null
          regime?: string | null
          sincronizado_em?: string
          status?: string | null
          uf?: string | null
        }
        Relationships: []
      }
      acessorias_entregas: {
        Row: {
          cnpj: string
          competencia: string
          departamento: string | null
          dt_finalizacao: string | null
          dt_prazo: string | null
          fechado: boolean
          id: string
          nome_entrega: string | null
          razao: string | null
          resp_entrega: string | null
          resp_prazo: string | null
          sincronizado_em: string
          status: string | null
          tipo: string | null
        }
        Insert: {
          cnpj: string
          competencia: string
          departamento?: string | null
          dt_finalizacao?: string | null
          dt_prazo?: string | null
          fechado?: boolean
          id: string
          nome_entrega?: string | null
          razao?: string | null
          resp_entrega?: string | null
          resp_prazo?: string | null
          sincronizado_em?: string
          status?: string | null
          tipo?: string | null
        }
        Update: {
          cnpj?: string
          competencia?: string
          departamento?: string | null
          dt_finalizacao?: string | null
          dt_prazo?: string | null
          fechado?: boolean
          id?: string
          nome_entrega?: string | null
          razao?: string | null
          resp_entrega?: string | null
          resp_prazo?: string | null
          sincronizado_em?: string
          status?: string | null
          tipo?: string | null
        }
        Relationships: []
      }
      acessorias_obrigacoes: {
        Row: {
          alerta_guia: boolean
          ativa: boolean
          competencia: string
          created_at: string
          dept: string
          dept_full: string
          dias_antes: string
          id: string
          mininome: string
          multa: boolean
          nome: string
          prazo_nao_util: string
          prazos: Json
          qtde: number
          responsavel: string
          robo: boolean
          sabado_util: string
          tipo_dias: string
          updated_at: string
        }
        Insert: {
          alerta_guia?: boolean
          ativa?: boolean
          competencia?: string
          created_at?: string
          dept?: string
          dept_full?: string
          dias_antes?: string
          id?: string
          mininome?: string
          multa?: boolean
          nome: string
          prazo_nao_util?: string
          prazos?: Json
          qtde?: number
          responsavel?: string
          robo?: boolean
          sabado_util?: string
          tipo_dias?: string
          updated_at?: string
        }
        Update: {
          alerta_guia?: boolean
          ativa?: boolean
          competencia?: string
          created_at?: string
          dept?: string
          dept_full?: string
          dias_antes?: string
          id?: string
          mininome?: string
          multa?: boolean
          nome?: string
          prazo_nao_util?: string
          prazos?: Json
          qtde?: number
          responsavel?: string
          robo?: boolean
          sabado_util?: string
          tipo_dias?: string
          updated_at?: string
        }
        Relationships: []
      }
      acessorias_obrigacoes_meta: {
        Row: {
          file_name: string
          id: number
          imported_at: string
          total_ativas: number
        }
        Insert: {
          file_name?: string
          id?: number
          imported_at?: string
          total_ativas?: number
        }
        Update: {
          file_name?: string
          id?: number
          imported_at?: string
          total_ativas?: number
        }
        Relationships: []
      }
      acessorias_processos: {
        Row: {
          cnpj: string | null
          departamento: string | null
          dt_conclusao: string | null
          dt_inicio: string | null
          gestor: string | null
          id: string
          nome_processo: string | null
          porcentagem: number | null
          razao: string | null
          sincronizado_em: string
          status: string | null
        }
        Insert: {
          cnpj?: string | null
          departamento?: string | null
          dt_conclusao?: string | null
          dt_inicio?: string | null
          gestor?: string | null
          id: string
          nome_processo?: string | null
          porcentagem?: number | null
          razao?: string | null
          sincronizado_em?: string
          status?: string | null
        }
        Update: {
          cnpj?: string | null
          departamento?: string | null
          dt_conclusao?: string | null
          dt_inicio?: string | null
          gestor?: string | null
          id?: string
          nome_processo?: string | null
          porcentagem?: number | null
          razao?: string | null
          sincronizado_em?: string
          status?: string | null
        }
        Relationships: []
      }
      agilizza_certificados: {
        Row: {
          cert_nome: string | null
          cert_tipo: string | null
          created_at: string
          dias_fed: number | null
          empresas: Json | null
          id: string
          session_id: string
          status_cert: string | null
          val_fed: string | null
        }
        Insert: {
          cert_nome?: string | null
          cert_tipo?: string | null
          created_at?: string
          dias_fed?: number | null
          empresas?: Json | null
          id?: string
          session_id: string
          status_cert?: string | null
          val_fed?: string | null
        }
        Update: {
          cert_nome?: string | null
          cert_tipo?: string | null
          created_at?: string
          dias_fed?: number | null
          empresas?: Json | null
          id?: string
          session_id?: string
          status_cert?: string | null
          val_fed?: string | null
        }
        Relationships: []
      }
      agilizza_cpfs: {
        Row: {
          cpf: string | null
          created_at: string
          grupo: string | null
          id: string
          no_ag: boolean | null
          razao: string | null
          regime: string | null
          session_id: string
          tags: Json | null
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          grupo?: string | null
          id?: string
          no_ag?: boolean | null
          razao?: string | null
          regime?: string | null
          session_id: string
          tags?: Json | null
        }
        Update: {
          cpf?: string | null
          created_at?: string
          grupo?: string | null
          id?: string
          no_ag?: boolean | null
          razao?: string | null
          regime?: string | null
          session_id?: string
          tags?: Json | null
        }
        Relationships: []
      }
      agilizza_cruzamento: {
        Row: {
          cnpj: string | null
          created_at: string
          fed_status: string | null
          grupo: string | null
          id: string
          razao: string | null
          regime: string | null
          session_id: string
          tags: Json | null
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          fed_status?: string | null
          grupo?: string | null
          id?: string
          razao?: string | null
          regime?: string | null
          session_id: string
          tags?: Json | null
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          fed_status?: string | null
          grupo?: string | null
          id?: string
          razao?: string | null
          regime?: string | null
          session_id?: string
          tags?: Json | null
        }
        Relationships: []
      }
      agilizza_extra: {
        Row: {
          cert_nome: string | null
          cert_raw: string | null
          cnpj: string | null
          created_at: string
          equipe: string | null
          id: string
          razao: string | null
          session_id: string
        }
        Insert: {
          cert_nome?: string | null
          cert_raw?: string | null
          cnpj?: string | null
          created_at?: string
          equipe?: string | null
          id?: string
          razao?: string | null
          session_id: string
        }
        Update: {
          cert_nome?: string | null
          cert_raw?: string | null
          cnpj?: string | null
          created_at?: string
          equipe?: string | null
          id?: string
          razao?: string | null
          session_id?: string
        }
        Relationships: []
      }
      agilizza_sessao: {
        Row: {
          created_at: string
          file_ag: string | null
          file_s3d: string | null
          id: string
          session_id: string
          total_ag: number | null
          total_s3d: number | null
          uploaded_at: string
        }
        Insert: {
          created_at?: string
          file_ag?: string | null
          file_s3d?: string | null
          id?: string
          session_id: string
          total_ag?: number | null
          total_s3d?: number | null
          uploaded_at?: string
        }
        Update: {
          created_at?: string
          file_ag?: string | null
          file_s3d?: string | null
          id?: string
          session_id?: string
          total_ag?: number | null
          total_s3d?: number | null
          uploaded_at?: string
        }
        Relationships: []
      }
      auditoria_dados: {
        Row: {
          atividades_all: Json | null
          cnae: string | null
          cnae_desc: string | null
          cnae_obrig: string | null
          cnpj: string | null
          consultado: boolean | null
          created_at: string
          file_name: string | null
          grupo: string | null
          hist: Json | null
          id: string
          ie_habilitada: boolean | null
          ie_probs: Json | null
          ie_s3d: string | null
          ie_status: string | null
          ies: Json | null
          ies_s3d: Json | null
          im: string | null
          is_cc: boolean | null
          is_cpf: boolean | null
          isento: string | null
          razao: string | null
          regime: string | null
          session_id: string
          simples_cnpja: string | null
          simples_inc: string | null
          sit: string | null
          sit_data: string | null
          sit_motivo: string | null
          sn_cnpja: boolean | null
          sn_div: boolean | null
          sn_s3d: boolean | null
          socios_atuais: Json | null
          tags: Json | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          atividades_all?: Json | null
          cnae?: string | null
          cnae_desc?: string | null
          cnae_obrig?: string | null
          cnpj?: string | null
          consultado?: boolean | null
          created_at?: string
          file_name?: string | null
          grupo?: string | null
          hist?: Json | null
          id?: string
          ie_habilitada?: boolean | null
          ie_probs?: Json | null
          ie_s3d?: string | null
          ie_status?: string | null
          ies?: Json | null
          ies_s3d?: Json | null
          im?: string | null
          is_cc?: boolean | null
          is_cpf?: boolean | null
          isento?: string | null
          razao?: string | null
          regime?: string | null
          session_id: string
          simples_cnpja?: string | null
          simples_inc?: string | null
          sit?: string | null
          sit_data?: string | null
          sit_motivo?: string | null
          sn_cnpja?: boolean | null
          sn_div?: boolean | null
          sn_s3d?: boolean | null
          socios_atuais?: Json | null
          tags?: Json | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          atividades_all?: Json | null
          cnae?: string | null
          cnae_desc?: string | null
          cnae_obrig?: string | null
          cnpj?: string | null
          consultado?: boolean | null
          created_at?: string
          file_name?: string | null
          grupo?: string | null
          hist?: Json | null
          id?: string
          ie_habilitada?: boolean | null
          ie_probs?: Json | null
          ie_s3d?: string | null
          ie_status?: string | null
          ies?: Json | null
          ies_s3d?: Json | null
          im?: string | null
          is_cc?: boolean | null
          is_cpf?: boolean | null
          isento?: string | null
          razao?: string | null
          regime?: string | null
          session_id?: string
          simples_cnpja?: string | null
          simples_inc?: string | null
          sit?: string | null
          sit_data?: string | null
          sit_motivo?: string | null
          sn_cnpja?: boolean | null
          sn_div?: boolean | null
          sn_s3d?: boolean | null
          socios_atuais?: Json | null
          tags?: Json | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      auditoria_observacoes: {
        Row: {
          atualizado_em: string
          cnpj: string
          observacao: string | null
          usuario: string | null
        }
        Insert: {
          atualizado_em?: string
          cnpj: string
          observacao?: string | null
          usuario?: string | null
        }
        Update: {
          atualizado_em?: string
          cnpj?: string
          observacao?: string | null
          usuario?: string | null
        }
        Relationships: []
      }
      auditoria_sessao: {
        Row: {
          created_at: string
          file_name: string | null
          id: string
          session_id: string
          total: number | null
          updated_at: string
          uploaded_at: string
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          id?: string
          session_id: string
          total?: number | null
          updated_at?: string
          uploaded_at?: string
        }
        Update: {
          created_at?: string
          file_name?: string | null
          id?: string
          session_id?: string
          total?: number | null
          updated_at?: string
          uploaded_at?: string
        }
        Relationships: []
      }
      auditoria_snapshots: {
        Row: {
          created_at: string
          data: Json | null
          key: string
          saved_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          key: string
          saved_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          key?: string
          saved_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      bi_config_contabil: {
        Row: {
          apuracao: string | null
          cnpj: string
          curva: string | null
          fech_tipo: string | null
          integrado: string | null
          software: string | null
          tipo_emp: string | null
          tipo_holding: string | null
          updated_at: string
        }
        Insert: {
          apuracao?: string | null
          cnpj: string
          curva?: string | null
          fech_tipo?: string | null
          integrado?: string | null
          software?: string | null
          tipo_emp?: string | null
          tipo_holding?: string | null
          updated_at?: string
        }
        Update: {
          apuracao?: string | null
          cnpj?: string
          curva?: string | null
          fech_tipo?: string | null
          integrado?: string | null
          software?: string | null
          tipo_emp?: string | null
          tipo_holding?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bi_config_contabil_cnpj_fkey"
            columns: ["cnpj"]
            isOneToOne: true
            referencedRelation: "bi_empresas"
            referencedColumns: ["cnpj"]
          },
        ]
      }
      bi_config_fiscal: {
        Row: {
          cnpj: string
          curva: string | null
          updated_at: string
        }
        Insert: {
          cnpj: string
          curva?: string | null
          updated_at?: string
        }
        Update: {
          cnpj?: string
          curva?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bi_config_fiscal_cnpj_fkey"
            columns: ["cnpj"]
            isOneToOne: true
            referencedRelation: "bi_empresas"
            referencedColumns: ["cnpj"]
          },
        ]
      }
      bi_config_folha: {
        Row: {
          adiant: boolean | null
          cnpj: string
          curva: string | null
          dia_adiant: string | null
          fechamento: string | null
          sistema: string | null
          updated_at: string
        }
        Insert: {
          adiant?: boolean | null
          cnpj: string
          curva?: string | null
          dia_adiant?: string | null
          fechamento?: string | null
          sistema?: string | null
          updated_at?: string
        }
        Update: {
          adiant?: boolean | null
          cnpj?: string
          curva?: string | null
          dia_adiant?: string | null
          fechamento?: string | null
          sistema?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bi_config_folha_cnpj_fkey"
            columns: ["cnpj"]
            isOneToOne: true
            referencedRelation: "bi_empresas"
            referencedColumns: ["cnpj"]
          },
        ]
      }
      bi_empresas: {
        Row: {
          cnpj: string
          contabil: string | null
          fiscal: string | null
          grupo: string | null
          is_new: boolean
          pessoal: string | null
          razao: string | null
          regime: string | null
          tags: string | null
          updated_at: string
        }
        Insert: {
          cnpj: string
          contabil?: string | null
          fiscal?: string | null
          grupo?: string | null
          is_new?: boolean
          pessoal?: string | null
          razao?: string | null
          regime?: string | null
          tags?: string | null
          updated_at?: string
        }
        Update: {
          cnpj?: string
          contabil?: string | null
          fiscal?: string | null
          grupo?: string | null
          is_new?: boolean
          pessoal?: string | null
          razao?: string | null
          regime?: string | null
          tags?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      bi_opcoes: {
        Row: {
          categoria: string
          created_at: string
          id: string
          ordem: number
          updated_at: string
          valor: string
        }
        Insert: {
          categoria: string
          created_at?: string
          id?: string
          ordem?: number
          updated_at?: string
          valor: string
        }
        Update: {
          categoria?: string
          created_at?: string
          id?: string
          ordem?: number
          updated_at?: string
          valor?: string
        }
        Relationships: []
      }
      bi_vidas_empregados: {
        Row: {
          afastados: number | null
          cnpj: string
          ferias: number | null
          total_ativos: number | null
          trabalhando: number | null
          updated_at: string
        }
        Insert: {
          afastados?: number | null
          cnpj: string
          ferias?: number | null
          total_ativos?: number | null
          trabalhando?: number | null
          updated_at?: string
        }
        Update: {
          afastados?: number | null
          cnpj?: string
          ferias?: number | null
          total_ativos?: number | null
          trabalhando?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      carteira_historico: {
        Row: {
          cnpj: string | null
          colaborador_cargo: string | null
          colaborador_id: string | null
          colaborador_nome: string | null
          departamento: string | null
          dt_vigencia: string | null
          evento: string
          grupo: string | null
          id: string
          motivo: string | null
          razao: string | null
          registrado_em: string
          registrado_por: string | null
          vinculo_id: string | null
        }
        Insert: {
          cnpj?: string | null
          colaborador_cargo?: string | null
          colaborador_id?: string | null
          colaborador_nome?: string | null
          departamento?: string | null
          dt_vigencia?: string | null
          evento: string
          grupo?: string | null
          id?: string
          motivo?: string | null
          razao?: string | null
          registrado_em?: string
          registrado_por?: string | null
          vinculo_id?: string | null
        }
        Update: {
          cnpj?: string | null
          colaborador_cargo?: string | null
          colaborador_id?: string | null
          colaborador_nome?: string | null
          departamento?: string | null
          dt_vigencia?: string | null
          evento?: string
          grupo?: string | null
          id?: string
          motivo?: string | null
          razao?: string | null
          registrado_em?: string
          registrado_por?: string | null
          vinculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carteira_historico_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carteira_historico_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "carteira_vinculos"
            referencedColumns: ["id"]
          },
        ]
      }
      carteira_trava: {
        Row: {
          atualizado_em: string | null
          atualizado_por: string | null
          dt_liberacao: string | null
          id: number
          travado: boolean
        }
        Insert: {
          atualizado_em?: string | null
          atualizado_por?: string | null
          dt_liberacao?: string | null
          id?: number
          travado?: boolean
        }
        Update: {
          atualizado_em?: string | null
          atualizado_por?: string | null
          dt_liberacao?: string | null
          id?: number
          travado?: boolean
        }
        Relationships: []
      }
      carteira_vinculos: {
        Row: {
          atualizado_em: string
          cnpj: string | null
          colaborador_id: string | null
          criado_em: string
          criado_por: string | null
          departamento: string
          dt_fim: string | null
          dt_inicio: string
          grupo: string | null
          id: string
          motivo: string | null
          razao: string | null
          status: string
        }
        Insert: {
          atualizado_em?: string
          cnpj?: string | null
          colaborador_id?: string | null
          criado_em?: string
          criado_por?: string | null
          departamento: string
          dt_fim?: string | null
          dt_inicio: string
          grupo?: string | null
          id?: string
          motivo?: string | null
          razao?: string | null
          status?: string
        }
        Update: {
          atualizado_em?: string
          cnpj?: string | null
          colaborador_id?: string | null
          criado_em?: string
          criado_por?: string | null
          departamento?: string
          dt_fim?: string | null
          dt_inicio?: string
          grupo?: string | null
          id?: string
          motivo?: string | null
          razao?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "carteira_vinculos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      certificados: {
        Row: {
          atualizado_em: string
          cnpj: string
          dados: Json
          fonte: string
          id: string
          importacao_id: string
          razao: string | null
          usuarios: Json
          validade: string | null
        }
        Insert: {
          atualizado_em?: string
          cnpj: string
          dados?: Json
          fonte: string
          id?: string
          importacao_id: string
          razao?: string | null
          usuarios?: Json
          validade?: string | null
        }
        Update: {
          atualizado_em?: string
          cnpj?: string
          dados?: Json
          fonte?: string
          id?: string
          importacao_id?: string
          razao?: string | null
          usuarios?: Json
          validade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certificados_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "certificados_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      certificados_importacoes: {
        Row: {
          arquivo_nome: string
          ativo: boolean
          criado_em: string
          criado_por: string | null
          fonte: string
          id: string
          observacao: string | null
          total_certificados: number
          total_linhas: number
        }
        Insert: {
          arquivo_nome: string
          ativo?: boolean
          criado_em?: string
          criado_por?: string | null
          fonte: string
          id?: string
          observacao?: string | null
          total_certificados?: number
          total_linhas?: number
        }
        Update: {
          arquivo_nome?: string
          ativo?: boolean
          criado_em?: string
          criado_por?: string | null
          fonte?: string
          id?: string
          observacao?: string | null
          total_certificados?: number
          total_linhas?: number
        }
        Relationships: []
      }
      colaboradores: {
        Row: {
          ativo: boolean
          atualizado_em: string
          cargo: string | null
          criado_em: string
          departamento: string | null
          email: string | null
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          cargo?: string | null
          criado_em?: string
          departamento?: string | null
          email?: string | null
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          cargo?: string | null
          criado_em?: string
          departamento?: string | null
          email?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      competencias_fechadas: {
        Row: {
          competencia: string
          fechado_em: string
          fechado_por: string | null
          totais_json: Json
        }
        Insert: {
          competencia: string
          fechado_em?: string
          fechado_por?: string | null
          totais_json?: Json
        }
        Update: {
          competencia?: string
          fechado_em?: string
          fechado_por?: string | null
          totais_json?: Json
        }
        Relationships: []
      }
      controle_tags_empresa_hist: {
        Row: {
          cnpj: string
          diff_added: string[]
          diff_removed: string[]
          grupo: string | null
          id: string
          razao: string | null
          regime: string | null
          sem_tag: boolean
          snapshot_id: string
          status: string
          tags: string[]
        }
        Insert: {
          cnpj: string
          diff_added?: string[]
          diff_removed?: string[]
          grupo?: string | null
          id?: string
          razao?: string | null
          regime?: string | null
          sem_tag?: boolean
          snapshot_id: string
          status?: string
          tags?: string[]
        }
        Update: {
          cnpj?: string
          diff_added?: string[]
          diff_removed?: string[]
          grupo?: string | null
          id?: string
          razao?: string | null
          regime?: string | null
          sem_tag?: boolean
          snapshot_id?: string
          status?: string
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "controle_tags_empresa_hist_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "controle_tags_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      controle_tags_snapshots: {
        Row: {
          competencia: string | null
          criado_em: string
          criado_por: string | null
          id: string
          importacao_id: string | null
          observacao: string | null
          total_alteradas: number
          total_empresas: number
          total_novas: number
          total_removidas: number
          total_tags: number
        }
        Insert: {
          competencia?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          importacao_id?: string | null
          observacao?: string | null
          total_alteradas?: number
          total_empresas?: number
          total_novas?: number
          total_removidas?: number
          total_tags?: number
        }
        Update: {
          competencia?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          importacao_id?: string | null
          observacao?: string | null
          total_alteradas?: number
          total_empresas?: number
          total_novas?: number
          total_removidas?: number
          total_tags?: number
        }
        Relationships: []
      }
      cruzamento_folha_resultados: {
        Row: {
          afastados: number
          cnpj: string | null
          created_at: string
          equipe: string | null
          ferias: number
          id: string
          nome: string | null
          responsavel: string | null
          session_id: string
          tags: string | null
          tem_ativos: boolean
          tipo: string
          total_ativos: number
          trabalhando: number
        }
        Insert: {
          afastados?: number
          cnpj?: string | null
          created_at?: string
          equipe?: string | null
          ferias?: number
          id?: string
          nome?: string | null
          responsavel?: string | null
          session_id: string
          tags?: string | null
          tem_ativos?: boolean
          tipo: string
          total_ativos?: number
          trabalhando?: number
        }
        Update: {
          afastados?: number
          cnpj?: string | null
          created_at?: string
          equipe?: string | null
          ferias?: number
          id?: string
          nome?: string | null
          responsavel?: string | null
          session_id?: string
          tags?: string | null
          tem_ativos?: boolean
          tipo?: string
          total_ativos?: number
          trabalhando?: number
        }
        Relationships: [
          {
            foreignKeyName: "cruzamento_folha_resultados_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cruzamento_folha_sessao"
            referencedColumns: ["session_id"]
          },
        ]
      }
      cruzamento_folha_sessao: {
        Row: {
          created_at: string
          file_cad: string | null
          file_emp: string | null
          file_s3d: string | null
          id: string
          session_id: string
          total_alertas: number
          total_empresas_dp: number
          uploaded_at: string
        }
        Insert: {
          created_at?: string
          file_cad?: string | null
          file_emp?: string | null
          file_s3d?: string | null
          id?: string
          session_id: string
          total_alertas?: number
          total_empresas_dp?: number
          uploaded_at?: string
        }
        Update: {
          created_at?: string
          file_cad?: string | null
          file_emp?: string | null
          file_s3d?: string | null
          id?: string
          session_id?: string
          total_alertas?: number
          total_empresas_dp?: number
          uploaded_at?: string
        }
        Relationships: []
      }
      empresas_base_mensal: {
        Row: {
          atualizado_em: string
          cnpj: string
          competencia: string
          dados: Json
          grupo: string | null
          id: string
          importacao_id: string
          nome_fantasia: string | null
          razao: string | null
          regime: string | null
          sem_tag: boolean
          tags: string[]
        }
        Insert: {
          atualizado_em?: string
          cnpj: string
          competencia: string
          dados?: Json
          grupo?: string | null
          id?: string
          importacao_id: string
          nome_fantasia?: string | null
          razao?: string | null
          regime?: string | null
          sem_tag?: boolean
          tags?: string[]
        }
        Update: {
          atualizado_em?: string
          cnpj?: string
          competencia?: string
          dados?: Json
          grupo?: string | null
          id?: string
          importacao_id?: string
          nome_fantasia?: string | null
          razao?: string | null
          regime?: string | null
          sem_tag?: boolean
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "empresas_base_mensal_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "empresas_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas_importacoes: {
        Row: {
          arquivo_nome: string
          ativo: boolean
          competencia: string
          criado_em: string
          criado_por: string | null
          id: string
          observacao: string | null
          total_empresas: number
          total_linhas: number
        }
        Insert: {
          arquivo_nome: string
          ativo?: boolean
          competencia: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          observacao?: string | null
          total_empresas?: number
          total_linhas?: number
        }
        Update: {
          arquivo_nome?: string
          ativo?: boolean
          competencia?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          observacao?: string | null
          total_empresas?: number
          total_linhas?: number
        }
        Relationships: []
      }
      empresas_tags: {
        Row: {
          atualizado_em: string
          cnpj: string
          grupo: string | null
          razao: string | null
          regime: string | null
          sem_tag: boolean
          tags: string[]
        }
        Insert: {
          atualizado_em?: string
          cnpj: string
          grupo?: string | null
          razao?: string | null
          regime?: string | null
          sem_tag?: boolean
          tags?: string[]
        }
        Update: {
          atualizado_em?: string
          cnpj?: string
          grupo?: string | null
          razao?: string | null
          regime?: string | null
          sem_tag?: boolean
          tags?: string[]
        }
        Relationships: []
      }
      entregas_contabil_cadastros: {
        Row: {
          atualizado_em: string
          cnpj: string
          competencia: string | null
          data_entrega: string | null
          id: string
          obrigacao: string
          prazo_legal: string | null
          prazo_tecnico: string | null
          protocolo: string | null
          razao: string | null
          responsavel_entrega: string | null
          responsavel_prazo: string | null
          status: string | null
        }
        Insert: {
          atualizado_em?: string
          cnpj: string
          competencia?: string | null
          data_entrega?: string | null
          id?: string
          obrigacao: string
          prazo_legal?: string | null
          prazo_tecnico?: string | null
          protocolo?: string | null
          razao?: string | null
          responsavel_entrega?: string | null
          responsavel_prazo?: string | null
          status?: string | null
        }
        Update: {
          atualizado_em?: string
          cnpj?: string
          competencia?: string | null
          data_entrega?: string | null
          id?: string
          obrigacao?: string
          prazo_legal?: string | null
          prazo_tecnico?: string | null
          protocolo?: string | null
          razao?: string | null
          responsavel_entrega?: string | null
          responsavel_prazo?: string | null
          status?: string | null
        }
        Relationships: []
      }
      historico_importacoes: {
        Row: {
          ano_referencia: number | null
          arquivo_nome: string
          created_at: string
          id: string
          linhas_importadas: number
          mes_referencia: number | null
          observacao: string | null
          processo_slug: string
        }
        Insert: {
          ano_referencia?: number | null
          arquivo_nome: string
          created_at?: string
          id?: string
          linhas_importadas?: number
          mes_referencia?: number | null
          observacao?: string | null
          processo_slug: string
        }
        Update: {
          ano_referencia?: number | null
          arquivo_nome?: string
          created_at?: string
          id?: string
          linhas_importadas?: number
          mes_referencia?: number | null
          observacao?: string | null
          processo_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "historico_importacoes_processo_slug_fkey"
            columns: ["processo_slug"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["slug"]
          },
        ]
      }
      indicadores_mensais: {
        Row: {
          ano: number
          created_at: string
          id: string
          indicador_chave: string
          indicador_rotulo: string
          mes: number
          meta: number | null
          processo_slug: string
          unidade: string
          valor: number
        }
        Insert: {
          ano: number
          created_at?: string
          id?: string
          indicador_chave: string
          indicador_rotulo: string
          mes: number
          meta?: number | null
          processo_slug: string
          unidade?: string
          valor?: number
        }
        Update: {
          ano?: number
          created_at?: string
          id?: string
          indicador_chave?: string
          indicador_rotulo?: string
          mes?: number
          meta?: number | null
          processo_slug?: string
          unidade?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "indicadores_mensais_processo_slug_fkey"
            columns: ["processo_slug"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["slug"]
          },
        ]
      }
      irpj_lp_automatizacao: {
        Row: {
          cnpj: string
          competencia: string
          criado_em: string
          dados: Json
          empresa: string | null
          grupo: string | null
          id: string
          regime: string | null
          ultimo_balancete: string | null
          ultimo_balancete_iso: string | null
          upload_id: string
        }
        Insert: {
          cnpj: string
          competencia: string
          criado_em?: string
          dados?: Json
          empresa?: string | null
          grupo?: string | null
          id?: string
          regime?: string | null
          ultimo_balancete?: string | null
          ultimo_balancete_iso?: string | null
          upload_id: string
        }
        Update: {
          cnpj?: string
          competencia?: string
          criado_em?: string
          dados?: Json
          empresa?: string | null
          grupo?: string | null
          id?: string
          regime?: string | null
          ultimo_balancete?: string | null
          ultimo_balancete_iso?: string | null
          upload_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "irpj_lr_automatizacao_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "irpj_lp_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      irpj_lp_uploads: {
        Row: {
          arquivo_nome: string
          competencia: string
          criado_em: string
          criado_por: string | null
          id: string
          observacao: string | null
          total_linhas: number
        }
        Insert: {
          arquivo_nome: string
          competencia: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          observacao?: string | null
          total_linhas?: number
        }
        Update: {
          arquivo_nome?: string
          competencia?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          observacao?: string | null
          total_linhas?: number
        }
        Relationships: []
      }
      okr_acessos: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          nome_normalizado: string
          perfil: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          nome_normalizado: string
          perfil?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          nome_normalizado?: string
          perfil?: string
          updated_at?: string
        }
        Relationships: []
      }
      okr_estado: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          chave: string
          dados: Json
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          chave: string
          dados?: Json
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          chave?: string
          dados?: Json
        }
        Relationships: []
      }
      okr_painel: {
        Row: {
          created_at: string
          id: string
          next_ids: Json | null
          okrs: Json | null
          pessoas: Json | null
          produtos: Json | null
          sistemas: Json | null
          triagem: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          next_ids?: Json | null
          okrs?: Json | null
          pessoas?: Json | null
          produtos?: Json | null
          sistemas?: Json | null
          triagem?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          next_ids?: Json | null
          okrs?: Json | null
          pessoas?: Json | null
          produtos?: Json | null
          sistemas?: Json | null
          triagem?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      processos: {
        Row: {
          cor: string
          created_at: string
          descricao: string | null
          icone: string | null
          nome: string
          ordem: number
          slug: string
        }
        Insert: {
          cor?: string
          created_at?: string
          descricao?: string | null
          icone?: string | null
          nome: string
          ordem?: number
          slug: string
        }
        Update: {
          cor?: string
          created_at?: string
          descricao?: string | null
          icone?: string | null
          nome?: string
          ordem?: number
          slug?: string
        }
        Relationships: []
      }
      processos_versoes: {
        Row: {
          arquivo_nome: string
          ativo: boolean
          created_at: string
          html_content: string
          id: string
          observacao: string | null
          processo_slug: string
          tamanho_bytes: number
        }
        Insert: {
          arquivo_nome: string
          ativo?: boolean
          created_at?: string
          html_content: string
          id?: string
          observacao?: string | null
          processo_slug: string
          tamanho_bytes?: number
        }
        Update: {
          arquivo_nome?: string
          ativo?: boolean
          created_at?: string
          html_content?: string
          id?: string
          observacao?: string | null
          processo_slug?: string
          tamanho_bytes?: number
        }
        Relationships: [
          {
            foreignKeyName: "processos_versoes_processo_slug_fkey"
            columns: ["processo_slug"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["slug"]
          },
        ]
      }
      procuracoes_cadastros: {
        Row: {
          atualizado_em: string
          certificado: string | null
          cnpj: string
          razao: string | null
          situacao: string | null
          validade: string | null
        }
        Insert: {
          atualizado_em?: string
          certificado?: string | null
          cnpj: string
          razao?: string | null
          situacao?: string | null
          validade?: string | null
        }
        Update: {
          atualizado_em?: string
          certificado?: string | null
          cnpj?: string
          razao?: string | null
          situacao?: string | null
          validade?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          must_change_password: boolean
          nome: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          must_change_password?: boolean
          nome?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          must_change_password?: boolean
          nome?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      saam_bases: {
        Row: {
          atualizado_em: string
          base: string
          quantidade_contratada: number
          rotulo: string
        }
        Insert: {
          atualizado_em?: string
          base: string
          quantidade_contratada?: number
          rotulo: string
        }
        Update: {
          atualizado_em?: string
          base?: string
          quantidade_contratada?: number
          rotulo?: string
        }
        Relationships: []
      }
      saam_cadastros: {
        Row: {
          apelido: string | null
          atualizado_em: string
          base: string
          cidade: string | null
          cnpj: string
          razao: string | null
          uf: string | null
        }
        Insert: {
          apelido?: string | null
          atualizado_em?: string
          base?: string
          cidade?: string | null
          cnpj: string
          razao?: string | null
          uf?: string | null
        }
        Update: {
          apelido?: string | null
          atualizado_em?: string
          base?: string
          cidade?: string | null
          cnpj?: string
          razao?: string | null
          uf?: string | null
        }
        Relationships: []
      }
      shared_state: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      sittax_monitora_ag: {
        Row: {
          cert_nome: string | null
          cert_raw: string | null
          cnpj: string
          created_at: string
          dias_fed: number | null
          equipe: string | null
          razao: string | null
          status_cert: string | null
          updated_at: string
          usa_proc: boolean | null
          val_fed: string | null
        }
        Insert: {
          cert_nome?: string | null
          cert_raw?: string | null
          cnpj: string
          created_at?: string
          dias_fed?: number | null
          equipe?: string | null
          razao?: string | null
          status_cert?: string | null
          updated_at?: string
          usa_proc?: boolean | null
          val_fed?: string | null
        }
        Update: {
          cert_nome?: string | null
          cert_raw?: string | null
          cnpj?: string
          created_at?: string
          dias_fed?: number | null
          equipe?: string | null
          razao?: string | null
          status_cert?: string | null
          updated_at?: string
          usa_proc?: boolean | null
          val_fed?: string | null
        }
        Relationships: []
      }
      sittax_monitora_cpf: {
        Row: {
          cpf: string | null
          cpf_norm: string
          created_at: string
          grupo: string | null
          is_cc: boolean | null
          razao: string | null
          regime: string | null
          tags: Json | null
          updated_at: string
        }
        Insert: {
          cpf?: string | null
          cpf_norm: string
          created_at?: string
          grupo?: string | null
          is_cc?: boolean | null
          razao?: string | null
          regime?: string | null
          tags?: Json | null
          updated_at?: string
        }
        Update: {
          cpf?: string | null
          cpf_norm?: string
          created_at?: string
          grupo?: string | null
          is_cc?: boolean | null
          razao?: string | null
          regime?: string | null
          tags?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      sittax_monitora_meta: {
        Row: {
          ag_name: string | null
          created_at: string
          id: number
          s3d_name: string | null
          updated_at: string
          uploaded_at: string
        }
        Insert: {
          ag_name?: string | null
          created_at?: string
          id?: number
          s3d_name?: string | null
          updated_at?: string
          uploaded_at?: string
        }
        Update: {
          ag_name?: string | null
          created_at?: string
          id?: number
          s3d_name?: string | null
          updated_at?: string
          uploaded_at?: string
        }
        Relationships: []
      }
      sittax_monitora_s3d: {
        Row: {
          cnpj: string
          created_at: string
          fed_status: string | null
          grupo: string | null
          has_cont: boolean | null
          has_dp: boolean | null
          has_fisc: boolean | null
          is_cc: boolean | null
          is_fiscal: boolean | null
          razao: string | null
          regime: string | null
          tags: Json | null
          updated_at: string
        }
        Insert: {
          cnpj: string
          created_at?: string
          fed_status?: string | null
          grupo?: string | null
          has_cont?: boolean | null
          has_dp?: boolean | null
          has_fisc?: boolean | null
          is_cc?: boolean | null
          is_fiscal?: boolean | null
          razao?: string | null
          regime?: string | null
          tags?: Json | null
          updated_at?: string
        }
        Update: {
          cnpj?: string
          created_at?: string
          fed_status?: string | null
          grupo?: string | null
          has_cont?: boolean | null
          has_dp?: boolean | null
          has_fisc?: boolean | null
          is_cc?: boolean | null
          is_fiscal?: boolean | null
          razao?: string | null
          regime?: string | null
          tags?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      sittax_sn_cadastros: {
        Row: {
          apelido: string | null
          atualizado_em: string
          cidade: string | null
          cnpj: string
          razao: string | null
          uf: string | null
        }
        Insert: {
          apelido?: string | null
          atualizado_em?: string
          cidade?: string | null
          cnpj: string
          razao?: string | null
          uf?: string | null
        }
        Update: {
          apelido?: string | null
          atualizado_em?: string
          cidade?: string | null
          cnpj?: string
          razao?: string | null
          uf?: string | null
        }
        Relationships: []
      }
      tags_base: {
        Row: {
          atualizado_em: string
          coord: string | null
          dept: string
          gerente: string | null
          key: string
          label: string
          ordem: number
          supers: string[]
        }
        Insert: {
          atualizado_em?: string
          coord?: string | null
          dept: string
          gerente?: string | null
          key: string
          label: string
          ordem?: number
          supers?: string[]
        }
        Update: {
          atualizado_em?: string
          coord?: string | null
          dept?: string
          gerente?: string | null
          key?: string
          label?: string
          ordem?: number
          supers?: string[]
        }
        Relationships: []
      }
      tarefas_fixas: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          periodicidade: string
          processo_slug: string | null
          proxima_execucao: string
          responsavel_id: string | null
          responsavel_nome: string | null
          titulo: string
          ultima_execucao: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          periodicidade: string
          processo_slug?: string | null
          proxima_execucao?: string
          responsavel_id?: string | null
          responsavel_nome?: string | null
          titulo: string
          ultima_execucao?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          periodicidade?: string
          processo_slug?: string | null
          proxima_execucao?: string
          responsavel_id?: string | null
          responsavel_nome?: string | null
          titulo?: string
          ultima_execucao?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_fixas_processo_slug_fkey"
            columns: ["processo_slug"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["slug"]
          },
        ]
      }
      tarefas_fixas_execucoes: {
        Row: {
          created_at: string
          executada_em: string
          executada_por_id: string | null
          executada_por_nome: string | null
          id: string
          observacao: string | null
          periodicidade_no_momento: string | null
          proxima_execucao_anterior: string | null
          proxima_execucao_nova: string | null
          tarefa_id: string
        }
        Insert: {
          created_at?: string
          executada_em?: string
          executada_por_id?: string | null
          executada_por_nome?: string | null
          id?: string
          observacao?: string | null
          periodicidade_no_momento?: string | null
          proxima_execucao_anterior?: string | null
          proxima_execucao_nova?: string | null
          tarefa_id: string
        }
        Update: {
          created_at?: string
          executada_em?: string
          executada_por_id?: string | null
          executada_por_nome?: string | null
          id?: string
          observacao?: string | null
          periodicidade_no_momento?: string | null
          proxima_execucao_anterior?: string | null
          proxima_execucao_nova?: string | null
          tarefa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_fixas_execucoes_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "tarefas_fixas"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefas_versoes: {
        Row: {
          arquivo_nome: string
          ativo: boolean
          created_at: string
          html_content: string
          id: string
          observacao: string | null
          tamanho_bytes: number
          tarefa_slug: string
        }
        Insert: {
          arquivo_nome: string
          ativo?: boolean
          created_at?: string
          html_content: string
          id?: string
          observacao?: string | null
          tamanho_bytes?: number
          tarefa_slug: string
        }
        Update: {
          arquivo_nome?: string
          ativo?: boolean
          created_at?: string
          html_content?: string
          id?: string
          observacao?: string | null
          tamanho_bytes?: number
          tarefa_slug?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      validacao_cadastro_estado: {
        Row: {
          empresas: Json
          file_name: string | null
          id: number
          saved_at: string
          total_empresas: number
        }
        Insert: {
          empresas?: Json
          file_name?: string | null
          id?: number
          saved_at?: string
          total_empresas?: number
        }
        Update: {
          empresas?: Json
          file_name?: string | null
          id?: number
          saved_at?: string
          total_empresas?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "gestor" | "colaborador"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "gestor", "colaborador"],
    },
  },
} as const
