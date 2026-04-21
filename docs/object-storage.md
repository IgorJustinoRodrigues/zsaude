# Object Storage (S3/MinIO) — Guia Completo

Todo arquivo binário (foto, documento, export, import) vive em object
storage compatível com S3. Em dev roda MinIO local; em prod roda AWS S3.
**Nenhum binário deve ficar em coluna do banco** (exceto fallback legado
em `patient_photos.content`, em remoção).

---

## 1. Arquitetura

```
   ┌───────────┐  upload/download  ┌──────────────┐
   │  FastAPI  │──────────────────▶│ MinIO (dev)  │
   │  handler  │                    │   or AWS S3  │
   └─────┬─────┘                    └──────────────┘
         │
         │ registra metadado
         ▼
   ┌────────────────────────────┐
   │   Tabela `files` (catálogo)│
   │   — existe em schema app   │
   │     e em cada mun_<ibge>   │
   └────────────────────────────┘
```

**Dois pontos não-negociáveis:**

1. **Todo upload no S3 tem uma linha correspondente em `files`.** Sem
   exceção. A tabela é o catálogo autoritativo — busca, retenção e
   auditoria operam nela, não no S3.
2. **O arquivo e a linha são criados transacionalmente.** Se a inserção
   na tabela falhar, o upload é revertido (`storage.delete(key)`).
   Ver `hsp/service.py:upload_photo` para o padrão canônico.

---

## 2. Configuração

### 2.1. Dev (MinIO local)

O `docker compose up` já sobe MinIO e cria o bucket.

| Item | Valor |
|---|---|
| Console web | http://localhost:9003 |
| API S3 | http://localhost:9002 |
| Usuário | `minioadmin` |
| Senha | `minioadmin` |
| Bucket | `zsaude-files` |

`.env` padrão:

```env
STORAGE_ENDPOINT=http://minio:9000
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
STORAGE_BUCKET=zsaude-files
STORAGE_REGION=us-east-1
```

### 2.2. Prod (AWS S3)

Crie o bucket e um IAM user com policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
    "Resource": "arn:aws:s3:::zsaude-prod-files/*"
  }]
}
```

```env
STORAGE_ENDPOINT=                     # vazio → AWS default
STORAGE_ACCESS_KEY=AKIA...
STORAGE_SECRET_KEY=...
STORAGE_BUCKET=zsaude-prod-files
STORAGE_REGION=sa-east-1
```

Nenhuma mudança de código — o serviço detecta automaticamente pelo
endpoint vazio.

---

## 3. Convenção de paths (storage_key)

Todo `storage_key` começa com um prefixo que identifica o dono:

```
app/                                      # arquivos globais (logo, export global)
  ├── users/{user_id}/photo/{uuid}.jpg    # foto do usuário (proposto — seção 11)
  ├── exports/{export_id}.csv
  └── logos/{municipality_id}.png

mun_{ibge}/                               # arquivos do município
  ├── patients/{patient_id}/photos/{uuid}.jpg
  ├── patients/{patient_id}/documents/{uuid}.pdf
  └── imports/cnes/{import_id}.zip        # (planejado — hoje in-memory)
