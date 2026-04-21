// Integração CadSUS (DATASUS PDQ Supplier) — busca de paciente por
// CPF/CNS/nome+nascimento. O backend encapsula todo o protocolo SOAP/HL7.

import { api } from './client'

export interface CadsusAddress {
  cep: string
  logradouro: string
  tipo: string
  numero: string
  complemento: string
  bairro: string
  ibge: string
  ibgeOriginal: string
  pais: string
}

export interface CadsusPatientResult {
  cns: string
  nome: string
  nomeMae: string
  nomePai: string
  dataNascimento: string    // ISO AAAA-MM-DD
  sexo: string              // M / F
  racaCor: string
  telefone: string
  cpf: string
  rg: string
  naturalidadeIbge: string
  endereco: CadsusAddress
}

export interface CadsusSearchResponse {
  items: CadsusPatientResult[]
  source: 'pdq' | 'mock'
}

export interface CadsusSearchParams {
  cpf?: string
  cns?: string
  nome?: string
  dataNascimento?: string
  nomeMae?: string
  sexo?: 'M' | 'F'
}

function qs(params: Record<string, string | undefined>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v) p.set(k, v)
  }
  const str = p.toString()
  return str ? `?${str}` : ''
}

export const cadsusApi = {
  search: (params: CadsusSearchParams) =>
    api.get<CadsusSearchResponse>(
      `/api/v1/hsp/cadsus/search${qs({
        cpf: params.cpf,
        cns: params.cns,
        nome: params.nome,
        data_nascimento: params.dataNascimento,
        nome_mae: params.nomeMae,
        sexo: params.sexo,
      })}`,
      { withContext: true },
    ),
}
