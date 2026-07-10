// ============================================================
// Tipos TypeScript — espelho das tabelas do Supabase
// ============================================================

export interface Usuario {
  id: string
  nome: string
  email: string
  version: number
  created_at: string
  updated_at: string
}

export interface MembroFamiliar {
  id: string
  usuario_id: string
  nome: string
  data_nascimento: string
  sexo: 'M' | 'F' | 'outro'
  relacao: 'titular' | 'conjuge' | 'filho' | 'filha' | 'pai' | 'mae' | 'avo' | 'avo_materna' | 'outro'
  tipo_calendario: 'infantil' | 'adolescente' | 'adulto' | 'gestante' | 'idoso' | 'especial'
  gestacao_semanas?: number
  mae_id?: string
  observacoes?: string
  foto_url?: string
  version: number
  created_at: string
  updated_at: string
}

export interface Vacina {
  id: string
  nome: string
  nome_completo: string
  descricao?: string
  fabricante_default?: string
  intervalos_por_fabricante?: Record<string, unknown>
  doencas_previstas: string[]
  faixa_etaria: string[]
  idade_minima_dias?: number
  doses_total: number
  obrigatoria: boolean
  contabiliza_esquema: boolean
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface RegraReforco {
  id: string
  vacina_id: string
  numero_dose: number
  idade_minima_dias?: number
  intervalo_anterior_dias?: number
  descricao?: string
  created_at: string
  updated_at: string
}

export interface RegistroVacinal {
  id: string
  membro_familiar_id: string
  vacina_id: string
  numero_dose: number
  data_aplicacao: string
  local_aplicacao?: string
  fabricante?: string
  lote?: string
  dose_zero: boolean
  comprovante_url?: string
  observacoes?: string
  version: number
  created_at: string
  updated_at: string
}

export interface Lembrete {
  id: string
  usuario_id: string
  membro_familiar_id?: string
  vacina_id?: string
  tipo: 'campanha' | 'reforco' | 'manual'
  titulo: string
  descricao?: string
  data_prevista: string
  automatico: boolean
  status: 'pendente' | 'concluido' | 'ignorado'
  version: number
  created_at: string
  updated_at: string
}
