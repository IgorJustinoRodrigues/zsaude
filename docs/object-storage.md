# Object Storage (S3/MinIO)

## Visao Geral

Todos os arquivos do sistema (fotos, documentos, uploads) sao armazenados em
object storage compativel com S3. Em desenvolvimento usa MinIO (local), em
producao usa AWS S3.

## Acesso Local (MinIO)

| Item | Valor |
|------|-------|
| Console Web | http://localhost:9003 |
| API S3 | http://localhost:9002 |
| Usuario | `minioadmin` |
| Senha | `minioadmin` |
| Bucket | `zsaude-files` |

O console web permite navegar pelos arquivos, criar pastas, fazer download, etc.

## Configuracao (.env)

```env
# Desenvolvimento (MinIO local)
STORAGE_ENDPOINT=http://minio:9000
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
STORAGE_BUCKET=zsaude-files
STORAGE_REGION=us-east-1

# Producao (AWS S3)
STORAGE_ENDPOINT=               # vazio = usa AWS default
STORAGE_ACCESS_KEY=AKIA...      # IAM access key
STORAGE_SECRET_KEY=secret...    # IAM secret key
STORAGE_BUCKET=zsaude-prod-files
STORAGE_REGION=sa-east-1        # Sao Paulo
```

## Estrutura do Bucket

```
zsaude-files/
├── app/                              # Arquivos globais
│   └── {file_id}.{ext}
├── mun_5208707/                      # Goiania
│   └── patients/
│       └── {patient_id}/
│           └── photos/
│               └── {file_id}.jpg
├── mun_5208608/                      # Goianesia
│   └── patients/
│       └── {patient_id}/
│           └── photos/
│               └── {file_id}.png
└── mun_XXXXXXX/                      # Qualquer municipio
    └── ...
```

Cada municipio tem sua propria pasta. Quando um novo municipio e criado,
a pasta e criada automaticamente no primeiro upload.

## Tabela `files`

Existe em **cada schema** (app + cada mun_<ibge>). Serve como catalogo
de todos os arquivos armazenados no S3.

### Colunas

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| `id` | UUID v7 | Chave primaria, ordenavel por tempo |
| `storage_key` | VARCHAR(500) | Path completo no S3 (ex: `mun_5208707/patients/uuid/photos/uuid.jpg`) |
| `original_name` | VARCHAR(300) | Nome original do arquivo enviado pelo usuario |
| `mime_type` | VARCHAR(100) | Tipo MIME (ex: `image/jpeg`, `application/pdf`) |
| `size_bytes` | INTEGER | Tamanho em bytes |
| `checksum_sha256` | VARCHAR(64) | Hash SHA256 para verificacao de integridade |
| `category` | VARCHAR(50) | Categoria do arquivo (ver abaixo) |
| `entity_id` | UUID (nullable) | ID da entidade relacionada (patient_id, import_id, etc.) |
| `context` | TEXT (nullable) | Texto livre — resultado de analise de IA, extracao OCR, descricao, etc. |
| `uploaded_by` | UUID (nullable) | ID do usuario que fez upload |
| `uploaded_by_name` | VARCHAR(200) | Nome do usuario (snapshot) |
| `created_at` | TIMESTAMP | Data de criacao |
| `updated_at` | TIMESTAMP | Data de ultima atualizacao |

### Categorias

| Categoria | Descricao | Schema |
|-----------|-----------|--------|
| `patient_photo` | Foto do paciente | tenant |
| `patient_document` | Documento digitalizado (RG, CNH, etc.) | tenant |
| `cnes_import` | ZIP de importacao CNES | tenant |
| `sigtap_import` | ZIP de importacao SIGTAP | app |
| `logo` | Logo do municipio/unidade | app |
| `export` | Relatorio exportado | app/tenant |

### Coluna `context`

Campo TEXT sem limite. Armazena resultado de processamento de IA associado
ao arquivo. Exemplos de uso:

- **OCR de documento:** texto extraido de um RG/CNH escaneado
- **Descricao de foto:** analise de IA descrevendo a imagem
- **Transcricao:** audio/video transcrito para texto
- **Extracao estruturada:** dados JSON extraidos de um documento

O campo e preenchido de forma assincrona — o upload salva o arquivo e
a analise de IA roda em background, atualizando o `context` quando pronta.

## StorageService (API Python)

```python
from app.services.storage import get_storage

storage = get_storage()

# Upload
await storage.upload("mun_5208707/photo.jpg", bytes_data, "image/jpeg")

# Download
data = await storage.download("mun_5208707/photo.jpg")

# URL temporaria (expira em 1h por default)
url = await storage.presigned_url("mun_5208707/photo.jpg", expires=3600)

# Deletar
await storage.delete("mun_5208707/photo.jpg")

# Verificar existencia
exists = await storage.exists("mun_5208707/photo.jpg")
```

## Fluxo de Upload de Foto

```
1. Frontend envia POST /api/v1/hsp/patients/{id}/photo (multipart)
2. Backend le bytes do upload
3. Calcula SHA256
4. Upload para S3: mun_{ibge}/patients/{patient_id}/photos/{photo_id}.jpg
5. INSERT em files (catalogo com storage_key, metadata)
6. INSERT em patient_photos (referencia file_id + storage_key)
7. Face enrollment automatico (bytes ja em memoria)
8. Retorna PatientRead com status do enrollment
```

## Fluxo de Download de Foto

```
1. Frontend faz GET /api/v1/hsp/patients/{id}/photo
2. Backend busca patient_photos.storage_key
3. Se storage_key preenchido: baixa do S3
4. Se storage_key vazio (legado): le content do banco
5. Retorna Response com bytes + Content-Type
```

## Docker

O MinIO sobe automaticamente com `docker compose up`. O bucket `zsaude-files`
e criado pelo servico `minio-init` na primeira execucao.

```yaml
services:
  minio:
    image: minio/minio:latest
    ports:
      - "9002:9000"   # API S3
      - "9003:9001"   # Console Web
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
```

## AWS S3 (Producao)

Para usar AWS S3 em producao:

1. Criar bucket S3 (ex: `zsaude-prod-files`)
2. Criar IAM user com policy:
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
3. Configurar envs:
   ```env
   STORAGE_ENDPOINT=
   STORAGE_ACCESS_KEY=AKIA...
   STORAGE_SECRET_KEY=...
   STORAGE_BUCKET=zsaude-prod-files
   STORAGE_REGION=sa-east-1
   ```

Nenhuma mudanca de codigo necessaria — o StorageService detecta automaticamente.
