import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCPF(cpf: string) {
  return cpf.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

export function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11) return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
}

export function formatDate(dateStr: string) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

export function formatDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function calcAge(birthDate: string) {
  const today = new Date()
  const birth = new Date(birthDate)
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

/**
 * Indicador relativo do aniversário. Sempre retorna algo (hoje, amanhã,
 * em N dias, em ~N meses, em ~N anos). Recém-passados (≤30 dias) mostram
 * "fez aniversário há X dias" em vez do próximo. `birthDate` deve estar
 * no formato `YYYY-MM-DD`.
 */
export function birthdayHint(birthDate: string): string | null {
  if (!birthDate) return null
  const [, monthStr, dayStr] = birthDate.split('-')
  const month = parseInt(monthStr, 10) - 1
  const day = parseInt(dayStr, 10)
  if (Number.isNaN(month) || Number.isNaN(day)) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const year = today.getFullYear()

  // Aniversário deste ano (clamp 29/02 pra ano não-bissexto).
  const thisYear = safeDateOnYear(year, month, day)
  const diffDaysThisYear = daysBetween(today, thisYear)

  if (diffDaysThisYear === 0) return 'aniversário hoje 🎂'

  // Recém-passado neste ano (≤30 dias) — mostra o passado em vez do próximo.
  if (diffDaysThisYear < 0) {
    const ago = -diffDaysThisYear
    if (ago === 1) return 'fez aniversário ontem'
    if (ago <= 30) return `fez aniversário há ${ago} dias`
    // Mais antigo: pula pro próximo (ano que vem).
    const next = safeDateOnYear(year + 1, month, day)
    return formatFuture(daysBetween(today, next))
  }

  return formatFuture(diffDaysThisYear)
}

function formatFuture(days: number): string {
  if (days === 0) return 'aniversário hoje 🎂'
  if (days === 1) return 'faz aniversário amanhã'
  if (days <= 30) return `faz aniversário em ${days} dias`

  // 30+ dias — escala em meses; usa 30.44 (média) pra reduzir distorção.
  const months = Math.round(days / 30.44)
  if (months <= 1) return 'faz aniversário em ~1 mês'
  if (months <= 11) return `faz aniversário em ${months} meses`
  return 'faz aniversário em ~1 ano'
}

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

function safeDateOnYear(year: number, month: number, day: number): Date {
  // 29/02 em ano não-bissexto — clamp pro último dia do mês.
  const lastDay = new Date(year, month + 1, 0).getDate()
  const d = new Date(year, month, Math.min(day, lastDay))
  d.setHours(0, 0, 0, 0)
  return d
}

export function normalize(str: string) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(n => n[0].toUpperCase())
    .join('')
}
