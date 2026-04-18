# Identidade Visual (Branding)

Sistema de **identidade visual configurável** por município e unidade:
logo, nome institucional, textos de cabeçalho, rodapé e cor primária
aplicam-se automaticamente aos PDFs gerados pelo sistema (relatórios,
exportações, receitas) e abrem caminho pra outras personalizações no
futuro (painéis, e-mails, etc.).

## 1. Cascata (resolver)

A config efetiva é o **merge campo-a-campo** de três camadas:

```
┌────────────────────────┐
│ Defaults do sistema    │  zSaúde · #0ea5e9 · "Plataforma de saúde…"
└────────────────────────┘
           ↓
┌────────────────────────┐
│ Config do município    │  "Prefeitura de Anápolis" · #10b981 · logo.svg
└────────────────────────┘
           ↓
┌────────────────────────┐
│ Config da unidade      │  override só dos campos preenchidos
└────────────────────────┘
```

Regra prática:
- **Unidade preenchido?** usa.
- Senão, **município preenchido?** usa.
- Senão, **default do sistema**.

Campos texto vazios ou só com espaços contam como "não preenchido".
Isso permite que uma unidade personalize **só** a logo, herdando
nome/cores/textos da cidade sem preencher nada.

## 2. Dados persistidos

Tabela `app.branding_configs`:

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID v7 | PK |
| `scope_type` | enum `municipality`/`facility` | A quem aplica |
| `scope_id` | UUID | FK para `municipalities.id` ou `facilities.id` |
| `logo_file_id` | UUID FK → `app.files` | Logo (S3 via object storage) |
| `display_name` | VARCHAR(200) | Nome institucional (ex.: "Secretaria de Saúde") |
| `header_line_1` | VARCHAR(200) | Linha 1 do header do PDF |
| `header_line_2` | VARCHAR(200) | Linha 2 (CNPJ, etc.) |
| `footer_text` | VARCHAR(500) | Texto livre do rodapé |
| `primary_color` | VARCHAR(16) | Hex `#RRGGBB` |
| `pdf_configs` | JSON | Por tipo de PDF — extensível sem migration |

`UNIQUE (scope_type, scope_id)` — uma linha por escopo.

Logo vai pro `app.files` com `category='branding_logo'` e path S3
`app/branding/{scope}/{scope_id}/{uuid}.{ext}`.

## 3. Endpoints

### Admin (MASTER)

```
GET    /api/v1/admin/branding/municipalities/{id}   → BrandingRaw
PATCH  /api/v1/admin/branding/municipalities/{id}   ← BrandingUpdate
GET    /api/v1/admin/branding/facilities/{id}       → BrandingRaw
PATCH  /api/v1/admin/branding/facilities/{id}       ← BrandingUpdate
POST   /api/v1/admin/branding/{scope}/{id}/logo     ← multipart/form-data
DELETE /api/v1/admin/branding/{scope}/{id}/logo
```

### Consumo (qualquer autenticado)

```
GET /api/v1/branding/effective?municipalityId=&facilityId=
GET /api/v1/branding/logo/{file_id}
```

Sem query params, `/effective` usa o **work-context** do usuário logado
(JWT de contexto → `AuditContext.municipality_id` + `facility_id`).

## 4. Campos JSON (`pdf_configs`)

Shape esperado:

```json
{
  "report":       { "show_logo": true, "show_footer": true },
  "export":       { "show_logo": true, "show_footer": true },
  "prescription": { "show_logo": true, "show_footer": true, "signature_area": true }
}
```

Merge profundo — campos dentro de cada tipo sobrescrevem/acumulam
(facility[report] em cima de municipality[report] em cima de defaults).

