import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, MapPin, Pencil, Check, X, Plus, Trash2, Crosshair, Hexagon, Users,
} from 'lucide-react'
import { sysApi, type MunicipalityAdminDetail, type NeighborhoodInput } from '../../api/sys'
import { ibgeApi, type IbgeEstado, type IbgeMunicipio } from '../../api/ibge'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { LocationMap, type LatLng, type MapMode, type MapLayer } from '../../components/shared/LocationMap'
import { cn } from '../../lib/utils'

// ─── Tipos internos ────────────────────────────────────────────────────────

interface HoodDraft {
  tempId: string         // chave de lista
  id?: string            // UUID do backend (se já existente)
  name: string
  population: string     // input de texto; converte ao salvar
  latitude: number | null
  longitude: number | null
  territory: LatLng[] | null
}

function newHood(initial: Partial<HoodDraft> = {}): HoodDraft {
  return {
    tempId: Math.random().toString(36).slice(2),
    name: '',
    population: '',
    latitude: null,
    longitude: null,
    territory: null,
    ...initial,
  }
}

// ─── Componente principal ──────────────────────────────────────────────────

export function SysMunicipalityFormPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id

  // Identificação
  const [uf, setUf] = useState('GO')
  const [ibge, setIbge] = useState('')
  const [name, setName] = useState('')
  const [archived, setArchived] = useState(false)

  // Estados IBGE (combobox)
  const [estados, setEstados] = useState<IbgeEstado[]>([])
  const [municipios, setMunicipios] = useState<IbgeMunicipio[]>([])
  const [munSearch, setMunSearch] = useState('')
  const [munMenuOpen, setMunMenuOpen] = useState(false)

  // Demografia
  const [population, setPopulation] = useState('')

  // Mapa: município
  const [center, setCenter] = useState<LatLng | null>(null)
  const [territory, setTerritory] = useState<LatLng[] | null>(null)

  // Bairros
  const [hoods, setHoods] = useState<HoodDraft[]>([])
  const [editingHoodId, setEditingHoodId] = useState<string | null>(null)

  // Modo do mapa
  const [mapMode, setMapMode] = useState<MapMode>('idle')
  /** Alvo do modo — 'mun' = centro/território do município; 'hood:<tempId>' = bairro específico. */
  const [mapTarget, setMapTarget] = useState<string>('mun')

  // Loading / save
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // ── Carrega estados ────────────────────────────────────────────────────
  useEffect(() => {
    ibgeApi.listEstados().then(setEstados).catch(() => setEstados([]))
  }, [])

  // ── Carrega municípios ao trocar UF (modo create) ──────────────────────
  useEffect(() => {
    if (isEdit) return
    ibgeApi.listMunicipios(uf).then(setMunicipios).catch(() => setMunicipios([]))
  }, [uf, isEdit])

  // ── Aplica um MunicipalityAdminDetail no state (load inicial ou pós-save) ──
  const applyDetail = (m: MunicipalityAdminDetail) => {
    setUf(m.state); setIbge(m.ibge); setName(m.name); setArchived(m.archived)
    setPopulation(m.population != null ? String(m.population) : '')
    if (m.centerLatitude != null && m.centerLongitude != null) {
      setCenter([Number(m.centerLatitude), Number(m.centerLongitude)])
    } else {
      setCenter(null)
    }
    setTerritory(m.territory)
    setHoods((m.neighborhoods ?? []).map(h => newHood({
      id: h.id,
      name: h.name,
      population: h.population != null ? String(h.population) : '',
      latitude: h.latitude,
      longitude: h.longitude,
      territory: h.territory,
    })))
  }

  // ── Modo edit: carrega detail ──────────────────────────────────────────
  useEffect(() => {
    if (!isEdit || !id) return
    sysApi.getMunicipality(id)
      .then(applyDetail)
      .catch(e => toast.error('Erro ao carregar', e instanceof HttpError ? e.message : ''))
      .finally(() => setLoading(false))
  }, [id, isEdit])

  const filteredMun = useMemo(() => {
    const q = munSearch.trim().toLowerCase()
    if (!q) return municipios.slice(0, 20)
    return municipios.filter(m => m.nome.toLowerCase().includes(q)).slice(0, 50)
  }, [munSearch, municipios])

  // ── Ações de bairros ───────────────────────────────────────────────────
  const addHood = () => setHoods(h => [...h, newHood()])
  const removeHood = (tempId: string) => setHoods(h => h.filter(x => x.tempId !== tempId))
  const updateHood = (tempId: string, patch: Partial<HoodDraft>) =>
    setHoods(h => h.map(x => x.tempId === tempId ? { ...x, ...patch } : x))

  // ── Handler do mapa: recebe mudanças conforme o alvo atual ─────────────
  const handlePoint = (p: LatLng | null) => {
    if (mapTarget === 'mun') setCenter(p)
    else if (mapTarget.startsWith('hood:')) {
      const tempId = mapTarget.slice(5)
      updateHood(tempId, { latitude: p?.[0] ?? null, longitude: p?.[1] ?? null })
    }
  }
  const handlePolygon = (poly: LatLng[] | null) => {
    if (mapTarget === 'mun') setTerritory(poly)
    else if (mapTarget.startsWith('hood:')) {
      const tempId = mapTarget.slice(5)
      updateHood(tempId, { territory: poly })
    }
  }

  const activePoint = useMemo<LatLng | null>(() => {
    if (mapTarget === 'mun') return center
    if (mapTarget.startsWith('hood:')) {
      const h = hoods.find(x => x.tempId === mapTarget.slice(5))
      return h && h.latitude != null && h.longitude != null ? [h.latitude, h.longitude] : null
    }
    return null
  }, [mapTarget, center, hoods])

  const activePolygon = useMemo<LatLng[] | null>(() => {
    if (mapTarget === 'mun') return territory
    if (mapTarget.startsWith('hood:')) {
      const h = hoods.find(x => x.tempId === mapTarget.slice(5))
      return h?.territory ?? null
    }
    return null
  }, [mapTarget, territory, hoods])

  // Camadas secundárias (tudo que não é o alvo atual)
  const extraLayers = useMemo<MapLayer[]>(() => {
    const out: MapLayer[] = []
    if (mapTarget !== 'mun' && center) {
      out.push({ point: center, polygon: territory ?? undefined, label: name || 'Município', color: '#8b5cf6' })
    }
    for (const h of hoods) {
      if (mapTarget === `hood:${h.tempId}`) continue
      if (h.latitude != null && h.longitude != null) {
        out.push({ point: [h.latitude, h.longitude], polygon: h.territory ?? undefined, label: h.name || 'Bairro', color: '#0ea5e9' })
      } else if (h.territory) {
        out.push({ polygon: h.territory, label: h.name || 'Bairro', color: '#0ea5e9' })
      }
    }
    return out
  }, [mapTarget, center, territory, hoods, name])

  // ── Fallback de centro do mapa com coords aproximadas da UF ────────────
  const fallbackCenter = useMemo<[number, number, number]>(() => {
    const UF_COORDS: Record<string, [number, number, number]> = {
      AC: [-9.02, -70.81, 6], AL: [-9.57, -36.78, 7], AP: [0.90, -52.00, 6],
      AM: [-3.41, -65.86, 5], BA: [-12.97, -41.27, 5], CE: [-5.20, -39.53, 6],
      DF: [-15.83, -47.86, 9], ES: [-19.19, -40.34, 7], GO: [-15.82, -49.83, 6],
      MA: [-5.42, -45.44, 6], MT: [-12.64, -55.42, 5], MS: [-20.51, -54.54, 6],
      MG: [-18.51, -44.55, 6], PA: [-4.78, -52.66, 5], PB: [-7.12, -36.72, 7],
      PR: [-24.49, -51.77, 6], PE: [-8.40, -37.55, 7], PI: [-7.72, -42.73, 6],
      RJ: [-22.25, -42.66, 7], RN: [-5.79, -36.37, 7], RS: [-29.68, -53.80, 6],
      RO: [-10.83, -63.34, 6], RR: [2.74, -61.66, 6], SC: [-27.24, -50.22, 6],
      SP: [-22.19, -48.79, 6], SE: [-10.57, -37.39, 7], TO: [-10.18, -48.33, 6],
    }
    return UF_COORDS[uf] ?? [-15.78, -47.92, 5]
  }, [uf])

  // ── Validação e submit ─────────────────────────────────────────────────
  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (name.trim().length < 2) e.name = 'Selecione um município.'
    if (!/^\d{6,7}$/.test(ibge)) e.ibge = 'Selecione um município na lista.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const toNullableInt = (v: string): number | null => {
    const n = parseInt(v, 10)
    return Number.isFinite(n) ? n : null
  }

  const buildPayload = () => ({
    name,
    state: uf,
    ibge,
    population: toNullableInt(population),
    centerLatitude: center?.[0] ?? null,
    centerLongitude: center?.[1] ?? null,
    territory: territory && territory.length >= 3 ? territory : null,
    neighborhoods: hoods
      .filter(h => h.name.trim().length >= 2)
      .map<NeighborhoodInput>(h => ({
        id: h.id,
        name: h.name.trim(),
        population: toNullableInt(h.population),
        latitude: h.latitude,
        longitude: h.longitude,
        territory: h.territory && h.territory.length >= 3 ? h.territory : null,
      })),
  })

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!validate()) {
      toast.warning('Revise os campos', 'Existem erros de validação.')
      return
    }
    setSaving(true)
    try {
      const payload = buildPayload()
      if (isEdit && id) {
        const { ibge: _ibge, ...patch } = payload  // IBGE imutável
        const updated = await sysApi.updateMunicipality(id, patch)
        applyDetail(updated)  // sincroniza IDs novos dos bairros recém-criados
        toast.success('Município atualizado', updated.name)
      } else {
        const created = await sysApi.createMunicipality(payload)
        applyDetail(created)
        toast.success('Município criado', `${created.name} — schema ${created.schemaName}`)
        // Troca a URL para a de edição (F5 não recarrega tela de "novo")
        // mas mantém o usuário na tela de edição para continuar ajustando.
        navigate(`/sys/municipios/${created.id}/editar`, { replace: true })
      }
    } catch (e) {
      toast.error(isEdit ? 'Falha ao salvar' : 'Falha ao criar', e instanceof HttpError ? e.message : '')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <svg className="animate-spin w-5 h-5 text-violet-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      </div>
    )
  }

  const targetLabel = mapTarget === 'mun'
    ? `Município: ${name || '(novo)'}`
    : `Bairro: ${hoods.find(h => h.tempId === mapTarget.slice(5))?.name || '(sem nome)'}`

  return (
    <form onSubmit={handleSubmit} className="max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate('/sys/municipios')}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            {isEdit ? 'Editar município' : 'Novo município'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isEdit
              ? (archived ? 'Município arquivado.' : 'Código IBGE é imutável.')
              : 'Selecione a UF e o município para preencher o código IBGE automaticamente.'}
          </p>
        </div>
      </div>

      {/* 1. Identificação */}
      <Section title="1. Identificação">
        <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr_160px] gap-4">
          <Field label="UF *" error={errors.state}>
            <select
              value={uf}
              onChange={e => { setUf(e.target.value); if (!isEdit) { setName(''); setIbge(''); setMunSearch('') } }}
              disabled={isEdit}
              className={cn(inputCls(false), isEdit && 'bg-slate-50 dark:bg-slate-800 cursor-not-allowed')}
            >
              {estados.map(e => <option key={e.sigla} value={e.sigla}>{e.sigla}</option>)}
              {estados.length === 0 && <option value={uf}>{uf}</option>}
            </select>
          </Field>

          <Field label="Município *" error={errors.name}>
            {isEdit ? (
              <input value={name} readOnly className={cn(inputCls(false), 'bg-slate-50 dark:bg-slate-800')} />
            ) : (
              <div className="relative">
                <input
                  value={munSearch || name}
                  onChange={e => { setMunSearch(e.target.value); setMunMenuOpen(true) }}
                  onFocus={() => setMunMenuOpen(true)}
                  onBlur={() => setTimeout(() => setMunMenuOpen(false), 150)}
                  placeholder="Digite para buscar..."
                  className={inputCls(!!errors.name)}
                />
                {munMenuOpen && filteredMun.length > 0 && (
                  <div className="absolute z-20 top-full mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {filteredMun.map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setName(m.nome)
                          setIbge(String(m.id))
                          setMunSearch('')
                          setMunMenuOpen(false)
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between"
                      >
                        <span>{m.nome}</span>
                        <code className="text-[11px] text-slate-400">{m.id}</code>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Field>

          <Field label="Código IBGE" hint={isEdit ? 'Imutável' : 'Automático'}>
            <div className="relative">
              <MapPin size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={ibge}
                readOnly
                placeholder="—"
                className={cn(inputCls(!!errors.ibge), 'pl-8 bg-slate-50 dark:bg-slate-800 cursor-not-allowed')}
              />
            </div>
            {errors.ibge && <p className="text-[11px] text-red-500 mt-1">{errors.ibge}</p>}
          </Field>
        </div>
      </Section>

      {/* 2. Demografia */}
      <Section title="2. Demografia">
        <Field label="População total" hint="Estimativa atual, opcional">
          <div className="relative max-w-xs">
            <Users size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={population}
              onChange={e => setPopulation(e.target.value.replace(/\D/g, ''))}
              placeholder="Ex: 1500000"
              className={cn(inputCls(false), 'pl-8')}
            />
          </div>
        </Field>
      </Section>

      {/* 3. Mapa */}
      <Section
        title="3. Território"
        subtitle="Marque o ponto central e/ou desenhe o polígono do território. Use o seletor abaixo para alternar entre o município e cada bairro."
      >
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {/* Alvo */}
          <select
            value={mapTarget}
            onChange={e => { setMapTarget(e.target.value); setMapMode('idle') }}
            className={inputCls(false) + ' max-w-xs'}
          >
            <option value="mun">
              Município: {name || '(novo)'}
              {center ? ' 📍' : ''}{territory && territory.length >= 3 ? ' 🗺️' : ''}
            </option>
            {hoods.filter(h => h.name.trim()).map(h => {
              const marks = `${h.latitude != null ? ' 📍' : ''}${h.territory && h.territory.length >= 3 ? ' 🗺️' : ''}`
              return (
                <option key={h.tempId} value={`hood:${h.tempId}`}>
                  Bairro: {h.name}{marks}
                </option>
              )
            })}
          </select>

          <div className="flex gap-1 ml-auto flex-wrap">
            <ModeBtn active={mapMode === 'point'} onClick={() => setMapMode(mapMode === 'point' ? 'idle' : 'point')}>
              <Crosshair size={13} /> Marcar ponto
            </ModeBtn>
            <ModeBtn active={mapMode === 'polygon'} onClick={() => setMapMode(mapMode === 'polygon' ? 'idle' : 'polygon')}>
              <Hexagon size={13} /> Desenhar território
            </ModeBtn>
            {mapMode === 'polygon' && activePolygon && activePolygon.length >= 3 && (
              <button type="button" onClick={() => setMapMode('idle')}
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium">
                <Check size={13} /> Finalizar desenho
              </button>
            )}
            {mapMode === 'polygon' && activePolygon && activePolygon.length > 0 && (
              <button type="button" onClick={() => handlePolygon(null)}
                className="text-xs px-3 py-1.5 rounded-md border border-red-200 text-red-600 hover:bg-red-50">
                Limpar desenho
              </button>
            )}
            {mapMode === 'point' && activePoint && (
              <button type="button" onClick={() => handlePoint(null)}
                className="text-xs px-3 py-1.5 rounded-md border border-red-200 text-red-600 hover:bg-red-50">
                Limpar ponto
              </button>
            )}
          </div>
        </div>

        <div className="p-3 mb-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
          <p>
            Editando: <strong>{targetLabel}</strong>
            {activePoint && <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-medium">✓ ponto</span>}
            {activePolygon && activePolygon.length >= 3 && <span className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-medium">✓ território</span>}
          </p>
          {mapMode === 'point' && <p className="text-sky-700 dark:text-sky-400">→ Clique no mapa para marcar o ponto. Arraste o pino para ajustar.</p>}
          {mapMode === 'polygon' && (
            <p className="text-violet-700 dark:text-violet-400">
              → Clique no mapa para adicionar vértices. Arraste um vértice para ajuste fino; duplo-clique remove. Clique em <strong>"Finalizar desenho"</strong> quando tiver ≥ 3 vértices.
            </p>
          )}
          {mapMode === 'idle' && (
            <p className="text-slate-500">
              Os dados de cada alvo ficam salvos no formulário ao marcar/desenhar — pode trocar entre município e bairros sem perder. Use o botão <strong>Salvar</strong> no fim do formulário para persistir no banco.
            </p>
          )}
        </div>

        <LocationMap
          fallbackCenter={fallbackCenter}
          point={activePoint}
          polygon={activePolygon}
          extraLayers={extraLayers}
          mode={mapMode}
          onPointChange={handlePoint}
          onPolygonChange={handlePolygon}
          height="450px"
        />
      </Section>

      {/* 4. Bairros */}
      <Section title="4. Bairros">
        <div className="space-y-2 mb-3">
          {hoods.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Nenhum bairro cadastrado.</p>
          )}
          {hoods.map(h => (
            <HoodRow
              key={h.tempId}
              hood={h}
              editing={editingHoodId === h.tempId}
              onStartEdit={() => setEditingHoodId(h.tempId)}
              onStopEdit={() => setEditingHoodId(null)}
              onChange={patch => updateHood(h.tempId, patch)}
              onRemove={() => removeHood(h.tempId)}
              onTargetInMap={() => { setMapTarget(`hood:${h.tempId}`); setMapMode('idle') }}
            />
          ))}
        </div>
        <button type="button" onClick={addHood}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 border border-dashed border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
          <Plus size={13} /> Adicionar bairro
        </button>
      </Section>

      {/* Ações */}
      <div className="flex items-center justify-end gap-3">
        <button type="button" onClick={() => navigate('/sys/municipios')} disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          Cancelar
        </button>
        <button type="submit" disabled={saving}
          className="px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors disabled:opacity-60">
          {saving ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar município'}
        </button>
      </div>
    </form>
  )
}

// ─── Subcomponentes ────────────────────────────────────────────────────────

function HoodRow({
  hood, editing, onStartEdit, onStopEdit, onChange, onRemove, onTargetInMap,
}: {
  hood: HoodDraft
  editing: boolean
  onStartEdit: () => void
  onStopEdit: () => void
  onChange: (patch: Partial<HoodDraft>) => void
  onRemove: () => void
  onTargetInMap: () => void
}) {
  const hasPoint = hood.latitude != null && hood.longitude != null
  const hasPoly = !!hood.territory && hood.territory.length >= 3

  if (editing) {
    return (
      <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-2">
          <input
            autoFocus
            value={hood.name}
            onChange={e => onChange({ name: e.target.value })}
            placeholder="Nome do bairro"
            className={inputCls(false)}
          />
          <input
            value={hood.population}
            onChange={e => onChange({ population: e.target.value.replace(/\D/g, '') })}
            placeholder="População"
            className={inputCls(false)}
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onStopEdit}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-emerald-600 hover:bg-emerald-50">
            <Check size={13} /> Feito
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{hood.name || <span className="text-muted-foreground italic">(sem nome)</span>}</p>
        <p className="text-xs text-muted-foreground">
          {hood.population && <>{Number(hood.population).toLocaleString('pt-BR')} hab · </>}
          {hasPoint ? <span className="text-emerald-600">📍 ponto</span> : <span className="text-slate-400">sem ponto</span>}
          {' · '}
          {hasPoly ? <span className="text-emerald-600">🗺 território</span> : <span className="text-slate-400">sem território</span>}
        </p>
      </div>
      <button type="button" onClick={onTargetInMap} title="Focar no mapa"
        className="p-1.5 rounded-md text-slate-500 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/40 transition-colors">
        <MapPin size={14} />
      </button>
      <button type="button" onClick={onStartEdit} title="Editar"
        className="p-1.5 rounded-md text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
        <Pencil size={14} />
      </button>
      <button type="button" onClick={onRemove} title="Remover"
        className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors">
        <Trash2 size={14} />
      </button>
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function ModeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
        active
          ? 'bg-violet-600 text-white border-violet-600'
          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300',
      )}
    >
      {children}
    </button>
  )
}

function inputCls(hasError: boolean) {
  return (
    'w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border rounded-lg outline-none transition-colors ' +
    'text-slate-800 dark:text-slate-200 placeholder-slate-400 ' +
    (hasError ? 'border-red-400 focus:border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-violet-400')
  )
}

function Field({ label, error, hint, children }: {
  label: string; error?: string; hint?: string; children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
        {label}
        {hint && <span className="ml-1.5 text-[10px] text-slate-400">({hint})</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-red-500">{error}</p>}
    </div>
  )
}
