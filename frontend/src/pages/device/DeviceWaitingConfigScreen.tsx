// Tela mostrada quando o device está pareado mas sem vínculo a um
// painel/totem lógico — aguardando o admin escolher.

import { Loader2, Settings } from 'lucide-react'

interface Props { type: 'totem' | 'painel'; deviceName: string | null }

export function DeviceWaitingConfigScreen({ type, deviceName }: Props) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6 text-center">
      <div className="max-w-md w-full">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300 flex items-center justify-center mx-auto mb-5">
          <Settings size={28} />
        </div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-2">
          {type === 'totem' ? 'Totem' : 'Painel de chamadas'}
        </p>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
          Aguardando configuração
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
          Este dispositivo está conectado
          {deviceName && <> como <span className="font-semibold">"{deviceName}"</span></>},
          mas ainda não tem um {type === 'totem' ? 'totem' : 'painel'} lógico vinculado.
          <br /><br />
          No sistema, abra <span className="font-semibold">Recepção → Dispositivos</span>,
          clique em <span className="font-semibold">Editar</span> e escolha qual
          {' '}{type === 'totem' ? 'totem' : 'painel'} este equipamento deve exibir.
        </p>
        <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
          <Loader2 size={12} className="animate-spin" />
          Verificando a cada 10s…
        </div>
      </div>
    </div>
  )
}
