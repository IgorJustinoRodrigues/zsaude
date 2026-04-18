

# Checklist de Deploy — Produção Oracle

Guia passo a passo dos cuidados **antes**, **durante** e **depois** do
primeiro deploy do zSaúde em Oracle Database 23ai. Complementa o
[`oracle-production.md`](./oracle-production.md) (runbook operacional).

> **Público**: responsáveis pelo deploy (DevOps + DBA + tech lead).
> **Pressuposto**: leitor já leu os docs de portabilidade e runbook.

---

## Sumário

1. [1 semana antes](#1-semana-antes-do-deploy)
2. [1 dia antes](#1-dia-antes-do-deploy)
3. [Durante o deploy](#durante-o-deploy)
4. [Primeira hora pós-deploy](#primeira-hora-pós-deploy)
5. [Primeira semana](#primeira-semana-pós-deploy)
6. [Rollback](#rollback)
7. [Incidentes comuns](#incidentes-comuns)

---

## 1 semana antes do deploy

### Infraestrutura Oracle

- [ ] **Versão do banco**: confirmar `SELECT banner FROM v$version` ≥
      **23.4** (AI Vector Search exige 23ai+).
- [ ] **PDB criado** (não usar CDB root). Ex: `FREEPDB1`, `ZSAUDE_PRD`.
- [ ] **Character set**: `AL32UTF8` (necessário pra nomes com acento).
      ```sql
      SELECT value FROM nls_database_parameters WHERE parameter = 'NLS_CHARACTERSET';
      ```
- [ ] **Tablespace `USERS`** com espaço disponível ≥ 50GB pra cada
      município grande (cálculo aproximado: 30k pacientes × 1MB média
      de foto + embeddings + histórico).
- [ ] **`VECTOR_MEMORY_SIZE`** definido se for usar HNSW (hoje o adapter
      usa IVF/NEIGHBOR PARTITIONS que não exige, mas avalie):
      ```sql
      ALTER SYSTEM SET VECTOR_MEMORY_SIZE = 2G SCOPE=SPFILE;
      -- restart necessário
      ```
- [ ] **Parâmetros de sessão**:
      - `open_cursors` ≥ 1000 (pool SQLAlchemy usa bastante)
      - `processes` ≥ 300 (20 workers × 10 conexões + overhead)

### Usuários e grants (DBA)

- [ ] Criar usuário **admin** (`APP`) com grants completos:
      ```sql
      CREATE USER APP IDENTIFIED BY <senha_forte>
          DEFAULT TABLESPACE users
          QUOTA UNLIMITED ON users;

      GRANT CONNECT, RESOURCE, UNLIMITED TABLESPACE TO APP;
      GRANT CREATE USER, ALTER USER, DROP USER TO APP;
      GRANT CREATE ANY TABLE, ALTER ANY TABLE, DROP ANY TABLE TO APP;
      GRANT INSERT ANY TABLE, UPDATE ANY TABLE, DELETE ANY TABLE, SELECT ANY TABLE TO APP;
      ```

- [ ] Criar **package `ZSAUDE.ZSAUDE_CTX_PKG`** (opcional mas
      recomendado pra auditoria completa — ver script em
      `oracle-production.md`).

- [ ] **Senha admin** num secret manager (Vault, AWS Secrets Manager,
      etc.) — **não** em `.env` commitado.

- [ ] **Backup strategy definida e testada**:
      - RMAN full semanal + incremental diário
      - Data Pump (`expdp APP/...`) diário como segundo nível
      - **Teste o restore** antes do deploy (mais importante que o backup em si)
      - Flashback Database habilitado com janela ≥ 48h

### Ambiente e código

- [ ] `.env` de produção com `DATABASE_URL=oracle+oracledb://app:...` (via
      secret manager, não em plaintext).
- [ ] Imagem Docker do app testada em staging Oracle real (não só dev).
- [ ] `backend/secrets/jwt_private.pem` montado como volume read-only
      (ou secret Kubernetes).
- [ ] **Testes de paridade passando** localmente:
      ```bash
      backend/scripts/test_oracle.sh
      ```
- [ ] **CI com Oracle container** configurado no pipeline (job separado
      por custo, mas obrigatório antes de merge em `main`).

### Observabilidade

- [ ] Logs estruturados sendo coletados (Loki / ELK / CloudWatch). Eventos
      críticos a filtrar:
      - `seed_applied`
      - `app_schema_created`
      - `tenant_tables_created_oracle` / `tenant_schema_evolved`
      - `schema_add_column` / `schema_modify_column`
      - `schema_version_recorded`
- [ ] Métricas Prometheus do backend expostas (`/metrics`).
- [ ] Alertas configurados:
      - Erro Oracle (`ORA-*`) em log
      - Conexões no pool > 80%
      - Tempo de query p99 > 500ms
      - Falha em health check por > 1min

---

## 1 dia antes do deploy

### Dry-run em staging

- [ ] Staging com **mesmo** Oracle que produção (versão + grants + parâmetros).
- [ ] Rodar provision completo:
      ```python
      await provision_app_schema(engine(), apply_seeds=True)
      ```
- [ ] Validar contagens esperadas:
      ```sql
      SELECT 'system_settings' tbl, COUNT(*) n FROM APP.SYSTEM_SETTINGS UNION ALL
      SELECT 'ref_nacionalidades', COUNT(*) FROM APP.REF_NACIONALIDADES UNION ALL
      SELECT 'ref_etnias', COUNT(*) FROM APP.REF_ETNIAS UNION ALL
      SELECT 'ref_logradouros', COUNT(*) FROM APP.REF_LOGRADOUROS UNION ALL
      SELECT 'ai_providers', COUNT(*) FROM APP.AI_PROVIDERS UNION ALL
      SELECT 'roles', COUNT(*) FROM APP.ROLES UNION ALL
      SELECT 'permissions', COUNT(*) FROM APP.PERMISSIONS;
      ```

      Valores esperados: settings≥8, nacionalidades≥332, etnias≥406,
      logradouros≥129, ai_providers≥3, roles≥8, permissions≥32.

- [ ] Provisionar 1 tenant de teste:
      ```python
      await ensure_municipality_schema(s, "5208707", apply_migrations=True)
      ```
- [ ] Validar no DBeaver: tabelas criadas, FKs resolvem, índice vetor criado.
- [ ] Testar endpoints críticos (login, listar usuários, upload foto,
      match-face).

### Preparação de dados

- [ ] Se migrando de outro sistema, **dry-run do ETL** em staging.
- [ ] Validação de **tipos e tamanhos** dos dados importados
      (principalmente strings com `""` → Oracle trata como NULL —
      o hook já converte, mas verificar).
- [ ] **Checksum** do volume esperado (pacientes, usuários, etc.)
      antes/depois pra auditoria.

### Comunicação

- [ ] **Janela de manutenção** anunciada aos usuários (mesmo que curta).
- [ ] **Canal de on-call** definido (Slack, PagerDuty, etc.).
- [ ] **DBA de plantão** confirmado para o horário do deploy.
- [ ] **Plano de rollback** revisado pela equipe (ver [seção abaixo](#rollback)).

---

## Durante o deploy

### Ordem das operações

Siga **estritamente** nesta sequência:

1. [ ] **Snapshot do banco atual** (se migração de outro sistema):
       ```bash
       expdp APP/... schemas=APP dumpfile=pre_deploy_YYYYMMDD.dmp
       ```

2. [ ] **Desabilitar acesso de escrita** ao sistema antigo (readonly ou
       manutenção) — evita inconsistência durante migração.

3. [ ] **Deploy do container backend** com novo `DATABASE_URL` apontando
       pro Oracle (mas app **ainda não deve receber tráfego**).

4. [ ] **Provisionar schema app**:
       ```python
       # Executar via script standalone, não pela API
       python -c "
       import asyncio
       from app.db.session import engine
       from app.db.provisioning import provision_app_schema
       asyncio.run(provision_app_schema(engine(), apply_seeds=True))
       "
       ```
       - Saída esperada: `{'dialect': 'oracle', 'system_settings': 8,
         'reference_tables': 973, 'ai_catalog': 15+, 'fingerprint': '...'}`
       - **Se falhar**: **não seguir** — investigar logs antes.

5. [ ] **Verificar `APP.SCHEMA_VERSION`**:
       ```sql
       SELECT id, fingerprint, table_count, applied_at FROM APP.SCHEMA_VERSION;
       ```
       Deve ter uma linha `id='app'`.

6. [ ] **Provisionar tenants** (municípios) em sequência:
       ```python
       await ensure_municipality_schema(session, ibge, apply_migrations=True)
       ```
       Para cada município. Espera: 1 linha `id='mun_<ibge>'` em
       `APP.SCHEMA_VERSION`.

7. [ ] **Importação de dados** (se migrando):
       - Começar por tabelas sem FK (users, municipalities)
       - Depois dependentes (facility_accesses, patients)
       - Usar `adapter.execute_upsert` nos scripts de import
       - Validar contagens pós-import

8. [ ] **Habilitar tráfego** (load balancer / DNS):
       - Primeiro 10% (canary)
       - Monitorar logs e métricas por 15min
       - Se OK, 50% e depois 100%

9. [ ] **Reabilitar escrita** do sistema antigo em modo read-only final
       (pra consulta se precisar comparar) — não apagar por 30 dias.

### Validações em cada passo

Após cada etapa, rodar:

```sql
-- Conexão e contexto
SELECT USER, SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA'), SYSDATE FROM dual;

-- Saúde do app
SELECT COUNT(*) FROM APP.SCHEMA_VERSION;

-- Últimas operações registradas
SELECT id, table_count, applied_at
  FROM APP.SCHEMA_VERSION
 ORDER BY applied_at DESC
 FETCH FIRST 5 ROWS ONLY;
```

No lado do backend:
```bash
curl http://<host>:<port>/health
# Esperado: 200 OK
```

---

## Primeira hora pós-deploy

### Smoke tests obrigatórios

- [ ] **Login** de um usuário master (via API, não UI):
      ```bash
      curl -X POST https://app.exemplo.com/api/v1/auth/login \
        -H "Content-Type: application/json" \
        -d '{"login":"admin.global","password":"***"}'
      # Esperado: 200 + accessToken
      ```

- [ ] **Seleção de contexto** (se não-master):
      ```bash
      curl -X POST .../work-context/select -H "Authorization: Bearer ..." \
        -d '{"municipalityId":"...","facilityId":"..."}'
      ```

- [ ] **Listar pacientes** de 1 município:
      ```bash
      curl .../api/v1/hsp/patients -H "Authorization: ..." -H "X-Work-Context: ..."
      # Esperado: 200 + lista paginada
      ```

- [ ] **Criar paciente** de teste (deletar depois):
      ```bash
      curl -X POST .../api/v1/hsp/patients ... -d '{...}'
      # Esperado: 201 + paciente criado
      ```

- [ ] **Upload de foto** com rosto real:
      - Upload → MinIO/S3 recebeu arquivo
      - `patient_photos.file_id` preenchido
      - `patient_face_embeddings` registrado com `detection_score > 0`

- [ ] **Match-face** com foto parecida:
      ```bash
      curl -X POST .../api/v1/hsp/patients/match-face ...
      # Esperado: 200 + lista de candidatos com similarity
      ```

- [ ] **Endpoint de IA** (se configurado):
      ```bash
      curl -X POST .../api/v1/ai/operations/summarize ...
      # Esperado: 200 + resposta do modelo
      # Em APP.AI_USAGE_LOGS aparece 1 linha nova
      ```

### Métricas a observar (primeira hora)

Acompanhar no Grafana / dashboard:

- [ ] **Taxa de erro HTTP** < 1% (excluindo 401/403 esperados)
- [ ] **Latência p95** de `/health` < 50ms
- [ ] **Latência p95** de endpoints CRUD < 500ms
- [ ] **Pool de conexões** < 70% ocupação
- [ ] **Nenhum `ORA-*`** em log (exceto `ORA-06550`/`ORA-04063` do package
      opcional, que é silenciado)
- [ ] **Nenhum `Exception`** não tratada

### Logs esperados no startup

Você **deve** ver:

```
startup                       env=prod api_prefix=/api/v1
app_schema_created            dialect=oracle duration_ms=<N>
schema_version_recorded       schema_id=app fingerprint=<hash>
rbac_sync_ok                  permissions=32 system_roles=8 settings_loaded=8
Application startup complete.
```

Se faltar qualquer um → investigar antes de liberar tráfego.

---

## Primeira semana pós-deploy

### Monitorar crescimento

- [ ] **Tamanho do tablespace `USERS`**:
      ```sql
      SELECT tablespace_name, ROUND(used_space * 8192 / 1024/1024, 2) AS used_mb,
             ROUND(tablespace_size * 8192 / 1024/1024, 2) AS total_mb
        FROM dba_tablespace_usage_metrics
       WHERE tablespace_name = 'USERS';
      ```

- [ ] **Top 20 tabelas por tamanho**:
      ```sql
      SELECT segment_name, bytes/1024/1024 AS mb
        FROM dba_segments
       WHERE owner IN ('APP') OR owner LIKE 'MUN\_%' ESCAPE '\'
       ORDER BY bytes DESC FETCH FIRST 20 ROWS ONLY;
      ```

- [ ] **Crescimento diário de `ai_usage_logs`** (fica grande rápido se
      usa IA):
      ```sql
      SELECT TRUNC(at), COUNT(*)
        FROM APP.AI_USAGE_LOGS
       GROUP BY TRUNC(at) ORDER BY 1 DESC FETCH FIRST 7 ROWS ONLY;
      ```
      Se estiver crescendo > 10k linhas/dia, avaliar partição por data.

### Validar seeds idempotentes

Re-provisionar é **seguro** — não deve criar duplicatas. Teste:
```python
await provision_app_schema(engine(), apply_seeds=True)
```

Comparar `APP.SYSTEM_SETTINGS.id` antes/depois — deve ser o mesmo conjunto
(ids regenerados só em INSERT, não em UPDATE).

### Backups testados

- [ ] Rodar restore de teste de 1 backup num ambiente isolado
      (não prod) **antes de precisar**. Restore não testado é restore
      que provavelmente vai falhar.

### Auditoria

- [ ] `APP.AUDIT_LOGS` está recebendo eventos? Se não, checar se
      `ZSAUDE.ZSAUDE_CTX_PKG` foi instalado.
- [ ] Eventos sensíveis (login, delete de paciente, exportação) aparecem?

---

## Rollback

### Quando rollback?

Execute rollback se em **qualquer momento das primeiras 2 horas**:
- Taxa de erro HTTP > 10% sustentada por > 5min
- `ORA-*` crítico (tipo ORA-00600, ORA-01555) em produção
- Dados corrompidos (contagens inesperadas, seeds divergentes)
- Pool de conexões esgotado sem recuperação

### Passo a passo

1. [ ] **Desabilitar tráfego** imediatamente (load balancer → manutenção).

2. [ ] **Voltar** a configuração do backend pro banco antigo (se
       migração) ou pra versão anterior do app:
       ```bash
       # Rollback de imagem
       docker service update --image zsaude-backend:<versao_anterior> ...
       # ou via Helm / kustomize / k8s manifest anterior
       ```

3. [ ] **Se Oracle foi do zero** e algo quebrou:
       ```sql
       -- Salva dados pra análise (não apaga)
       CREATE USER APP_FAIL_<DATA> IDENTIFIED BY <senha>;
       -- Transfere ownership OU exporta via Data Pump
       expdp APP/... schemas=APP dumpfile=failed_deploy_YYYYMMDD.dmp

       -- Dropa e recria limpo (se vai tentar de novo)
       DROP USER APP CASCADE;
       -- Segue pré-requisitos DBA pra recriar
       ```

4. [ ] **Habilitar tráfego** de volta no sistema antigo.

5. [ ] **Post-mortem** nas próximas 24h:
       - Linha do tempo do incidente
       - Dados salvos do `expdp` pra análise
       - Causa raiz
       - Ação corretiva

### Rollback de schema change (ex: coluna nova não funcionou)

Se o problema é uma coluna adicionada por `auto_evolve`:

```sql
ALTER TABLE <TABELA> DROP COLUMN <COLUNA>;
```

Depois ajustar o model e rodar provision novamente (o fingerprint em
`APP.SCHEMA_VERSION` vai atualizar).

---

## Incidentes comuns

### `ORA-01017: invalid username/password`

- Senha errada no `DATABASE_URL` ou rotacionada sem atualizar o secret.
- Ação: verificar secret manager e pod/container variable.

### `ORA-01017` imediato no startup, mas local funcionava

- Provável conexão via `wallet` / TLS em prod vs. plain em dev.
- Ação: validar `DATABASE_URL` com parâmetros TCPS/wallet.

### Pool de conexões exaurido

- Logs: `QueuePool limit of size N overflow M reached, connection timed out`
- Ação:
  1. Verificar `open_cursors` no Oracle (pode estar baixo)
  2. Verificar leaks de sessão (query não finalizada, transação aberta)
  3. Aumentar `pool_size` no `create_engine` temporariamente

### `ORA-00600 / ORA-07445` (bugs internos do Oracle)

- São bugs do próprio banco. **Não é culpa do app**.
- Ação: abrir ticket Oracle Support + trace files (DBA coleta).
- Workaround: restart do PDB resolve muitas vezes.

### Provisioning do tenant falhando com `ORA-01031`

- User admin (APP) sem algum grant.
- Ação: revisar checklist "Pré-requisitos DBA" — faltou algum `GRANT`.

### Schema version sumiu ou corrompeu

- `SELECT COUNT(*) FROM APP.SCHEMA_VERSION` retorna 0 ou erro.
- Ação:
  ```python
  # Rodar novamente — a função recria a tabela se faltar
  await provision_app_schema(engine(), apply_seeds=False)
  ```

### Seed com contagem divergente entre PG e Oracle

- Migration Alembic PG foi editada sem atualizar `app/db/seeds/`.
- Ação:
  1. Rodar teste de paridade local pra confirmar
  2. Sincronizar o seed Python com a migration
  3. Rodar provision de novo (upsert idempotente corrige)

### `ORA-12505: SID not registered`

- Conectando com SID em vez de Service Name.
- Ação: no `DATABASE_URL`, usar `?service_name=XXX`, não `:XXX`.

Mais incidentes em [`database-patterns.md`](./database-patterns.md)
(seção "Índice de referência rápida").

---

## Sinalizações de que o deploy está saudável

Após 1 semana, confirmar:

- [ ] Zero `ORA-00600` ou `ORA-07445` em log
- [ ] 100% dos tenants provisionados aparecem em `APP.SCHEMA_VERSION`
- [ ] `fingerprint` igual em todos os tenants (mesmo schema dos models)
- [ ] `ai_usage_logs` crescendo conforme uso esperado
- [ ] Backups diários rodando + um restore de teste feito
- [ ] Métricas Prometheus estáveis (sem alertas disparando)
- [ ] Nenhum ticket de "não consigo fazer login" ou "dado sumiu"

**Parabéns — produção em Oracle no ar.**

---

## Documentos relacionados

- [`database-portability.md`](./database-portability.md) — Tipos, adapter,
  fluxos conceituais.
- [`database-patterns.md`](./database-patterns.md) — Padrões de código
  pra novos devs + armadilhas comuns.
- [`oracle-production.md`](./oracle-production.md) — Runbook operacional
  do dia a dia (adicionar tenant, evoluir schema, queries úteis).