```

Regras:

- **UUID v7** para o arquivo (ordenável por tempo, evita colisão).
- **Extensão vem do MIME** (`image/jpeg` → `.jpg`; `image/png` → `.png`).
- **Nunca use nome original do usuário no path** — guarde em
  `files.original_name`. Evita path-traversal e caracteres inválidos.
- **Nunca exponha o path cru ao cliente** — para serving use
  ou download proxy (seção 6.2) ou presigned URL (seção 6.3).

---

## 4. Tabela `files` — catálogo

Arquivo: `backend/app/db/file_model.py`. Duas classes, mesma estrutura:

- `AppFile` → schema `app`, tabela `files` — arquivos globais.
- `TenantFile` → schema `mun_<ibge>`, tabela `files` — arquivos do município.

### 4.1. Colunas

| Coluna | Tipo | Uso |
|---|---|---|
| `id` | UUID v7 | PK, ordenável por tempo |
| `storage_key` | VARCHAR(500), **unique** | path no S3 (ver §3) |
| `original_name` | VARCHAR(300) | nome original enviado pelo usuário |
| `mime_type` | VARCHAR(100) | `image/jpeg`, `application/pdf`, etc |
| `size_bytes` | INTEGER | tamanho |
| `checksum_sha256` | VARCHAR(64) | SHA256 hex — integridade + dedupe |
| `category` | VARCHAR(50), index | tag funcional (§4.2) |
| `entity_id` | UUID, nullable, index | FK lógica ao dono (`patient_id`, `user_id`, `import_id`) |
| `context` | TEXT, nullable | OCR, descrição de IA, transcrição, JSON extraído |
| `uploaded_by` | UUID, nullable | usuário que fez o upload |
| `uploaded_by_name` | VARCHAR(200) | snapshot do nome (resiste a rename do user) |
| `created_at` / `updated_at` | TIMESTAMPTZ | auditoria |

### 4.2. Catálogo de `category`

Sempre use um dos valores canônicos — o frontend e relatórios
dependem deles.

| Categoria | Schema | Entidade relacionada |
|---|---|---|
| `patient_photo` | tenant | `patient.id` |
| `patient_document` | tenant | `patient.id` (RG/CNH/exame) |
| `user_photo` | app | `user.id` **(proposto — seção 11)** |
| `cnes_import` | tenant | `cnes_import.id` *(hoje não ativo)* |
| `sigtap_import` | app | `sigtap_import.id` *(hoje não ativo)* |
| `logo` | app | `municipality.id` / `facility.id` |
| `export` | app ou tenant | `export.id` |

Ao adicionar categoria nova: registre neste documento **e** valide no
service/router com lista fechada (evita typo).

### 4.3. `context` — resultado assíncrono de IA

Campo TEXT sem limite. Preenchido depois do upload, via job ou
operação de IA. Exemplos:

- OCR de RG/CNH → texto extraído
- Análise de foto → descrição em texto
- Áudio → transcrição
- Documento clínico → JSON estruturado

Convenção: se for JSON, prefira escrever em `context` mesmo, sem criar
coluna nova — é um payload mutável por feature.

---

## 5. API Python — `StorageService`

Arquivo: `backend/app/services/storage.py`. Cached singleton via
`get_storage()`.

```python
from app.services.storage import get_storage

storage = get_storage()

# Upload
await storage.upload(key, bytes_data, content_type)

# Download (bytes em memória)
data = await storage.download(key)

# Presigned URL temporária (default 1h)
url = await storage.presigned_url(key, expires=3600)

# Verificar existência
ok = await storage.exists(key)

# Deletar
await storage.delete(key)
```

Todos os métodos são `async`. O cliente é reusado via `aioboto3`.

---

## 6. Fluxo de upload — padrão canônico

Referência: `hsp/service.py::upload_photo`.

```python
import hashlib
from uuid import uuid4
from app.services.storage import get_storage

async def upload_something(self, entity_id: UUID, payload: UploadPayload) -> File:
    # 1. Validar entrada (tamanho, mime)
    content = payload.content
    if len(content) > MAX_SIZE_BYTES:
        raise HTTPException(413, "Arquivo muito grande.")
    if payload.mime not in ALLOWED_MIMES:
        raise HTTPException(415, "Formato não suportado.")

    # 2. Computar checksum e key
    checksum = hashlib.sha256(content).hexdigest()
    photo_id = uuid4()
    ext = MIME_TO_EXT[payload.mime]
    storage_key = f"mun_{self.ctx.municipality_ibge}/patients/{entity_id}/photos/{photo_id}.{ext}"

    # 3. Upload S3 (antes do DB — se DB falhar, removemos)
    storage = get_storage()
    await storage.upload(storage_key, content, payload.mime)

    try:
        # 4. Cataloga no files
        file_row = TenantFile(
            id=photo_id,
            storage_key=storage_key,
            original_name=payload.original_name or f"{photo_id}.{ext}",
            mime_type=payload.mime,
            size_bytes=len(content),
            checksum_sha256=checksum,
            category="patient_photo",
            entity_id=entity_id,
            uploaded_by=self.ctx.user_id,
            uploaded_by_name=self.user_name,
        )
        self.db.add(file_row)
        await self.db.flush()

        # 5. Cria a linha de domínio (PatientPhoto, UserPhoto, etc.)
        # ...

        # 6. Audit obrigatório
        await write_audit(
            self.db, module="hsp", action="patient_photo_upload", severity="info",
            resource="patient_photo", resource_id=str(photo_id),
            description=describe_change(
                actor=self.user_name, verb="enviou nova foto para",
                target_name=patient.name,
            ),
            details={"patientName": patient.name, "size": len(content),
                     "mime": payload.mime, "storageKey": storage_key},
        )
        return file_row

    except Exception:
        # Rollback compensatório — evita S3 órfão
        await storage.delete(storage_key)
        raise
