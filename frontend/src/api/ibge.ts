// Cliente da API pública do IBGE (Localidades).
// Docs: https://servicodados.ibge.gov.br/api/docs/localidades

export interface IbgeEstado {
  id: number
  sigla: string       // UF (ex: 'GO')
  nome: string        // ex: 'Goiás'
}

export interface IbgeMunicipio {
  id: number          // código IBGE 7 dígitos
  nome: string
  microrregiao?: {
    mesorregiao?: {
      UF?: {
        sigla?: string
        nome?: string
      }
    }
  }
}

const BASE = 'https://servicodados.ibge.gov.br/api/v1/localidades'

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`IBGE ${res.status}`)
  return res.json() as Promise<T>
}

export const ibgeApi = {
  listEstados: async (): Promise<IbgeEstado[]> => {
    const rows = await fetchJson<IbgeEstado[]>(`${BASE}/estados`)
    return rows.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  },

  listMunicipios: async (uf: string): Promise<IbgeMunicipio[]> => {
    const rows = await fetchJson<IbgeMunicipio[]>(`${BASE}/estados/${uf}/municipios`)
    return rows.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  },
}
