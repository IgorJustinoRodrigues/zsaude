import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Mail, Save, Trash2, Eye, FileCode2, FileText, Info, AlertCircle,
  CheckCircle2, Undo2,
} from 'lucide-react'
import {
  emailTemplatesApi,
  type EmailTemplate,
  type PreviewResponse,
  type TemplateCatalogEntry,
} from '../../api/emailTemplates'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'

type BodyTab = 'html' | 'text'

export function SysEmailTemplatesPage() {
  const [catalog, setCatalog] = useState<TemplateCatalogEntry[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [selectedCode, setSelectedCode] = useState<string | null>(null)

  useEffect(() => {
    setLoadingCatalog(true)
    emailTemplatesApi.catalog()
      .then(r => {
        setCatalog(r)
        if (r.length > 0) setSelectedCode(r[0].code)
      })
      .catch(() => toast.error('Falha ao carregar catálogo de templates'))
      .finally(() => setLoadingCatalog(false))
  }, [])

  const selected = useMemo(
    () => catalog.find(c => c.code === selectedCode) ?? null,
    [catalog, selectedCode],
  )

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Mail size={20} className="text-violet-500" />
          Templates de e-mail
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Personalize assunto e corpo dos e-mails enviados pelo sistema.
          Este escopo (padrão da plataforma) vale para todos os municípios,
          a menos que o ADMIN do município sobrescreva.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">
        {/* Sidebar: lista de códigos */}
        <aside className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {loadingCatalog ? (
            <div className="p-6 text-sm text-slate-400">Carregando…</div>
          ) : catalog.length === 0 ? (
            <div className="p-6 text-sm text-slate-400">Nenhum template registrado.</div>
          ) : (
            <ul>
              {catalog.map(item => (
                <li key={item.code}>
                  <button
                    onClick={() => setSelectedCode(item.code)}
                    className={cn(
                      'w-full text-left px-4 py-3 border-b border-slate-100 dark:border-slate-800 last:border-b-0 transition-colors',
                      selectedCode === item.code
                        ? 'bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-200',
                    )}
                  >
                    <p className="text-sm font-semibold">{item.label}</p>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">{item.code}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Editor */}
        {selected && <TemplateEditor entry={selected} key={selected.code} />}
      </div>
    </div>
  )
}

// ─── Editor ──────────────────────────────────────────────────────────────────

function TemplateEditor({ entry }: { entry: TemplateCatalogEntry }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [row, setRow] = useState<EmailTemplate | null>(null)
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [fromName, setFromName] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [tab, setTab] = useState<BodyTab>('html')
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [previewError, setPreviewError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const current = await emailTemplatesApi.getOverride(entry.code, 'system')
      setRow(current)
      if (current) {
        setSubject(current.subject)
        setBodyHtml(current.bodyHtml ?? '')
        setBodyText(current.bodyText ?? '')
        setFromName(current.fromName ?? '')
        setIsActive(current.isActive)
      } else {
        // Sem override: começa do que o sistema ENVIA hoje (fallback de
        // arquivo em app/templates/email/). Editor mostra o HTML completo
        // com CSS, o admin pode ajustar a partir dali.
        setSubject(entry.defaultSubject)
        setBodyHtml(entry.defaultBodyHtml ?? '')
        setBodyText(entry.defaultBodyText ?? '')
        setFromName('')
        setIsActive(true)
      }
    } catch {
      toast.error('Falha ao carregar template')
    } finally {
      setLoading(false)
    }
  }, [entry])

  useEffect(() => { void load() }, [load])

  // Preview ao vivo (debounced)
  useEffect(() => {
    setPreviewError('')
    if (!subject && !bodyHtml && !bodyText) { setPreview(null); return }
    const handle = setTimeout(() => {
      emailTemplatesApi.preview(entry.code, {
        subject: subject || null,
        bodyHtml: bodyHtml || null,
        bodyText: bodyText || null,
      })
        .then(setPreview)
        .catch(err => {
          setPreview(null)
          if (err instanceof HttpError) setPreviewError(err.message)
        })
    }, 350)
    return () => clearTimeout(handle)
  }, [entry.code, subject, bodyHtml, bodyText])

  const save = async () => {
    if (!subject.trim()) { toast.warning('Informe o assunto'); return }
    if (!bodyHtml.trim() && !bodyText.trim()) {
      toast.warning('Informe ao menos um corpo (HTML ou texto)')
      return
    }
    setSaving(true)
    try {
      const updated = await emailTemplatesApi.upsert(entry.code, {
        scopeType: 'system',
        subject: subject.trim(),
        bodyHtml: bodyHtml || null,
        bodyText: bodyText || null,
        fromName: fromName.trim() || null,
        isActive,
      })
      setRow(updated)
      toast.success('Template salvo', entry.label)
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : 'Erro ao salvar.'
      toast.error('Falha ao salvar template', msg)
    } finally {
      setSaving(false)
    }
  }

  const reset = async () => {
    if (!row) return
    if (!confirm('Voltar ao template padrão (remover esta customização)?')) return
    setSaving(true)
    try {
      await emailTemplatesApi.remove(entry.code, 'system')
      toast.success('Customização removida', entry.label)
      await load()
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : 'Erro ao remover.'
      toast.error('Falha ao remover', msg)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-sm text-slate-400">
        Carregando…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header do editor */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{entry.label}</h2>
            <p className="text-sm text-slate-500 mt-0.5">{entry.description}</p>
          </div>
          <span className={cn(
            'text-[11px] font-semibold uppercase tracking-widest px-2 py-1 rounded-full shrink-0',
            row
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-500',
          )}>
            {row ? 'Customizado' : 'Usando padrão'}
          </span>
        </div>
      </div>

      {/* Variáveis disponíveis */}
      <details className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm">
        <summary className="cursor-pointer text-slate-700 dark:text-slate-300 flex items-center gap-2 font-medium">
          <Info size={13} className="text-sky-500" />
          Variáveis disponíveis ({entry.variables.length})
        </summary>
        <ul className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
          {entry.variables.map(v => (
            <li key={v.name} className="flex items-start gap-2 text-[12px]">
              <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-violet-700 dark:text-violet-300 font-mono text-[11px] shrink-0">
                {`{{ ${v.name} }}`}
              </code>
              <span className="text-slate-500 dark:text-slate-400 leading-snug">{v.description}</span>
            </li>
          ))}
        </ul>
      </details>

      {/* Form + preview lado a lado */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Coluna 1: form */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <Field label="Assunto *">
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder={entry.defaultSubject}
              className={inputCls()}
            />
          </Field>

          <Field label="Nome do remetente" hint="Opcional — sobrescreve o padrão">
            <input
              value={fromName}
              onChange={e => setFromName(e.target.value)}
              placeholder="Ex.: Prefeitura de Anápolis"
              className={inputCls()}
            />
          </Field>

          <div>
            <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800 mb-3">
              <TabBtn active={tab === 'html'} onClick={() => setTab('html')} icon={<FileCode2 size={13} />}>
                HTML
              </TabBtn>
              <TabBtn active={tab === 'text'} onClick={() => setTab('text')} icon={<FileText size={13} />}>
                Texto puro
              </TabBtn>
            </div>
            {tab === 'html' ? (
              <textarea
                value={bodyHtml}
                onChange={e => setBodyHtml(e.target.value)}
                rows={14}
                placeholder="<p>Olá, {{ user_name }}…</p>"
                className={cn(inputCls(), 'font-mono text-[12px] leading-relaxed')}
              />
            ) : (
              <textarea
                value={bodyText}
                onChange={e => setBodyText(e.target.value)}
                rows={14}
                placeholder="Olá, {{ user_name }}…"
                className={cn(inputCls(), 'font-mono text-[12px] leading-relaxed')}
              />
            )}
            <p className="text-[11px] text-slate-400 mt-1">
              Recomendado preencher os dois: e-mails modernos renderizam HTML,
              mas o texto puro é fallback para clientes legados e leitores de tela.
            </p>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
              Ativo
            </label>
            <div className="flex items-center gap-2">
              {row && (
                <button type="button" onClick={reset} disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-500 hover:text-rose-500 hover:border-rose-300 dark:hover:border-rose-800 transition-colors disabled:opacity-50">
                  <Undo2 size={14} />
                  Voltar ao padrão
                </button>
              )}
              <button type="button" onClick={save} disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-60 transition-colors">
                <Save size={14} />
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>

        {/* Coluna 2: preview */}
        <div className="bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
            <Eye size={14} className="text-sky-500" />
            Prévia — igual ao que chega no e-mail
            {preview?.credentialsSource && (
              <span className="text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300">
                creds: {preview.credentialsSource}
              </span>
            )}
          </h3>

          {previewError ? (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-sm text-rose-700 dark:text-rose-400">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <p>{previewError}</p>
            </div>
          ) : !preview ? (
            <p className="text-sm text-slate-400 py-6 text-center">Edite os campos para ver a prévia.</p>
          ) : (
            /* Client-mockup: header estilo Gmail + iframe do body na largura 640px */
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              {/* Header simulando linha do Gmail */}
              <div className="px-5 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800 space-y-2">
                <p className="text-[15px] font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                  {preview.subject}
                </p>
                <div className="flex items-center gap-2 text-[12px]">
                  <div className="w-7 h-7 rounded-full bg-violet-500/80 flex items-center justify-center text-white font-semibold text-[11px] shrink-0">
                    {(preview.fromName || preview.fromEmail || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-700 dark:text-slate-300 truncate">
                      <span className="font-medium">{preview.fromName || '—'}</span>{' '}
                      <span className="text-slate-400">&lt;{preview.fromEmail || '?'}&gt;</span>
                    </p>
                    <p className="text-[11px] text-slate-400">
                      para igor98rodrigues@gmail.com · {new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Body */}
              {preview.bodyHtml ? (
                <iframe
                  srcDoc={preview.bodyHtml}
                  title="Prévia HTML"
                  sandbox=""
                  className="w-full bg-white block"
                  style={{ height: '560px' }}
                />
              ) : preview.bodyText ? (
                <div className="p-5 bg-white dark:bg-slate-900">
                  <pre className="text-[13px] text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
                    {preview.bodyText}
                  </pre>
                </div>
              ) : (
                <p className="p-5 text-sm text-slate-400 italic">Sem corpo de mensagem.</p>
              )}

              {/* Fallback texto quando tem os dois */}
              {preview.bodyHtml && preview.bodyText && (
                <details className="border-t border-slate-100 dark:border-slate-800 px-5 py-3 bg-slate-50/60 dark:bg-slate-800/30">
                  <summary className="cursor-pointer text-[11px] uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <CheckCircle2 size={10} className="text-emerald-500" />
                    Fallback texto puro (clientes sem HTML)
                  </summary>
                  <pre className="text-[12px] text-slate-600 dark:text-slate-400 whitespace-pre-wrap font-sans leading-relaxed mt-2">
                    {preview.bodyText}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Helpers de UI ───────────────────────────────────────────────────────────

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  )
}

function TabBtn({
  active, onClick, icon, children,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
        active
          ? 'border-violet-500 text-violet-700 dark:text-violet-400'
          : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function inputCls() {
  return 'w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-violet-400 text-slate-800 dark:text-slate-200'
}