```

### 6.1. Ordem é importante

1. Upload S3 **primeiro**
2. `files` row
3. Linha de domínio (e qualquer pipeline, ex: face enrollment)
4. `write_audit`
5. Em qualquer falha entre 2 e 4: `storage.delete(key)` em `except`.

### 6.2. Download via proxy (padrão atual)

O backend faz `storage.download(key)` e devolve `Response(content, media_type=mime)`.
Vantagem: permite injetar auditoria, permissões, transformações.
Custo: consome CPU/banda do backend.

```python
@router.get("/patients/{patient_id}/photo")
async def get_photo(patient_id, db, ctx=requires("hsp.patient.view")):
    photo_row = await svc.load_current_photo(patient_id)
    content = await storage.download(photo_row.storage_key)
    await write_audit(db, module="hsp", action="patient_photo_download",
                      severity="info", ...)
    return Response(content, media_type=photo_row.mime_type,
                    headers={"Cache-Control": "private, max-age=60"})
```

### 6.3. Download via presigned URL (quando usar)

Para arquivos **grandes** (vídeo, PDF longo, export CSV) onde streaming
pelo backend é gargalo. O cliente baixa direto do S3.

```python
url = await storage.presigned_url(key, expires=3600)
return {"url": url, "expiresIn": 3600}
```

**Quando NÃO usar presigned:**
- Foto de paciente / usuário — o proxy permite audit granular.
- Arquivos com ACL por facility/role dinâmico — a URL é "bearer".
- Qualquer coisa que precise de transformação no backend.

---

## 7. Face enrollment associado ao upload

Se o arquivo é uma foto que entra em busca facial (paciente, usuário),
o enrollment roda **no mesmo request** com os bytes já em memória —
evita um segundo download do S3.

```python
# dentro do upload_photo:
from app.services.face import enroll
enrollment = await enroll(content)  # bytes em memória
# grava embedding em PatientFaceEmbedding / UserFaceEmbedding
```

Se o usuário tiver `face_opt_in = False`, pule o enrollment mas **não**
pule o upload — a foto ainda tem usos não-biométricos (identificação
visual, avatar).

---

## 8. Checklist — adicionando nova feature com storage

Antes de abrir PR:

- [ ] `storage_key` segue o prefixo `app/` ou `mun_{ibge}/` com sub-path coerente?
- [ ] UUID v7 no nome do arquivo (ordenável, sem colisão)?
- [ ] Extensão derivada do MIME (não do nome do usuário)?
- [ ] Tamanho máximo e MIME permitidos validados antes do upload?
- [ ] `files` (AppFile ou TenantFile) criado com **todas** as colunas preenchidas?
- [ ] `category` usa valor canônico (§4.2) — se nova, adicionada neste doc?
- [ ] Checksum SHA256 calculado e gravado?
- [ ] Upload S3 dentro de try/except com `storage.delete` no rollback?
- [ ] `write_audit` com `describe_change` e `storageKey` em `details`?
- [ ] Download tem permissão (`requires(...)`) e audit de leitura sensível?
- [ ] Se for PHI / biométrico: severity `warning` no audit?
- [ ] Frontend consome via endpoint proxy ou presigned URL — nunca direto com endpoint cru?

---

## 9. Operação / debug

### 9.1. Inspecionar no console MinIO

http://localhost:9003 → login `minioadmin/minioadmin` → bucket
`zsaude-files`. Dá para navegar, baixar, deletar manualmente.

### 9.2. Listar arquivos de um paciente

```sql
-- dentro do schema do município
SELECT id, category, original_name, mime_type, size_bytes, storage_key, created_at
  FROM mun_5208608.files
 WHERE category = 'patient_photo'
   AND entity_id = '<patient-uuid>'
 ORDER BY created_at DESC;
