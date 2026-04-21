// Máscaras de input — `format` adiciona pontuação visual,
// `unformat` retira pra armazenar só dígitos.

const onlyDigits = (v: string) => v.replace(/\D/g, '')

// ─── CPF ──────────────────────────────────────────────────────────────────

export const cpfMask = {
  format: (v: string) => {
    const d = onlyDigits(v).slice(0, 11)
    if (d.length <= 3) return d
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  },
  unformat: (v: string) => onlyDigits(v).slice(0, 11),
}

// ─── Telefone ─────────────────────────────────────────────────────────────

export const phoneMask = {
  format: (v: string) => {
    const d = onlyDigits(v).slice(0, 11)
    if (d.length <= 2)  return d ? `(${d}` : ''
    if (d.length <= 6)  return `(${d.slice(0, 2)}) ${d.slice(2)}`
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  },
  unformat: (v: string) => onlyDigits(v).slice(0, 11),
}

// ─── CEP ──────────────────────────────────────────────────────────────────

export const cepMask = {
  format: (v: string) => {
    const d = onlyDigits(v).slice(0, 8)
    if (d.length <= 5) return d
    return `${d.slice(0, 5)}-${d.slice(5)}`
  },
  unformat: (v: string) => onlyDigits(v).slice(0, 8),
}

// ─── CNS (Cartão Nacional de Saúde) ───────────────────────────────────────

export const cnsMask = {
  format: (v: string) => {
    const d = onlyDigits(v).slice(0, 15)
    if (d.length <= 3)  return d
    if (d.length <= 7)  return `${d.slice(0, 3)} ${d.slice(3)}`
    if (d.length <= 11) return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`
    return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7, 11)} ${d.slice(11)}`
  },
  unformat: (v: string) => onlyDigits(v).slice(0, 15),
}

// ─── Data ISO (YYYY-MM-DD) ────────────────────────────────────────────────
// Não muda nada — usado em <input type="date"> que já formata.
// Mantido pra simetria caso queira input de data manual.