**Quando adicionar uma nova configuração por tipo** (ex.: "altura do
espaço pra assinatura" em receita): basta adicionar a chave no default
(`_SYSTEM_DEFAULTS` em `service.py`) e consumir no renderizador. Sem
migration, sem DDL.

## 5. Frontend

### 5.1. Editar (admin)

Componente `components/shared/BrandingFields.tsx` — seção "Identidade
visual" plugada nos forms de:

- `SysMunicipalityFormPage` — base pra toda a cidade
- `SysFacilityFormPage` — override por unidade (campos vazios herdam)

Faz upload de logo, preview em tempo real, CRUD dos textos. Só aparece
no **modo edição** (precisa do `id` salvo).

### 5.2. Consumir (qualquer tela)

Hook `hooks/useBranding.ts`:

```tsx
import { useBranding } from '../../hooks/useBranding'

function MinhaTela() {
  const branding = useBranding()   // pega do work-context atual
  return <ExportMenuButton options={{ ...options, branding }} />
}
```

MASTER inspecionando sem work-context (ex.: visualizando o branding
duma cidade específica):

```tsx
const branding = useBranding({ municipalityId: myId })
```

O hook retorna `ExportBranding` já pronto pra passar no
`options.branding` do framework de export.

### 5.3. Cache

`store/brandingStore.ts` — cache em memória, invalidado automaticamente
quando a chave `(municipalityId, facilityId)` muda. Logo é baixada UMA
vez como dataURL e reutilizada em cada export.

Pra forçar refresh (depois do admin editar a logo, por exemplo):

```tsx
useBrandingStore.getState().invalidate()
```

## 6. Aplicação nos PDFs

`lib/export/pdf.ts` consome `options.branding`:

- **Logo** → posicionada no topo esquerdo, acima do contexto.
- **`displayName`** + **`primaryColor`** → substituem "zSaúde" no canto direito, com cor customizada.
- **`headerLine1`/`headerLine2`** → aparecem sob o display name.
- **`footerText`** → centrado acima da linha de rodapé (endereço/contato).
- **Rodapé técnico** (data + paginação) mantém-se padronizado.

Sem `branding`, o PDF cai nos defaults do sistema (zSaúde · sky-500).

## 7. Checklist pra adicionar branding em um novo tipo de export

- [ ] A tela tem um work-context ativo? `useBranding()` resolve sozinho.
- [ ] Se não, passo `municipalityId`/`facilityId` explicitamente.
- [ ] Passo o objeto `branding` no `options` do `ExportMenuButton`.
- [ ] Testei o PDF com a cidade configurada (logo + cor + textos).
- [ ] Testei o PDF sem nenhuma config (cai nos defaults zSaúde).
- [ ] Testei a herança: unidade sem logo, cidade com logo → unidade deve mostrar logo da cidade.

## 8. Extensibilidade futura

O design foi pensado pra escalar sem DDL:

1. **Novas configs por tipo de PDF** (ex.: margem, posição da assinatura) → adicionar chave no default, consumir no renderizador.
2. **Novos tipos de PDF** (ex.: `prescription_controlled`, `certificate`) → idem, só adicionar a chave no `pdf_configs`.
3. **Escopos extras** (ex.: `scope_type='system'` pra override global) → `CHECK` constraint relaxada, plus resolver camada.
4. **Temas nomeados** (ex.: "claro", "escuro", "médico") → novo campo `theme` no `BrandingConfig`, ou nova tabela `branding_themes`.
5. **Aplicar branding a e-mails / telas** → ler `/api/v1/branding/effective` no store respectivo.

## 9. Arquivos-chave

| Camada | Arquivo |
|---|---|
| Migration | `backend/migrations/versions/20260418_0034_branding_configs.py` |
| Model | `backend/app/modules/branding/models.py` |
| Service | `backend/app/modules/branding/service.py` (cascade) |
| Router | `backend/app/modules/branding/router.py` |
| Schemas | `backend/app/modules/branding/schemas.py` |
| API client | `frontend/src/api/branding.ts` |
| Form UI | `frontend/src/components/shared/BrandingFields.tsx` |
| Store | `frontend/src/store/brandingStore.ts` |
| Hook | `frontend/src/hooks/useBranding.ts` |
| PDF render | `frontend/src/lib/export/pdf.ts` |

Ver também: `docs/exports.md`, `docs/object-storage.md`.
