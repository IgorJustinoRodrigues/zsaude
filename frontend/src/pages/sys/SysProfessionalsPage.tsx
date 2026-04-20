// Visualização de profissionais CNES por município/unidade (MASTER).
//
// Seleciona o município → filtra as unidades daquele município → ao
// escolher uma unidade, busca live os profissionais CNES vinculados a ela.

import { useEffect, useMemo, useState } from 'react'
import { Search, Users, Stethoscope, Building2, AlertCircle } from 'lucide-react'
import { cnesAdminApi, type CnesProfessionalOption } from '../../api/cnes'
import { directoryApi, type FacilityDto, type MunicipalityDto } from '../../api/workContext'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { ComboBox, type ComboBoxOption } from '../../components/ui/ComboBox'
import { cn, normalize } from '../../lib/utils'

function formatCpf(digits: string): string {
  const d = (digits || '').replace(/\D/g, '').padEnd(11, '•').slice(0, 11)
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`
}

export function SysProfessionalsPage() {
  // Diretório completo carregado uma vez.
  const [muns, setMuns] = useState<MunicipalityDto[]>([])
  const [facilities, setFacilities] = useState<FacilityDto[]>([])
  const [loadingDir, setLoadingDir] = useState(true)

  // Seleção.
  const [munId, setMunId] = useState<string | null>(null)
  const [facId, setFacId] = useState<string | null>(null)

  // Lista de profissionais da unidade selecionada.
  const [professionals, setProfessionals] = useState<CnesProfessionalOption[]>([])
  const [loadingProfs, setLoadingProfs] = useState(false)
  const [cnesStatus, setCnesStatus] = useState<{ imported: boolean; lastImportAt: string | null } | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    Promise.all([directoryApi.listMunicipalities('all'), directoryApi.listFacilities(undefined, 'all')])
      .then(([m, f]) => { setMuns(m); setFacilities(f) })
      .catch(e => toast.error('Falha ao carregar diretório', e instanceof HttpError ? e.message : ''))
      .finally(() => setLoadingDir(false))
  }, [])

  // Ao trocar de município, zera a seleção de unidade.
  useEffect(() => { setFacId(null) }, [munId])

  // Checa se o município selecionado tem CNES importado.
  useEffect(() => {
    if (!munId) { setCnesStatus(null); return }
    let cancelled = false
    cnesAdminApi.importStatus(munId)
      .then(r => { if (!cancelled) setCnesStatus(r) })
      .catch(() => { if (!cancelled) setCnesStatus({ imported: false, lastImportAt: null }) })
    return () => { cancelled = true }
  }, [munId])

  // Quando escolhe a unidade, carrega profissionais (até 500 — raramente passa disso).
  useEffect(() => {
    if (!facId) { setProfessionals([]); return }
    let cancelled = false
    setLoadingProfs(true)
    cnesAdminApi.searchProfessionals({ facilityId: facId, limit: 500 })
      .then(r => { if (!cancelled) setProfessionals(r) })
      .catch(e => {
        if (!cancelled) toast.error('Falha ao carregar profissionais', e instanceof HttpError ? e.message : '')
      })
      .finally(() => { if (!cancelled) setLoadingProfs(false) })
    return () => { cancelled = true }
  }, [facId])

  const munOptions = useMemo<ComboBoxOption[]>(
    () => muns.map(m => ({ value: m.id, label: m.name, hint: `${m.state} · ${m.ibge}` })),
    [muns],
  )

  const facOptions = useMemo<ComboBoxOption[]>(
    () => facilities
      .filter(f => munId && f.municipalityId === munId)
      .map(f => ({
        value: f.id,
        label: f.shortName || f.name,
        hint: f.cnes ? `CNES ${f.cnes} · ${f.type}` : `sem CNES · ${f.type}`,
      })),
    [facilities, munId],
  )

  const chosenFac = useMemo(() => facilities.find(f => f.id === facId) ?? null, [facilities, facId])
  const chosenMun = useMemo(() => muns.find(m => m.id === munId) ?? null, [muns, munId])

  // Busca local na lista já carregada.
  const filtered = useMemo(() => {
    const q = normalize(search.trim())
    if (!q) return professionals
    return professionals.filter(p =>
      normalize(p.nome).includes(q)
      || p.cpf.includes(q.replace(/\D/g, ''))
      || p.cboId.includes(q),
    )
  }, [professionals, search])

  // Agrega por profissional pra mostrar todos os CBOs de cada um juntos.
  const grouped = useMemo(() => {
    const map = new Map<string, {
      cnesProfessionalId: string
      cpf: string
      nome: string
      status: string
      cbos: { cboId: string; cboDescription: string }[]
    }>()
    for (const p of filtered) {
      const cur = map.get(p.cnesProfessionalId)
      if (cur) {
        cur.cbos.push({ cboId: p.cboId, cboDescription: p.cboDescription })
      } else {
        map.set(p.cnesProfessionalId, {
          cnesProfessionalId: p.cnesProfessionalId,
          cpf: p.cpf,
          nome: p.nome,
          status: p.status,
          cbos: [{ cboId: p.cboId, cboDescription: p.cboDescription }],
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [filtered])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Users size={20} className="text-violet-500" />
          Profissionais CNES
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Escolha o município e a unidade para ver os profissionais importados do CNES.
        </p>
      </div>

      {/* Seleção */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
            Município
          </label>
          <ComboBox
            value={munId}
            onChange={setMunId}
            disabled={loadingDir}
            placeholder={loadingDir ? 'Carregando...' : 'Selecione o município'}
            options={munOptions}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
            Unidade
          </label>
          <ComboBox
            value={facId}
            onChange={setFacId}
            disabled={!munId}
            placeholder={munId ? 'Selecione a unidade' : 'Escolha primeiro o município'}
            options={facOptions}
          />
          {chosenFac && !chosenFac.cnes && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
              <AlertCircle size={10} />
              Esta unidade não tem CNES vinculado — sem profissionais.
            </p>
          )}
        </div>
      </div>

      {/* Banner de CNES não importado */}
      {munId && cnesStatus && !cnesStatus.imported && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/30 text-sm text-amber-800 dark:text-amber-300">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>
            <strong>{chosenMun?.name}</strong> ainda não tem CNES importado. Importe em{' '}
            <span className="font-mono">Importações → CNES</span> para visualizar os profissionais.
          </span>
        </div>
      )}

      {/* Lista */}
      {facId && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filtrar por nome, CPF ou CBO..."
                className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-violet-400 text-slate-800 dark:text-slate-200"
              />
            </div>
            <p className="text-xs text-slate-500 shrink-0">
              {grouped.length} profissional{grouped.length === 1 ? '' : 'is'}{filtered.length !== professionals.length ? ` (de ${professionals.length})` : ''}
            </p>
          </div>

          {loadingProfs ? (
            <div className="flex items-center justify-center py-16">
              <svg className="animate-spin w-5 h-5 text-violet-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            </div>
          ) : grouped.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-400">
              <Stethoscope size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">
                {professionals.length === 0
                  ? 'Nenhum profissional vinculado a esta unidade no CNES.'
                  : 'Nenhum profissional combina com o filtro.'}
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
              {grouped.map(p => (
                <div key={p.cnesProfessionalId}
                  className="px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {p.nome}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                        CPF {formatCpf(p.cpf)}
                      </p>
                    </div>
                    <span className={cn(
                      'text-[10px] font-bold px-2 py-0.5 rounded border shrink-0',
                      p.status.toLowerCase() === 'ativo'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900'
                        : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
                    )}>
                      {p.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {p.cbos.map(c => (
                      <span key={c.cboId}
                        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">CBO {c.cboId}</span>
                        <span className="text-slate-400">·</span>
                        <span>{c.cboDescription || '—'}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Estado vazio inicial */}
      {!facId && !loadingDir && (
        <div className="text-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-400">
          <Building2 size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">Selecione município e unidade para ver os profissionais.</p>
        </div>
      )}
    </div>
  )
}
