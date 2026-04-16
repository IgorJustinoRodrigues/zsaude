import { useNavigate } from 'react-router-dom'
import { Users, UserPlus, History } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'

const CARDS = [
  {
    title: 'Pacientes',
    subtitle: 'Listar e gerenciar cadastros',
    icon: Users,
    to: '/hsp/pacientes',
  },
  {
    title: 'Novo paciente',
    subtitle: 'Cadastrar um novo registro',
    icon: UserPlus,
    to: '/hsp/pacientes/novo',
  },
  {
    title: 'Histórico',
    subtitle: 'Ver alterações recentes',
    icon: History,
    to: '/hsp/pacientes',
  },
] as const

export function HspHomePage() {
  const navigate = useNavigate()
  return (
    <div>
      <PageHeader title="Hospitalar" subtitle="Cadastro e acompanhamento de pacientes" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {CARDS.map(card => {
          const Icon = card.icon
          return (
            <button
              key={card.title}
              onClick={() => navigate(card.to)}
              className="bg-white border border-border rounded-xl p-5 text-left hover:border-primary/40 hover:shadow-sm transition-all"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
                <Icon size={18} />
              </div>
              <h3 className="font-semibold text-sm">{card.title}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{card.subtitle}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
