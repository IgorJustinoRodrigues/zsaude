import { useEffect, useState } from 'react'
import { FlaskConical, Plus } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { dgnApi, type ExamItem } from '../../api/dgn'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { useAuthStore } from '../../store/authStore'

export function DgnHomePage() {
  const can = useAuthStore(s => s.can)
  const [exams, setExams] = useState<ExamItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    dgnApi.listExams()
      .then(setExams)
      .catch(e => toast.error('Falha ao carregar', e instanceof HttpError ? e.message : ''))
      .finally(() => setLoading(false))
  }, [])

  const handleRequest = async () => {
    setSaving(true)
    try {
      const created = await dgnApi.requestExam()
      setExams(e => [created, ...e])
      toast.success('Exame solicitado', created.examName)
    } catch (e) {
      toast.error('Sem permissão', e instanceof HttpError ? e.message : '')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Diagnóstico — Exames"
        subtitle="Solicitações de exame laboratorial"
        actions={
          can('dgn.exam.request') && (
            <button
              onClick={handleRequest}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Plus size={16} /> {saving ? 'Criando…' : 'Nova solicitação'}
            </button>
          )
        }
      />

      {loading ? (
        <div className="text-center py-20 text-muted-foreground">Carregando…</div>
      ) : (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          {exams.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Nenhum exame.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {exams.map(e => (
                <div key={e.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="w-10 h-10 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                    <FlaskConical size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{e.patientName}</p>
                    <p className="text-xs text-muted-foreground truncate">{e.examName}</p>
                  </div>
                  <StatusBadge status={e.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-5 p-4 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 space-y-1">
        <p><strong>Demo RBAC:</strong> botão "Nova solicitação" só aparece se o user tem <code>dgn.exam.request</code>.</p>
        <p>A listagem exige <code>dgn.exam.view</code>. Sem ela, o menu Diagnóstico nem aparece no sidebar.</p>
      </div>
    </div>
  )
}
