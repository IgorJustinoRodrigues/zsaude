// Cliente do ViaCEP (API pública de CEP brasileiro).
// Docs: https://viacep.com.br/

export interface ViaCepAddress {
  cep: string            // "74110-010"
  logradouro: string     // ex: "Rua 1"
  complemento: string
  bairro: string
  localidade: string     // cidade
  uf: string             // ex: "GO"
  ibge: string           // código IBGE do município (7 dígitos)
  ddd: string
  erro?: boolean
}

export async function fetchCep(cep: string): Promise<ViaCepAddress | null> {
  const clean = cep.replace(/\D/g, '')
  if (clean.length !== 8) return null
  try {
    const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`)
    if (!res.ok) return null
    const data = await res.json() as ViaCepAddress
    if (data.erro) return null
    return data
  } catch {
    return null
  }
}
