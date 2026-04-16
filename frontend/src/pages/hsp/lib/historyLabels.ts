// Tradução de field_name técnico (snake_case do backend) e valores
// (UUIDs, booleans, enums) para texto amigável na aba Histórico.

import { formatDate } from '../../../lib/utils'

export interface RefItem { id: string; codigo: string; descricao: string }
export type RefMap = Record<string, RefItem[]>

// ─── Nomes humanos de cada campo ───────────────────────────────────────────

export const FIELD_LABELS: Record<string, string> = {
  // Identificação
  prontuario: 'Prontuário',
  name: 'Nome',
  social_name: 'Nome social',
  cpf: 'CPF',
  cns: 'CNS',

  // Nascimento / sexo / gênero
  birth_date: 'Data de nascimento',
  sex: 'Sexo',
  naturalidade_ibge: 'Município de naturalidade',
  naturalidade_uf: 'UF de naturalidade',
  pais_nascimento: 'País de nascimento',
  identidade_genero_id: 'Identidade de gênero',
  orientacao_sexual_id: 'Orientação sexual',

  // Sociodemográfico
  nacionalidade_id: 'Nacionalidade',
  raca_id: 'Raça/Cor',
  etnia_id: 'Etnia',
  estado_civil_id: 'Estado civil',
  escolaridade_id: 'Escolaridade',
  religiao_id: 'Religião',
  povo_tradicional_id: 'Povo tradicional',
  cbo_id: 'CBO',
  ocupacao_livre: 'Ocupação',
  situacao_rua: 'Em situação de rua',
  frequenta_escola: 'Frequenta escola',
  renda_familiar: 'Renda familiar',
  beneficiario_bolsa_familia: 'Beneficiário Bolsa Família',

  // Endereço
  cep: 'CEP',
  logradouro_id: 'Tipo de logradouro',
  endereco: 'Endereço',
  numero: 'Número',
  complemento: 'Complemento',
  bairro: 'Bairro',
  municipio_ibge: 'Município',
  uf: 'UF',
  pais: 'País',
  area_microarea: 'Área/Microárea',

  // Contato
  phone: 'Telefone fixo',
  cellphone: 'Celular',
  phone_recado: 'Telefone para recado',
  email: 'E-mail',
  idioma_preferencial: 'Idioma preferencial',

  // Filiação
  mother_name: 'Nome da mãe',
  mother_unknown: 'Mãe desconhecida',
  father_name: 'Nome do pai',
  father_unknown: 'Pai desconhecido',
  responsavel_nome: 'Nome do responsável',
  responsavel_cpf: 'CPF do responsável',
  responsavel_parentesco_id: 'Parentesco do responsável',
  contato_emergencia_nome: 'Contato de emergência',
  contato_emergencia_telefone: 'Telefone de emergência',
  contato_emergencia_parentesco_id: 'Parentesco do contato de emergência',

  // Clínico
  tipo_sanguineo_id: 'Tipo sanguíneo',
  alergias: 'Alergias',
  tem_alergia: 'Tem alergia',
  doencas_cronicas: 'Doenças crônicas',
  deficiencias: 'Deficiências',
  gestante: 'Gestante',
  dum: 'Data da última menstruação',
  fumante: 'Fumante',
  etilista: 'Etilista',
  observacoes_clinicas: 'Observações clínicas',

  // Convênio
  plano_tipo: 'Tipo de plano',
  convenio_nome: 'Nome do convênio',
  convenio_numero_carteirinha: 'Carteirinha do convênio',
  convenio_validade: 'Validade do convênio',

  // Metadados
  unidade_saude_id: 'Unidade de saúde',
  vinculado: 'Vinculado',
  observacoes: 'Observações',
  consentimento_lgpd: 'Consentimento LGPD',
  current_photo_id: 'Foto',
  active: 'Cadastro ativo',
}

// ─── Qual ref resolve cada *_id ────────────────────────────────────────────

const REF_BY_FIELD: Record<string, string> = {
  nacionalidade_id: 'nacionalidades',
  raca_id: 'racas',
  etnia_id: 'etnias',
  estado_civil_id: 'estados-civis',
  escolaridade_id: 'escolaridades',
  religiao_id: 'religioes',
  povo_tradicional_id: 'povos-tradicionais',
  identidade_genero_id: 'identidades-genero',
  orientacao_sexual_id: 'orientacoes-sexuais',
  responsavel_parentesco_id: 'parentescos',
  contato_emergencia_parentesco_id: 'parentescos',
  tipo_sanguineo_id: 'tipos-sanguineos',
  logradouro_id: 'logradouros',
}

// ─── Enums com descrição humana ────────────────────────────────────────────

const SEX_LABELS: Record<string, string> = {
  M: 'Masculino', F: 'Feminino', I: 'Intersexo',
}
const PLANO_LABELS: Record<string, string> = {
  SUS: 'SUS', PARTICULAR: 'Particular', CONVENIO: 'Convênio',
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function friendlyFieldName(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field]
  if (field.startsWith('document:')) {
    const code = field.split(':', 2)[1]
    return code ? `Documento ${code}` : 'Documento'
  }
  return field  // fallback: técnico mesmo
}

/** Resolve um único valor (string vinda do histórico) pra texto amigável. */
function resolveOne(field: string, raw: string, refs: RefMap): string {
  // Boolean serializado
  if (raw === 'true') return 'Sim'
  if (raw === 'false') return 'Não'

  // Data ISO
  if (ISO_DATE_RE.test(raw)) return formatDate(raw)

  // Sexo
  if (field === 'sex' && SEX_LABELS[raw]) return SEX_LABELS[raw]
  // Plano
  if (field === 'plano_tipo' && PLANO_LABELS[raw]) return PLANO_LABELS[raw]

  // Resolve UUID via ref correspondente
  const refKind = REF_BY_FIELD[field]
  if (refKind && UUID_RE.test(raw)) {
    const item = refs[refKind]?.find(r => r.id === raw)
    if (item) return item.descricao
  }

  return raw
}

/**
 * Converte o valor cru do histórico em texto humano. Trata listas (CSV de
 * UUIDs em deficiencias) e fallbacks. Retorna `'(vazio)'` se nulo/vazio.
 */
export function friendlyValue(field: string, raw: string | null, refs: RefMap): string {
  if (raw === null || raw === '') return '(vazio)'

  // Lista CSV (deficiencias guarda como "uuid1,uuid2,uuid3")
  if (raw.includes(',')) {
    const parts = raw.split(',').map(p => resolveOne(field, p.trim(), refs))
    return parts.join(', ')
  }
  return resolveOne(field, raw, refs)
}