```

### 9.3. Encontrar arquivos órfãos (S3 sem `files`)

Rode um job Python periódico que:
1. Lista chaves do bucket (`list_objects_v2` com prefixo).
2. Para cada, checa se existe em `AppFile.storage_key` ou `TenantFile.storage_key`
   no schema correspondente ao prefixo.
3. Reporta / deleta as que não existem (com grace period).

**Não implementado ainda** — issue #TODO.

### 9.4. Tamanho total usado

```bash
docker compose exec minio mc du local/zsaude-files --recursive
```

Ou query agregando `files.size_bytes`:

```sql
SELECT category, COUNT(*), SUM(size_bytes) / 1024 / 1024 AS mb
  FROM mun_5208608.files
 GROUP BY category;
```

---

## 10. Estado atual do código

Validado em 2026-04-18:

| Uso | Implementado? | Arquivos |
|---|---|---|
| Foto de paciente | ✅ | `hsp/service.py` (upload/download/soft-delete/restore) |
| `TenantFile` catálogo | ✅ | `db/file_model.py` + migration `t0008_files_table` |
| Face enrollment no upload | ✅ | `hsp/face_service.py:enroll` |
| Download proxy com cache-control | ✅ | `hsp/router.py` |
| Audit em todas as operações | ✅ | uploads/downloads/removes |
| Documento do paciente | ❌ | categoria reservada, sem endpoint |
| Logo do município/unidade | ❌ | categoria reservada, sem endpoint |
| Import CNES/SIGTAP em S3 | ❌ | hoje ZIP é parseado em memória e descartado |
| Export de relatório em S3 | ❌ | não implementado |
| **Foto do usuário (MASTER/prefeitura)** | ❌ | **proposto — seção 11** |
| Cleanup de órfãos | ❌ | sem job agendado |
| Presigned URL em uso | ❌ | só proxy; implementação do método existe |

---

## 11. Foto de usuário (MASTER/prefeitura) — proposta de implementação

Requisito: vincular uma foto a cada usuário (MASTER, ADMIN municipal,
profissional), armazenada em S3, **separada das fotos de paciente**,
com enrollment facial próprio.

### 11.1. Separação — por quê

Embeddings de paciente e embeddings de usuário não devem compartilhar
índice nem schema:

- Paciente: vive em `mun_<ibge>.patient_face_embeddings` (tenant).
  Busca facial de atendimento compara só contra pacientes daquele
  município.
- Usuário: deve viver em `app.user_face_embeddings` (global).
  Busca facial de login/presença compara contra usuários globalmente.

Misturar os dois índices causaria: (a) match cruzado paciente↔funcionário,
(b) vazamento entre municípios, (c) custo de busca linear em base maior.

### 11.2. Esquema de arquivos

```
app/users/{user_id}/photo/{photo_id}.jpg
```

Tabela `app.files` com `category='user_photo'`, `entity_id=user_id`.

### 11.3. Modelos novos (schema `app`)

```python
# app/modules/users/models.py — colunas novas em User
current_photo_id: Mapped[uuid.UUID | None]   # FK lógica -> app.user_photos.id
face_opt_in:      Mapped[bool]               # default True; opt-out preserva foto sem embedding

# novo: app/modules/users/photo_models.py
class UserPhoto(Base, TimestampedMixin):
    __tablename__ = "user_photos"
    id:         UUID (pk, uuid7)
    user_id:    UUID (fk -> users.id, index)
    file_id:    UUID (fk -> app.files.id)
    storage_key: str (desnormalizado; evita JOIN em download)
    mime_type:  str
    size_bytes: int
    uploaded_at: tz
    uploaded_by: UUID | None
    uploaded_by_name: str

class UserFaceEmbedding(Base):
    __tablename__ = "user_face_embeddings"
    user_id:   UUID (pk)
    photo_id:  UUID (fk -> user_photos.id)
    embedding: VectorType(512)               # mesmo ArcFace do paciente
    updated_at: tz
    # índice HNSW/IVF por similaridade (vector_cosine_distance_sql do DialectAdapter)
