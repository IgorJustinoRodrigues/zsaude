// Tela 3 do MASTER: configuração do módulo Clínico.
// O módulo tem 4 campos bem pequenos, então cabe tudo numa única
// seção (``geral``). Seções futuras (ex.: triagem por Manchester)
// entram como novas entradas em SECTIONS_BY_MODULE.

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Loader2, Save, Stethoscope, Users } from 'lucide-react'
import {
  clnApi,
  type ClnConfig,
  type EffectiveClnConfig,
} from '../../api/cln'
import { sectorsAdminApi, type Sector } from '../../api/sectors'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'
import { ScopeHeader, useScopeHeader } from './SysModulesConfigPages'

type Scope = 'municipality' | 'facility'

export function SysMunicipalityClnSectionPage() {
  return <ClnSectionPage scope="municipality" />
}

export function SysFacilityClnSectionPage() {
  return <ClnSectionPage scope="facility" />
}

function ClnSectionPage({ scope }: { scope: Scope }) {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { title, subtitle, loading: loadingHeader } = useScopeHeader(scope, id)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rawConfig, setRawConfig] = useState<ClnConfig | null>(null)
  const [effective, setEffective] = useState<EffectiveClnConfig | null>(null)
  const [parentEffective, setParentEffective] = useState<EffectiveClnConfig | null>(null)
  const [sectors, setSectors] = useState<Sector[]>([])

  // Estado local editável
  const [enabled, setEnabled] = useState(false)
  const [triagemEnabled, setTriagemEnabled] = useState(true)
  const [triagemSector, setTriagemSector] = useState<string | null>(null)
  const [atendimentoSector, setAtendimentoSector] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      let rawCfg: ClnConfig | null
      let eff: EffectiveClnConfig
      let sectorsList: Sector[] = []
      if (scope === 'municipality') {
        const raw = await clnApi.admin.getMunicipalityConfig(id)
        rawCfg = raw.config
        eff = await clnApi.effectiveConfig({ municipalityId: id })
        sectorsList = await sectorsAdminApi.listMunicipality(id)
      } else {
        const raw = await clnApi.admin.getFacilityConfig(id)
        rawCfg = raw.config
        eff = await clnApi.effectiveConfig({ facilityId: id })
        sectorsList = await sectorsAdminApi.listFacility(id)
      }
      setRawConfig(rawCfg)
      setEffective(eff)
      setParentEffective(null)
      setSectors(sectorsList)
      // Popula estado local: prefere o raw (explícito neste escopo); cai no effective.
      setEnabled(rawCfg?.enabled ?? eff.enabled)
      setTriagemEnabled(rawCfg?.triagemEnabled ?? eff.triagemEnabled)
      setTriagemSector(rawCfg?.triagemSectorName ?? eff.triagemSectorName ?? null)
      setAtendimentoSector(rawCfg?.atendimentoSectorName ?? eff.atendimentoSectorName ?? null)
    } catch (err) {
      if (err instanceof HttpError) toast.error('Config CLN', err.message)
    } finally {
      setLoading(false)
    }
  }, [id, scope])

  useEffect(() => { void load() }, [load])

  async function handleSave() {
    if (!id) return
    setSaving(true)
    try {
      const payload: ClnConfig = {
        enabled,
        triagemEnabled,
        triagemSectorName: triagemEnabled ? (triagemSector || null) : null,
        atendimentoSectorName: atendimentoSector || null,
      }
      if (scope === 'municipality') {
        await clnApi.admin.updateMunicipalityConfig(id, { config: payload })
      } else {
        await clnApi.admin.updateFacilityConfig(id, { config: payload })
      }
      toast.success('Config salva')
      void load()
    } catch (err) {
      if (err instanceof HttpError) toast.error('Salvar', err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    if (!id) return
    setSaving(true)
    try {
      if (scope === 'municipality') {
        await clnApi.admin.updateMunicipalityConfig(id, { config: null })
      } else {
        await clnApi.admin.updateFacilityConfig(id, { config: null })
      }
      toast.success(
        scope === 'municipality' ? 'Voltou aos defaults' : 'Voltou a herdar do município',
      )
      void load()
    } catch (err) {
      if (err instanceof HttpError) toast.error('Limpar', err.message)
    } finally {
      setSaving(false)
    }
  }

  const parentHint = (source: string | undefined, field: 'triagemEnabled' | 'triagemSectorName' | 'atendimentoSectorName' | 'enabled'): string | null => {
    if (scope !== 'facility' || !parentEffective) return null
    if (source === 'municipality') {
      const v = parentEffective[field]
      return v === null || v === undefined || v === false
        ? null
        : `herdado do município (${String(v)})`
    }
    if (source === 'default') return 'default do sistema'
    return null
  }

  if (loading || loadingHeader) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        <Loader2 size={20} className="animate-spin inline" />
      </div>
    )
  }

  const sectorOptions = sectors.filter(s => !s.archived)

  return (
    <div className="space-y-6">
      <ScopeHeader
        scope={scope}
        loading={false}
        title={title}
        subtitle={subtitle}
        breadcrumb={
          <span className="flex items-center gap-1 text-sky-600 font-medium">
            <Stethoscope size={11} /> Clínica · Configuração
          </span>
        }
      />

      <div className="bg-card border border-border rounded-xl p-5 space-y-5">
        <ToggleRow
          title="Módulo ativo"
          description="Desativado, nenhum ticket entra nas filas desta unidade."
          value={enabled}
          onChange={setEnabled}
          hint={parentHint(effective?.sources?.enabled, 'enabled')}
        />

        <ToggleRow
          title="Usar triagem antes do atendimento"
          description="Com triagem, o paciente passa por um setor prévio antes da consulta."
          value={triagemEnabled}
          onChange={setTriagemEnabled}
          disabled={!enabled}
          hint={parentHint(effective?.sources?.triagem_enabled, 'triagemEnabled')}
        />

        <SectorSelect
          label="Setor da triagem"
          description="Tickets encaminhados pra este setor aparecem na fila de Triagem do CLN."
          value={triagemSector}
          onChange={setTriagemSector}
          options={sectorOptions}
          disabled={!enabled || !triagemEnabled}
          hint={parentHint(effective?.sources?.triagem_sector_name, 'triagemSectorName')}
        />

        <SectorSelect
          label="Setor do atendimento"
          description="Tickets encaminhados pra este setor aparecem na fila de Atendimento do CLN."
          value={atendimentoSector}
          onChange={setAtendimentoSector}
          options={sectorOptions}
          disabled={!enabled}
          hint={parentHint(effective?.sources?.atendimento_sector_name, 'atendimentoSectorName')}
          required
        />
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted"
        >
          Voltar
        </button>
        <div className="flex items-center gap-2">
          {rawConfig && (
            <button
              onClick={handleClear}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
            >
              {scope === 'municipality' ? 'Limpar configuração' : 'Voltar a herdar do município'}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Subcomponentes ─────────────────────────────────────────────────────

function ToggleRow({
  title, description, value, onChange, disabled, hint,
}: {
  title: string
  description: string
  value: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  hint?: string | null
}) {
  return (
    <label className={cn(
      'flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-dashed border-border hover:bg-muted/40 transition-colors',
      disabled && 'opacity-50 cursor-not-allowed',
    )}>
      <input
        type="checkbox"
        checked={value}
        onChange={e => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-1 rounded border-border text-primary focus:ring-primary/40 w-4 h-4"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
        {hint && (
          <p className="text-[10px] italic text-slate-500 mt-1">{hint}</p>
        )}
      </div>
    </label>
  )
}

function SectorSelect({
  label, description, value, onChange, options, disabled, hint, required,
}: {
  label: string
  description: string
  value: string | null
  onChange: (v: string | null) => void
  options: Sector[]
  disabled?: boolean
  hint?: string | null
  required?: boolean
}) {
  return (
    <div className={cn('space-y-1.5', disabled && 'opacity-50')}>
      <div className="flex items-center gap-2">
        <Users size={13} className="text-muted-foreground" />
        <label className="text-sm font-semibold">
          {label}
          {required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground">{description}</p>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        disabled={disabled}
        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed"
      >
        <option value="">— selecione um setor —</option>
        {options.map(s => (
          <option key={s.id} value={s.name}>{s.name}</option>
        ))}
      </select>
      {hint && (
        <p className="text-[10px] italic text-slate-500 mt-0.5">{hint}</p>
      )}
    </div>
  )
}
