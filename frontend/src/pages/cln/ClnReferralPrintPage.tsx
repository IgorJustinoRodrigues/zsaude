// Página de impressão da guia de encaminhamento pra UBS — Fase H.
//
// Layout limpo, A4 vertical. Abre em nova aba; o triador ajusta a
// impressora e imprime. Nenhuma dependência nova — só HTML/CSS + o
// endpoint de guia que já consolida todos os dados.

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, Printer, Stethoscope } from 'lucide-react'
import { clnApi, type ReferralGuide } from '../../api/cln'
import { HttpError } from '../../api/client'
import { calcAge, formatCPF, formatDate, formatDateTime } from '../../lib/utils'

export function ClnReferralPrintPage() {
  const { ticketId } = useParams<{ ticketId: string }>()
  const [guide, setGuide] = useState<ReferralGuide | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!ticketId) return
    try {
      const g = await clnApi.getReferralGuide(ticketId)
      setGuide(g)
    } catch (err) {
      if (err instanceof HttpError) setError(err.message)
      else setError('Falha ao carregar.')
    }
  }, [ticketId])

  useEffect(() => { void load() }, [load])

  if (error) {
    return (
      <div className="p-10 text-center text-sm text-red-600">{error}</div>
    )
  }
  if (!guide) {
    return (
      <div className="p-10 text-center text-muted-foreground">
        <Loader2 size={20} className="animate-spin inline" />
      </div>
    )
  }

  return (
    <div className="bg-white text-slate-900 min-h-screen">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
        @page { size: A4; margin: 18mm; }
        .doc {
          max-width: 180mm;
          margin: 0 auto;
          padding: 24px;
          font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
        }
      `}</style>

      <div className="no-print sticky top-0 bg-slate-100 border-b border-slate-300 px-4 py-2 flex items-center justify-between">
        <span className="text-xs text-slate-600">Guia de encaminhamento pra impressão</span>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold"
        >
          <Printer size={13} /> Imprimir
        </button>
      </div>

      <div className="doc">
        {/* Cabeçalho */}
        <div className="border-b border-slate-300 pb-3 mb-5">
          <div className="flex items-center gap-3">
            <Stethoscope size={24} className="text-teal-700" />
            <div>
              <h1 className="text-xl font-bold">Guia de Encaminhamento</h1>
              <p className="text-xs text-slate-600">
                {guide.originFacilityName}
              </p>
            </div>
          </div>
        </div>

        {/* Paciente */}
        <section className="mb-5">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
            Paciente
          </h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <Field label="Nome" value={guide.patientName} colSpan={2} />
            <Field
              label="Documento"
              value={formatDocument(guide.patientDocType, guide.patientDocValue)}
            />
            {guide.patientBirthDate && (
              <Field
                label="Nascimento"
                value={`${formatDate(guide.patientBirthDate)} (${calcAge(guide.patientBirthDate)} anos)`}
              />
            )}
            {guide.patientSex && (
              <Field label="Sexo" value={
                guide.patientSex === 'F' ? 'Feminino'
                : guide.patientSex === 'M' ? 'Masculino'
                : 'Não informado'
              } />
            )}
            <Field label="Senha" value={guide.ticketNumber} />
          </div>
        </section>

        {/* Triagem */}
        <section className="mb-5">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
            Triagem
          </h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <Field
              label="Classificação de risco"
              value={`Nível ${guide.riskClassification} — ${guide.riskLabel}`}
            />
            {guide.complaintName && (
              <Field label="Queixa (protocolo)" value={guide.complaintName} />
            )}
            {guide.queixa.trim() && (
              <Field label="Queixa relatada" value={guide.queixa} colSpan={2} />
            )}
            {guide.observacoes.trim() && (
              <Field label="Observações" value={guide.observacoes} colSpan={2} />
            )}
          </div>
        </section>

        {/* Destino */}
        <section className="mb-5 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-amber-800 mb-2">
            Encaminhado para
          </h2>
          <div className="text-base font-semibold">{guide.ubsName}</div>
          {guide.ubsCnes && (
            <p className="text-xs text-slate-600 mt-0.5">CNES {guide.ubsCnes}</p>
          )}
        </section>

        {/* Assinaturas */}
        <section className="mt-10 grid grid-cols-2 gap-6 text-sm">
          <SignatureLine label="Profissional que encaminhou" subtext={guide.referredByUserName || '—'} />
          <SignatureLine label="Paciente / Responsável" />
        </section>

        <p className="text-[10px] text-slate-500 text-center mt-6">
          Emitido em {formatDateTime(guide.referredAt)}
        </p>
      </div>
    </div>
  )
}

function Field({ label, value, colSpan = 1 }: { label: string; value: string; colSpan?: 1 | 2 }) {
  return (
    <div className={colSpan === 2 ? 'col-span-2' : ''}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="text-sm">{value}</p>
    </div>
  )
}

function SignatureLine({ label, subtext }: { label: string; subtext?: string }) {
  return (
    <div>
      <div className="border-t border-slate-600 pt-1 mt-8" />
      <p className="text-[10px] text-slate-600 text-center">{label}</p>
      {subtext && (
        <p className="text-[10px] text-slate-500 text-center italic">{subtext}</p>
      )}
    </div>
  )
}

function formatDocument(docType: string, value: string | null): string {
  if (!value) return `${docType.toUpperCase()} —`
  if (docType === 'cpf') return `CPF ${formatCPF(value)}`
  if (docType === 'cns') return `CNS ${value}`
  return value
}
