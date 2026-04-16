// Validadores síncronos para uso em real-time. Devolvem null se ok,
// ou uma mensagem de erro pronta para exibir.

const onlyDigits = (v: string) => v.replace(/\D/g, '')

// ─── CPF (algoritmo Mod11 oficial) ────────────────────────────────────────

export function validateCpf(cpf: string): string | null {
  const d = onlyDigits(cpf)
  if (!d) return null  // vazio é tratado pela obrigatoriedade
  if (d.length !== 11) return 'CPF deve ter 11 dígitos.'
  if (d === d[0].repeat(11)) return 'CPF inválido.'

  for (const i of [9, 10]) {
    let sum = 0
    for (let j = 0; j < i; j++) sum += parseInt(d[j], 10) * (i + 1 - j)
    let dig = (sum * 10) % 11
    if (dig === 10) dig = 0
    if (dig !== parseInt(d[i], 10)) return 'CPF inválido.'
  }
  return null
}

// ─── CNS (Cartão Nacional de Saúde) ───────────────────────────────────────
// Algoritmo oficial DATASUS — varia conforme primeiro dígito.

export function validateCns(cns: string): string | null {
  const d = onlyDigits(cns)
  if (!d) return null
  if (d.length !== 15) return 'CNS deve ter 15 dígitos.'

  const first = parseInt(d[0], 10)

  if (first === 1 || first === 2) {
    // CNS definitivo: PIS/PASEP base
    const pis = d.slice(0, 11)
    let sum = 0
    for (let i = 0; i < 11; i++) sum += parseInt(pis[i], 10) * (15 - i)
    const rem = sum % 11
    let dv = 11 - rem
    let resultado: string
    if (dv === 11) dv = 0
    if (dv === 10) {
      sum += 2
      const rem2 = sum % 11
      const dv2 = 11 - rem2
      resultado = `${pis}001${dv2 === 10 ? 0 : dv2}`
    } else {
      resultado = `${pis}000${dv}`
    }
    return resultado === d ? null : 'CNS inválido.'
  }

  if (first === 7 || first === 8 || first === 9) {
    // CNS provisório
    let sum = 0
    for (let i = 0; i < 15; i++) sum += parseInt(d[i], 10) * (15 - i)
    return sum % 11 === 0 ? null : 'CNS inválido.'
  }

  return 'CNS inválido (deve começar com 1, 2, 7, 8 ou 9).'
}

// ─── E-mail ───────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateEmail(email: string): string | null {
  if (!email) return null
  return EMAIL_RE.test(email) ? null : 'E-mail inválido.'
}

// ─── Data de nascimento ───────────────────────────────────────────────────

export function validateBirthDate(iso: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Data inválida.'
  const today = new Date()
  if (d > today) return 'Data não pode ser futura.'
  const minYear = today.getFullYear() - 130
  if (d.getFullYear() < minYear) return `Data anterior a ${minYear}.`
  return null
}

// ─── Telefone (BR) ────────────────────────────────────────────────────────

export function validatePhone(phone: string): string | null {
  if (!phone) return null
  const d = onlyDigits(phone)
  if (d.length !== 10 && d.length !== 11) return 'Telefone deve ter 10 ou 11 dígitos.'
  return null
}

// ─── CEP ─────────────────────────────────────────────────────────────────

export function validateCep(cep: string): string | null {
  if (!cep) return null
  const d = onlyDigits(cep)
  if (d.length !== 8) return 'CEP deve ter 8 dígitos.'
  return null
}
