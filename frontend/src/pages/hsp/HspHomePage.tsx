import { useNavigate } from 'react-router-dom'
import { SearchCheck, UserPlus } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'

const CARDS = [
  {
    title: 'Buscar paciente',
    subtitle: 'Procurar antes de cadastrar — evita duplicatas',
    icon: SearchCheck,
    to: '/hsp/pacientes/buscar',
  },
  {
    title: 'Novo paciente',
    subtitle: 'Cadastro rápido com os dados essenciais',
    icon: UserPlus,
    to: '/hsp/pacientes/novo',
  },
] as const

export function HspHomePage() {
  const navigate = useNavigate()
  return (
    <div>
      <PageHeader title="Hospitalar" subtitle="Cadastro e acompanhamento de pacientes" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CARDS.map(card => {
          const Icon = card.icon
          return (
            <button
              key={card.title}
              onClick={() => navigate(card.to)}
              className="bg-card border border-border rounded-xl p-5 text-left hover:border-primary/40 hover:shadow-sm transition-all"
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
