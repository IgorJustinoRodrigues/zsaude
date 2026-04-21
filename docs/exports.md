# Exportação de Dados — Padrão do Sistema

Guia único pra exportar qualquer listagem em **CSV** ou **PDF** — com dois
formatos padronizados de PDF (retrato e paisagem) que usam o mesmo
layout base. Tudo roda 100% no cliente (sem chamada extra ao backend)
usando `jspdf` + `jspdf-autotable`.

**Regra de ouro:** cada tela **escolhe um formato de PDF** (retrato ou
paisagem), não oferece os dois. Isso mantém consistência — o usuário
sabe o que vai receber.

**Comportamento do PDF:** abre em **nova aba** no viewer nativo do
browser (preview). O usuário lê, imprime ou salva pelo próprio visor
(`Ctrl+S` / botão de download). O CSV continua baixando direto.

---

## 1. Arquivos

```
frontend/src/lib/export/
├── index.ts       exportData(format, options)
├── types.ts       ExportOptions, ExportColumn, ExportFormat
├── brand.ts       cores e branding (editável)
├── csv.ts         gera CSV
├── pdf.ts         gera PDF (retrato ou paisagem)
└── shared.ts      helpers (filename, download, formatCell)

frontend/src/components/ui/
└── ExportMenuButton.tsx   botão dropdown pronto de usar
```

---

## 2. Uso rápido — 3 passos

```tsx
import { ExportMenuButton } from '../../components/ui/ExportMenuButton'

<ExportMenuButton
  pdfOrientation="portrait"     // ou "landscape" — ver §6
  options={{
    title: 'Aniversariantes',
    subtitle: `${items.length} pessoas`,
    context: 'Anápolis/GO',
    filename: 'aniversariantes-abril',
    rows: items,
    columns: [
      { header: 'Dia',  get: u => u.day,  align: 'center', bold: true, width: 40 },
      { header: 'Nome', get: u => u.name },
      { header: 'Idade', get: u => `${u.age} anos`, align: 'right', width: 65 },
    ],
    rowHighlight: u => u.isToday ? 'pink' : null,
  }}
/>
```

Pronto. Um dropdown **Exportar** aparece com duas opções:
**Planilha (CSV)** e **Documento (PDF)**. Desabilita sozinho quando
`rows.length === 0`.

---

## 3. `ExportOptions<T>` — referência

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `title` | `string` | ✅ | Título grande na 1ª página (ex.: "Aniversariantes"). |
| `subtitle` | `string?` | | Subtítulo abaixo do título (ex.: "Abril · 12 pessoas"). |
| `context` | `string?` | | **Nome da cidade** ou recorte. Aparece em caixa alta no topo de toda página. Ex.: "Anápolis/GO". |
| `filename` | `string` | ✅ | Base do nome do arquivo; vira slug. `_YYYY-MM-DD.csv/pdf` é adicionado. |
| `rows` | `T[]` | ✅ | Dados já filtrados e ordenados. |
| `columns` | `ExportColumn<T>[]` | ✅ | Colunas (ver §4). |
| `rowHighlight` | `(row) => HighlightTone \| null` | | Destaque condicional no PDF (CSV ignora). |

### 3.1. `ExportColumn<T>`

```ts
{
  header: 'Dia',                       // rótulo
  get: (row) => row.day,               // pode retornar string ou number
  width?: 40,                          // pontos — opcional
  align?: 'left' | 'center' | 'right',
  bold?: true,                         // coluna em negrito
}
```

Números retornados pelo `get` são formatados em pt-BR automaticamente
(`12345` → `"12.345"`). Pra formatos especiais, retorne string já pronta:

```ts
{ header: 'Idade',   get: u => `${u.age} anos` }
{ header: 'Cadastro', get: u => new Date(u.createdAt).toLocaleDateString('pt-BR') }
{ header: 'Status',  get: u => u.isActive ? 'Ativo' : 'Inativo' }
```

### 3.2. `rowHighlight`

Retorna a tonalidade que destaca a linha **no PDF**:

- `'pink'` — celebração (aniversário hoje)
- `'emerald'` — sucesso (exportado, pago)
- `'amber'` — atenção (pendente, bloqueado)
- `'sky'` — informativo
- `'slate'` — neutro

Vazio ou `null` = sem destaque.

---

## 4. Uso programático (sem o botão)

Pra disparar sem interação do usuário:

```ts
import { exportData } from '../../lib/export'

exportData('csv', options)
exportData('pdf-portrait', options)
exportData('pdf-landscape', options)
```

Útil em:
- Botão customizado (não o dropdown padrão)
- Export agendado/em lote
- Testes

---

## 5. `ExportMenuButton` — props

