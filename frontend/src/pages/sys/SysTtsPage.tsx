// Tela MASTER do TTS. Aqui o admin:
//  - Salva/testa a chave do provedor (ElevenLabs / Google)
//  - Define a voz padrão do sistema (provider ativo fica implícito)
//  - Liga/desliga vozes do catálogo (pra aparecer ou não nos seletores)
//  - Pré-escuta antes de escolher

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle, Check, Ear, Eye, EyeOff, Key, Loader2, Play, Save, Star,
  X as XIcon,
} from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { HttpError } from '../../api/client'
import {
  ttsAdminApi, type TtsProvider, type TtsVoice, type ProviderKeyRead,
  type ActiveProviderInfo,
} from '../../api/tts'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'

export function SysTtsPage() {
  const [active, setActive] = useState<ActiveProviderInfo | null>(null)
  const [voices, setVoices] = useState<TtsVoice[]>([])
  const [keys, setKeys] = useState<Record<TtsProvider, ProviderKeyRead | null>>({
    elevenlabs: null,
    google: null,
  })
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      const [a, v, k11, kg] = await Promise.all([
        ttsAdminApi.getActiveProvider(),
        ttsAdminApi.listVoices(),
        ttsAdminApi.getKey('elevenlabs').catch(() => null),
        ttsAdminApi.getKey('google').catch(() => null),
      ])
      setActive(a)
      setVoices(v)
      setKeys({ elevenlabs: k11, google: kg })
    } catch (err) {
      if (err instanceof HttpError) toast.error('TTS', err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  if (loading) {
    return <div className="py-20 text-center text-sm text-muted-foreground">Carregando…</div>
  }

  return (
    <div>
      <PageHeader
        title="Text-to-Speech"
        subtitle="Voz do painel e do totem. Admin escolhe provedor (ElevenLabs / Google) e voz padrão — município e unidade sobrescrevem se precisar."
      />

      <div className="space-y-8">
        {/* ── Provedor ativo ──────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-semibold mb-3">Provedor ativo</h2>
          <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
            {active?.provider ? (
              <>
                <div className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center',
                  active.hasKey
                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
                    : 'bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400',
                )}>
                  {active.hasKey ? <Check size={18} /> : <AlertCircle size={18} />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">
                    {active.provider === 'elevenlabs' ? 'ElevenLabs' : 'Google Cloud TTS'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {active.hasKey
                      ? 'Credencial configurada e voz padrão definida.'
                      : 'Falta configurar credencial abaixo — TTS não vai funcionar até lá.'}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-slate-200 dark:bg-slate-800 text-slate-500">
                  <AlertCircle size={18} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">Nenhuma voz padrão</p>
                  <p className="text-xs text-muted-foreground">
                    Escolha uma voz abaixo com o botão "Definir padrão" pra ativar o TTS globalmente.
                  </p>
                </div>
              </>
            )}
          </div>
        </section>

        {/* ── Credenciais ────────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-semibold mb-3">Credenciais</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ProviderKeyCard
              provider="elevenlabs"
              label="ElevenLabs"
              description="Qualidade superior, vozes brasileiras nativas. Recomendado."
              current={keys.elevenlabs}
              onChanged={reload}
            />
            <ProviderKeyCard
              provider="google"
              label="Google Cloud TTS"
              description="Barato, múltiplas línguas. Suporte básico."
              current={keys.google}
              onChanged={reload}
            />
          </div>
        </section>

        {/* ── Vozes ──────────────────────────────────────────── */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold">Vozes disponíveis</h2>
            <span className="text-xs text-muted-foreground">
              {voices.filter(v => v.availableForSelection).length} de {voices.length} liberadas
            </span>
          </div>
          <ul className="space-y-2">
            {voices.map(v => (
              <VoiceRow
                key={v.id}
                voice={v}
                onChanged={reload}
              />
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

// ─── Credencial do provedor ──────────────────────────────────────────────

function ProviderKeyCard({
  provider, label, description, current, onChanged,
}: {
  provider: TtsProvider
  label: string
  description: string
  current: ProviderKeyRead | null
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(!current)
  const [apiKey, setApiKey] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!apiKey.trim()) return
    setBusy(true)
    try {
      await ttsAdminApi.upsertKey(provider, apiKey.trim())
      toast.success('Credencial salva')
      setApiKey('')
      setEditing(false)
      onChanged()
    } catch (err) {
      if (err instanceof HttpError) toast.error('Erro', err.message)
    } finally { setBusy(false) }
  }

  async function test() {
    if (!apiKey.trim()) return
    setBusy(true)
    try {
      const { ok } = await ttsAdminApi.testKey(provider, apiKey.trim())
      if (ok) toast.success('Credencial válida')
      else toast.error('Credencial inválida')
    } catch (err) {
      if (err instanceof HttpError) toast.error('Erro', err.message)
    } finally { setBusy(false) }
  }

  async function remove() {
    setBusy(true)
    try {
      await ttsAdminApi.deleteKey(provider)
      toast.success('Credencial removida')
      onChanged()
    } catch (err) {
      if (err instanceof HttpError) toast.error('Erro', err.message)
    } finally { setBusy(false) }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-400 flex items-center justify-center shrink-0">
          <Key size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{label}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
        </div>
        {current && !editing && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 text-[10px] font-semibold uppercase tracking-wider">
            <Check size={10} /> Ativa
          </span>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={provider === 'elevenlabs' ? 'sk_...' : 'AIza... ou JSON'}
              className="w-full px-3 py-2 pr-10 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              type="button"
              onClick={() => setShow(s => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={test}
              disabled={busy || !apiKey.trim()}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              Testar
            </button>
            <button
              onClick={save}
              disabled={busy || !apiKey.trim()}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold disabled:opacity-50"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Salvar
            </button>
            {current && (
              <button
                onClick={() => { setEditing(false); setApiKey('') }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      ) : current ? (
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-muted px-2 py-1 rounded">{current.apiKeyPreview}</code>
          <button
            onClick={() => setEditing(true)}
            className="px-2.5 py-1 rounded-lg border border-border text-[11px] font-medium hover:bg-muted"
          >
            Trocar
          </button>
          <button
            onClick={remove}
            disabled={busy}
            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
            title="Remover credencial"
          >
            <XIcon size={14} />
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">Clique em Testar/Salvar acima pra configurar.</p>
      )}
    </div>
  )
}

// ─── Linha de voz (catálogo) ──────────────────────────────────────────────

function VoiceRow({ voice, onChanged }: { voice: TtsVoice; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  async function toggleAvailable() {
    setBusy(true)
    try {
      await ttsAdminApi.updateVoice(voice.id, {
        availableForSelection: !voice.availableForSelection,
      })
      onChanged()
    } catch (err) {
      if (err instanceof HttpError) toast.error('Erro', err.message)
    } finally { setBusy(false) }
  }

  async function setDefault() {
    setBusy(true)
    try {
      await ttsAdminApi.setDefaultVoice(voice.id)
      toast.success(`${voice.name} é a voz padrão agora`)
      onChanged()
    } catch (err) {
      if (err instanceof HttpError) toast.error('Erro', err.message)
    } finally { setBusy(false) }
  }

  async function preview() {
    if (previewing) {
      audioRef.current?.pause()
      setPreviewing(false)
      return
    }
    setBusy(true)
    try {
      const out = await ttsAdminApi.previewVoice(voice.id)
      const url = out.audios[0]?.url
      if (!url) return
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => setPreviewing(false)
      audio.onerror = () => { setPreviewing(false); toast.error('Falha ao tocar amostra') }
      await audio.play()
      setPreviewing(true)
    } catch (err) {
      if (err instanceof HttpError) toast.error('Preview', err.message)
    } finally { setBusy(false) }
  }

  // Uma voz é default quando o active provider bate com o dela + ID casa.
  // Sinalizamos via badge no componente pai (não temos esse dado aqui
  // direto — o padrão é identificado a partir de ActiveProviderInfo).
  // Por simplicidade mostramos "Padrão" quando ela é a única com is_default true.
  // (O backend garante unicidade via índice parcial.)

  return (
    <li className={cn(
      'rounded-xl border bg-card p-3 flex items-center gap-3',
      voice.availableForSelection
        ? 'border-border'
        : 'border-dashed border-slate-200 dark:border-slate-800 opacity-60',
    )}>
      <div className={cn(
        'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
        voice.gender === 'female'
          ? 'bg-pink-100 dark:bg-pink-950 text-pink-700 dark:text-pink-400'
          : 'bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-400',
      )}>
        <Ear size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate flex items-center gap-2">
          {voice.name}
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {voice.provider}
          </span>
          {voice.gender && (
            <span className="text-[10px] text-muted-foreground">
              {voice.gender === 'female' ? '♀' : voice.gender === 'male' ? '♂' : ''}
            </span>
          )}
        </p>
        <p className="text-[11px] text-muted-foreground truncate">
          {voice.description || '—'}
        </p>
      </div>

      {/* Velocidade (fixa por voz — ajustada por curadoria do sistema) */}
      <span className="text-[11px] font-mono tabular-nums text-muted-foreground shrink-0">
        {voice.speed.toFixed(2)}x
      </span>

      <button
        onClick={preview}
        disabled={busy}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border text-xs font-medium hover:bg-muted disabled:opacity-50"
      >
        {previewing ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
        Ouvir
      </button>

      <button
        onClick={toggleAvailable}
        disabled={busy}
        className={cn(
          'px-2.5 py-1 rounded-lg text-xs font-medium',
          voice.availableForSelection
            ? 'border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
            : 'border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800',
        )}
      >
        {voice.availableForSelection ? 'Liberada' : 'Oculta'}
      </button>

      <button
        onClick={setDefault}
        disabled={busy || !voice.availableForSelection}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold disabled:opacity-50"
        title="Torna esta voz o padrão global (provider ativo será o dela)"
      >
        <Star size={12} /> Definir padrão
      </button>
    </li>
  )
}