```

### 11.4. Endpoints (todos em `/api/v1/users/{user_id}/photo`)

| Verbo | Path | Permissão |
|---|---|---|
| POST | `/users/{id}/photo` | self ou `users.photo.manage` (ADMIN+) |
| GET | `/users/{id}/photo` | self ou `users.view` |
| DELETE | `/users/{id}/photo` | self ou `users.photo.manage` |
| POST | `/users/{id}/photo/reindex` | MASTER |
| GET | `/users/{id}/photos` | self ou `users.view` (histórico) |
| POST | `/users/{id}/photos/{photo_id}/restore` | self ou `users.photo.manage` |
| DELETE | `/users/{id}/face-embedding` | self ou MASTER (opt-out) |

### 11.5. Fluxo de upload — idêntico ao de paciente

1. Validar mime/size (reusar `_ALLOWED_MIMES`, `_MAX_UPLOAD_BYTES`).
2. Upload S3 → `app/users/{user_id}/photo/{photo_id}.jpg`.
3. Insert `AppFile` com `category='user_photo'`, `entity_id=user.id`.
4. Insert `UserPhoto` com FK para `AppFile`.
5. Update `user.current_photo_id`.
6. Se `face_opt_in`: enroll facial → `UserFaceEmbedding`.
7. `write_audit(module="users", action="user_photo_upload", ...)`.
8. Em erro: `storage.delete(storage_key)`.

### 11.6. Impacto em código existente

- Nova migration: `app.user_photos`, `app.user_face_embeddings`,
  ALTER USER ADD `current_photo_id`, `face_opt_in`.
- Novo módulo: `app/modules/users/photo_service.py` + `face_service.py`
  (ou reusar o módulo de face com parâmetro de escopo `"patient" | "user"`).
- Novo router montado em `/api/v1/users/...` (extensão do users_router existente).
- `frontend/src/api/users.ts`: métodos `uploadPhoto`, `getPhoto`, `removePhoto`.
- Tela de perfil de usuário: upload com preview + crop.
- Audit labels: `user_photo_upload`, `user_photo_remove`, `user_face_match`, etc.
- Permissões novas no catálogo RBAC: `users.photo.manage`.

### 11.7. Busca facial de usuário — casos de uso

Antes de implementar, definir o use-case:

- **Login por face?** — complexidade alta (anti-spoofing, liveness).
  Fora de escopo inicial.
- **Check-in de ponto / presença?** — endpoint
  `POST /api/v1/users/face-match` que recebe imagem, retorna
  user_id do match top-1 com threshold de confiança. Útil para
  totems de presença em unidades.
- **Avatar reverso** (encontrar usuário pela foto) — MASTER-only,
  útil em auditoria forense.

Recomendo implementar **só o armazenamento + embedding por ora** e
deixar o endpoint de match para depois do caso de uso validado.

### 11.8. Questões a confirmar antes de começar

1. **`face_opt_in` default `true` ou `false`?** Paciente é `true`
   (opt-out). Para funcionário pode ser `true` também, desde que
   o onboarding mostre termo LGPD. Sugerido: `true`.
2. **Quem pode ver a foto de outro?** Minha sugestão: MASTER vê
   todas; ADMIN de município vê só usuários vinculados ao município;
   USER vê só a própria. Reforçado em `requires()`.
3. **Limite de tamanho/tipo?** Mesmo do paciente: 10 MB, JPEG/PNG/WEBP.
4. **Endpoint de face-match de usuário agora ou depois?** Sugestão:
   **depois** — guardamos embedding no upload, endpoint de match vem
   junto com a primeira feature que consome (ponto, login, etc.).

---

## 12. Referências internas

- Serviço: `backend/app/services/storage.py`
- Modelos: `backend/app/db/file_model.py`
- Uso canônico: `backend/app/modules/hsp/service.py` (`upload_photo`,
  `load_photo_bytes`, `remove_photo`, `restore_photo`)
- Router de leitura: `backend/app/modules/hsp/router.py`
- Migration tenant: `backend/migrations_tenant/versions/20260417_t0008_files_table.py`
- Migration adiciona `storage_key` em `patient_photos`:
  `backend/migrations_tenant/versions/20260417_t0009_photo_storage_key.py`
- Docker compose (MinIO + init): `backend/docker-compose.yml`

Ver também:
- `docs/audit-logging.md` — audit obrigatório em upload/download.
- `docs/observability.md` — métricas e logs da stack.