| Prop | Tipo | Default | Descrição |
|---|---|---|---|
| `options` | `ExportOptions<T>` | — | Dados e configuração. |
| `label` | `string` | `'Exportar'` | Texto do botão. |
| `disableWhenEmpty` | `boolean` | `true` | Desabilita quando `rows.length === 0`. |
| `pdfOrientation` | `'portrait'` \| `'landscape'` \| `'none'` | `'portrait'` | Orientação do PDF. `'none'` oferece só CSV. |
| `className` | `string?` | | Classes extras no botão. |

---

## 6. Quando usar **retrato** vs **paisagem**

A decisão é feita **por tela** e fica fixa — não damos a escolha ao
usuário. Isso garante que todo mundo da mesma tela recebe o mesmo
formato e o layout foi pensado pra caber direito.

### 6.1. Retrato (`portrait`) — padrão

Use quando:
- Até **5 colunas** de largura média.
- Coluna de nome/descrição cabe em 30-40 caracteres.
- Relatório "cotidiano" (listas, aniversariantes, usuários).

Exemplos:
- **Aniversariantes** (5 colunas: dia, nome, nível, perfil, idade)
- **Usuários da plataforma** (nome, CPF, email, nível, status)
- **Histórico de logs de um usuário** (data, ação, descrição)

### 6.2. Paisagem (`landscape`) — casos específicos

Use quando:
- **6+ colunas**, ou alguma tem texto longo (endereço, observação).
- Relatório analítico com várias dimensões.
- Série temporal ampla (gráfico textual).

Exemplos:
- **Pacientes com prontuário completo** (nome, CPF, nascimento, bairro, endereço, telefone, último atendimento, próxima consulta)
- **Relatório de atendimentos** (data, paciente, profissional, procedimentos, CID, valor, status)
- **Matriz de acessos** (usuário × unidade × papel)

### 6.3. Exemplo — mesma tela, formato escolhido

```tsx
// Tela de usuários — cabem todas as colunas em retrato
<ExportMenuButton options={userOptions} pdfOrientation="portrait" />

// Tela de pacientes com histórico completo — precisa de paisagem
<ExportMenuButton options={patientOptions} pdfOrientation="landscape" />

// Sem PDF (só CSV) — relatório só pra análise em planilha
<ExportMenuButton options={analyticsOptions} pdfOrientation="none" />
```

---

## 7. Nomeação dos arquivos

O framework cuida sozinho:

| `filename` passado | Arquivo gerado |
|---|---|
| `"usuarios"` | `usuarios_2026-04-18.csv` |
| `"aniversariantes-abril"` | `aniversariantes-abril_2026-04-18.pdf` |
| `"Análise de Atendimentos / Q2"` | `analise-de-atendimentos-q2_2026-04-18.pdf` |

Caracteres especiais viram `-`, acentos somem, data ISO no final.
**Não** coloque `_YYYY-MM-DD` manualmente — é automático.

---

## 8. Layout padrão do PDF

Tanto retrato quanto paisagem usam o **mesmo esqueleto**:

```
┌──────────────────────────────────────────────────────────────┐
│ ANÁPOLIS / GO                                       zSaúde   │
│                                     Plataforma de saúde…     │
│ ──────────────────────────────────────────────────────────── │
│                                                              │
│ Aniversariantes              [só na 1ª página]               │
│ Abril · 12 pessoas                                           │
│                                                              │
│ ┌──────┬─────────────────────┬──────┬──────────┬────────┐    │
│ │ Dia  │ Nome                │Nível │ Perfil   │ Idade  │    │
│ ├──────┼─────────────────────┼──────┼──────────┼────────┤    │
│ │  15  │ Fulano da Silva     │ADMIN │ Gerente  │ 38 anos│    │
│ │ ...                                                   │    │
│ └──────┴─────────────────────┴──────┴──────────┴────────┘    │
│                                                              │
│ ──────────────────────────────────────────────────────────── │
│ Gerado em 18/04/2026 14:32                Página 1 de 3      │
└──────────────────────────────────────────────────────────────┘
```

Características:

- **Fundo branco** sempre.
- **Contexto** (cidade/recorte) em **CAIXA ALTA**, no canto superior esquerdo de **toda página**.
- **Marca zSaúde** + tagline no canto superior direito de **toda página**.
- **Divisória** horizontal fina separando o topo do conteúdo.
- **Título grande** + subtítulo: **só na 1ª página** (nas demais o topo fica mais compacto).
- **Linhas alternadas** em cinza-muito-claro (slate-50) para leitura.
- **Header da tabela** em slate-100 com texto slate-600, bold.
- **Linhas destacadas** (via `rowHighlight`): fundo pastel + texto bold na cor semântica.
- **Rodapé** em toda página: "Gerado em DD/MM/YYYY HH:MM" à esquerda + "Página X de Y" à direita.

---

## 9. Personalização global

Pra mudar identidade visual em todo o sistema, edite
`lib/export/brand.ts`:

```ts
export const BRAND = {
  name: 'zSaúde',
  tagline: 'Plataforma de saúde municipal',
  primary: [14, 165, 233],    // sky-500  — nome + destaques
  heading: [15, 23, 42],       // slate-900 — títulos
  body:    [51, 65, 85],       // slate-700 — corpo
  muted:   [100, 116, 139],    // slate-500 — rodapé, subtítulos
  divider: [226, 232, 240],    // slate-200 — linhas
  stripe:  [248, 250, 252],    // slate-50  — listras
  headerBg: [241, 245, 249],   // slate-100 — fundo do header da tabela
  headerFg: [71, 85, 105],     // slate-600 — texto do header
}
```

Tuplas RGB 0-255. Mude a `primary` para rebrand em minutos.

Tonalidades de destaque em `HIGHLIGHT_STYLES` (no mesmo arquivo).

---

## 10. Checklist pra adicionar export em uma tela nova

- [ ] Tenho uma lista filtrada/ordenada em `T[]`?
- [ ] Defini `columns` com `header`, `get`, e `align`/`width`/`bold` onde faz sentido?
- [ ] O `filename` é descritivo e **sem** timestamp (o framework adiciona)?
- [ ] `context` faz sentido? (município, período, recorte — aparece no PDF)
- [ ] Alguma linha merece destaque via `rowHighlight`?
- [ ] **Decidi a orientação do PDF** (retrato ou paisagem) — veja §6.
- [ ] Testei CSV abrindo no Excel (acentos OK)?
- [ ] Testei o PDF (cabe em uma página ou quebra bem? rodapé legível?)

---

## 11. Exemplo — lista de usuários (retrato)

```tsx
import { ExportMenuButton } from '../../components/ui/ExportMenuButton'
import type { ExportOptions } from '../../lib/export'

function buildUsersExport(
  users: UserListItem[],
  municipalityName?: string,
): ExportOptions<UserListItem> {
  return {
    title: 'Usuários',
    subtitle: `${users.length} ${users.length === 1 ? 'usuário' : 'usuários'}`,
    context: municipalityName,
    filename: 'usuarios',
    rows: users,
    columns: [
      { header: 'Nome',    get: u => u.name, bold: true },
      { header: 'CPF',     get: u => u.cpf || '—', align: 'center', width: 90 },
      { header: 'E-mail',  get: u => u.email || '—' },
      { header: 'Perfil',  get: u => u.primaryRole },
      { header: 'Nível',   get: u => u.level.toUpperCase(), align: 'center', width: 60 },
      { header: 'Status',  get: u => u.status, align: 'center', width: 70 },
    ],
    rowHighlight: u => u.status === 'Bloqueado' ? 'amber' : null,
  }
}

// No JSX:
<ExportMenuButton
  pdfOrientation="portrait"
  options={buildUsersExport(filteredUsers, context?.municipality?.name)}
/>
```

---

## 12. Exemplo — pacientes com prontuário (paisagem)

```tsx
function buildPatientsExport(
  patients: PatientRead[],
  municipalityName?: string,
): ExportOptions<PatientRead> {
  return {
    title: 'Pacientes',
    subtitle: `${patients.length} cadastrados`,
    context: municipalityName,
    filename: 'pacientes-completo',
    rows: patients,
    columns: [
      { header: 'Prontuário',  get: p => p.prontuario, align: 'center', bold: true, width: 70 },
      { header: 'Nome',        get: p => p.name },
      { header: 'CPF',         get: p => p.cpf || '—', align: 'center', width: 90 },
      { header: 'Nascimento',  get: p => new Date(p.birthDate).toLocaleDateString('pt-BR'), align: 'center', width: 80 },
      { header: 'Bairro',      get: p => p.bairro || '—' },
      { header: 'Telefone',    get: p => p.phone || '—', align: 'center', width: 110 },
      { header: 'E-mail',      get: p => p.email || '—' },
      { header: 'Última visita', get: p => p.lastVisit
          ? new Date(p.lastVisit).toLocaleDateString('pt-BR') : '—',
        align: 'center', width: 85 },
    ],
  }
}

<ExportMenuButton
  pdfOrientation="landscape"
  options={buildPatientsExport(filtered, context?.municipality?.name)}
/>
```

---

## 13. Referência cruzada

- `frontend/src/lib/export/` — framework
- `frontend/src/components/ui/ExportMenuButton.tsx` — dropdown pronto
- `frontend/src/components/shared/BirthdaysPanel.tsx` — exemplo canônico (retrato)
- `docs/audit-logging.md` — padrão de logs (complementa este doc)
