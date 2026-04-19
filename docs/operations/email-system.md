# Sistema de e-mail — runbook de deploy e operação

Cobre o que precisa rodar em produção pra que o sistema de e-mail funcione
bem: provisionamento do SES, CronJob de parabéns, variáveis de ambiente e
monitoramento. Não substitui o plano de roadmap (memória do projeto); foca
em "o que apertar em qual ordem quando formos pra prod".

> Estado atual (`importacao-cnes` branch): código das 7 PRs do sistema de
> e-mail está merged. Ainda **não há** infra em prod — este doc é o que
> tem que ser feito na primeira ida ao ar.

---

## 1. Pré-flight AWS SES

### 1.1 Rotacionar a IAM key vazada

A access key `AKIA4PFZML5DZ2EUNUOX` foi colada em chat e vive em
transcripts. Antes de qualquer coisa:

1. Console IAM → Users → usuário da integração SES → Security credentials
2. **Make inactive** na key antiga → **Delete** depois de confirmar que não
   está em uso em lugar nenhum
3. **Create access key** → gera par novo
4. A secret só aparece **uma vez**; guarde num vault/parameter store
   (AWS Secrets Manager, k8s Secret, 1Password, etc.) — nunca no git

### 1.2 Permissões IAM mínimas do usuário

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ses:SendEmail",
        "ses:SendRawEmail",
        "ses:GetSendQuota",
        "ses:GetSendStatistics"
      ],
      "Resource": "*"
    }
  ]
}
```

Não dê `ses:*` — a política acima cobre envio e métricas sem permitir,
por exemplo, deletar identidades verificadas.

### 1.3 Verificar domínio remetente

1. SES Console → Verified identities → Create identity
2. Type: **Domain**. Nome: o domínio em `EMAIL_FROM` (ex.: `zsaude.com.br`)
3. Ativar **DKIM signing** (Easy DKIM, 3 registros CNAME que o SES gera)
4. Publicar os CNAMEs no DNS do domínio + registro SPF (`v=spf1 include:amazonses.com ~all`)
5. Aguardar "Verification status: Verified" — costuma levar alguns minutos

### 1.4 Sair do sandbox

Contas novas SES ficam em sandbox e só enviam pra endereços verificados.
Para prod:

1. SES Console → Account dashboard → "Request production access"
2. Preencher caso de uso, política de bounce/complaint (como tratar), taxa
   média de envio (parabéns + reset ≈ baixo volume; não precisa limite alto)
3. Resposta da AWS em 24h-48h tipicamente

Enquanto o ticket não é aprovado, staging pode rodar em sandbox **com a
caixa dos testadores pré-verificada**.

### 1.5 Configuration Set (opcional mas recomendado)

Configuration Sets dão tracking de bounces e complaints via SNS.

1. SES Console → Configuration sets → Create set (nome: `zsaude-prod`)
2. Event destinations → SNS topic → `ses-bounces-complaints`
3. Subscrever um endpoint (e-mail de ops, Slack webhook) ao SNS
4. Setar `SES_CONFIGURATION_SET=zsaude-prod` no `.env` de prod

Sem isso, bounces viram silêncio — dá pra funcionar, mas perde dado
importante pra limpeza de base.

---

## 2. Variáveis de ambiente em prod

```ini
# Backend genérico
EMAIL_BACKEND=ses
EMAIL_FROM=nao-responder@zsaude.com.br
EMAIL_FROM_NAME=zSaúde
APP_PUBLIC_URL=https://app.zsaude.com.br

# SES
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<rotacionar antes, armazenar no vault>
AWS_SECRET_ACCESS_KEY=<idem>
SES_CONFIGURATION_SET=zsaude-prod

# Verificação de e-mail
EMAIL_VERIFICATION_TTL_HOURS=24
ENFORCE_EMAIL_VERIFICATION_LOGIN=false   # ver §5 sobre quando virar True
```

Nunca commite `.env` de prod. Em k8s, vira `Secret`; em docker compose de
prod, vira arquivo fora do repo (`--env-file /opt/zsaude/.env`).

---

## 3. CronJob de parabéns

### 3.1 O que roda

`python -m scripts.send_birthday_emails` itera todos os municípios e,
pros que estão na janela `08:00-08:59` no **fuso local**, dispara parabéns
de nascimento e aniversário de cadastro pros usuários elegíveis.

- Idempotência: chave `{code}:{user_id}:{year}:{scope}` na tabela
  `email_send_log`. Rodar duas vezes no mesmo dia não gera duplicata.
- Fuso: `Municipality.timezone` (ver PR 4). Default `America/Sao_Paulo`.
- Regras: só `status='Ativo'` e `email_verified_at IS NOT NULL`.
- Multi-vínculo: municípios com template customizado ganham instância
  personalizada; os sem customização consolidam num só envio genérico
  (o "município canônico" é o de menor UUID entre os do usuário).

### 3.2 Frequência recomendada

**Hora em hora**. A janela de 60 min dentro do runner garante que o
disparo acontece em 08:XX locais mesmo se o scheduler tiver drift de
alguns minutos. Rodar mais frequente (15 min) é desperdício — idempotência
protege, mas cada rodada ainda varre N municípios × M usuários.

### 3.3 Manifesto k8s CronJob

Quando for ao ar:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: zsaude-birthday-emails
  namespace: zsaude
spec:
  # Roda no minuto 5 de cada hora (evita colidir com outros jobs do :00).
  schedule: "5 * * * *"
  concurrencyPolicy: Forbid          # se o job anterior não terminou, pula
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 5
  jobTemplate:
    spec:
      backoffLimit: 2                # retry de erro transitório
      activeDeadlineSeconds: 1800    # 30 min, mais que suficiente
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: runner
              image: <registry>/zsaude-backend:<tag>   # mesma imagem do app
              command:
                - /app/.venv/bin/python
                - -m
                - scripts.send_birthday_emails
              envFrom:
                - secretRef:
                    name: zsaude-backend-env
              resources:
                requests:
                  cpu: "100m"
                  memory: "256Mi"
                limits:
                  cpu: "500m"
                  memory: "512Mi"
```

Pontos:

- **Mesma imagem do app** — assim toda mudança de schema/template vai
  junto. Não crie imagem separada só pro runner.
- **`concurrencyPolicy: Forbid`** — se um job trava por algum motivo, o
  próximo não acumula em cima.
- **`envFrom.secretRef`** — as creds SES + DB URL ficam no Secret do app;
  não duplique. O CronJob usa o mesmo.
- **Memória**: o runner não carrega InsightFace; 256Mi sobra.

### 3.4 Alternativa: systemd timer (VM única)

Se o deploy for numa VM só (sem k8s), use timer do systemd:

```ini
# /etc/systemd/system/zsaude-birthday.service
[Unit]
Description=zSaude birthday email runner
After=network.target

[Service]
Type=oneshot
User=zsaude
WorkingDirectory=/opt/zsaude/backend
EnvironmentFile=/opt/zsaude/backend/.env
ExecStart=/opt/zsaude/backend/.venv/bin/python -m scripts.send_birthday_emails

# /etc/systemd/system/zsaude-birthday.timer
[Unit]
Description=Dispara zsaude-birthday.service de hora em hora

[Timer]
OnCalendar=*-*-* *:05:00
Persistent=true
Unit=zsaude-birthday.service

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now zsaude-birthday.timer
sudo systemctl list-timers zsaude-birthday.timer
```

`Persistent=true` roda imediatamente depois de um boot se o disparo foi
perdido durante downtime. Combina com a idempotência — não reenvia se já
mandou no ciclo correto.

### 3.5 Alternativa: docker compose (dev/homologação)

Não roda em produção, mas pra smoke em staging:

```yaml
# docker-compose.staging.yml (adicional ao docker-compose.yml)
services:
  birthday-runner:
    image: zsaude-backend:latest
    command: /app/.venv/bin/python -m scripts.send_birthday_emails
    env_file: .env
    profiles: ["oneshot"]
```

```bash
docker compose --profile oneshot run --rm birthday-runner
```

Junto com um cron no host:

```
5 * * * * cd /opt/zsaude/backend && docker compose --profile oneshot run --rm birthday-runner >> /var/log/zsaude/birthday.log 2>&1
```

---

## 4. Monitoramento

### 4.1 Métricas rápidas via SQL

```sql
-- Envios por template no último dia
SELECT template_code, status, count(*)
FROM app.email_send_log
WHERE sent_at >= now() - interval '1 day'
GROUP BY 1, 2
ORDER BY 1, 2;

-- Taxa de falha por template (últimos 7 dias)
SELECT template_code,
       count(*) FILTER (WHERE status='sent')   AS sent,
       count(*) FILTER (WHERE status='failed') AS failed,
       round(100.0 * count(*) FILTER (WHERE status='failed') / count(*), 2) AS fail_pct
FROM app.email_send_log
WHERE sent_at >= now() - interval '7 days'
GROUP BY template_code;

-- Últimos erros
SELECT sent_at, template_code, to_address, error
FROM app.email_send_log
WHERE status='failed'
ORDER BY sent_at DESC
LIMIT 20;

-- Aniversariantes já processados hoje
SELECT count(*) FROM app.email_send_log
WHERE template_code IN ('birthday_birth','birthday_usage')
  AND sent_at::date = current_date;
```

### 4.2 Alertas recomendados

- **Taxa de falha > 2% em 1h** pra qualquer template → SES problema ou
  template quebrado
- **CronJob falhou > 2 vezes seguidas** → alguma coisa no runner
  (conectividade, schema, permissão) — `kubectl get events` ou
  `journalctl -u zsaude-birthday.timer`
- **Fila SNS de bounces** (se ativo) → digest diário pra inbox de ops

### 4.3 Dashboard Grafana (quando houver)

Painel por `template_code`, cortando por `status`. Prometheus não tem
métrica nativa hoje — se precisar, exporta via endpoint `/metrics`
lendo de `email_send_log`.

---

## 5. Quando virar `ENFORCE_EMAIL_VERIFICATION_LOGIN=true`

Hoje default é `false` — login por e-mail funciona mesmo sem verificação,
só CPF fica blindado. Pra virar:

1. **Backfill**: rodar script one-off que, pros usuários existentes com
   e-mail cadastrado, dispara verificação ou marca como `email_verified_at
   = now()` se a base já foi validada por outro canal (decisão a alinhar
   com o dono do produto — ver memória do projeto).
2. **Aviso aos usuários**: e-mail em massa / banner na tela de "Minha
   Conta" pedindo pra confirmar antes do flip.
3. **Janela de graça**: 1-2 semanas depois do aviso.
4. **Flip**: muda `ENFORCE_EMAIL_VERIFICATION_LOGIN=true` no Secret e
   redeploy. Login via e-mail sem verificação passa a retornar 401 com
   mensagem específica; CPF continua sempre válido como escape hatch.

Mais fácil inverter depois se der ruim do que ligar direto sem aviso.

---

## 6. Runbook: problemas comuns

### "Parabéns não chegou pra aniversariante X"

1. `SELECT email_verified_at, status, birth_date FROM app.users WHERE ...`
   — checar se `status='Ativo'` e `email_verified_at IS NOT NULL`.
2. `SELECT * FROM app.email_send_log WHERE user_id=:id AND template_code='birthday_birth'`
   — ver se o dispatcher nem tentou (nenhuma linha), falhou (status=failed)
   ou pulou (skipped por idempotência — inclui se rodou em ano anterior
   errado).
3. Se `FacilityAccess` do usuário está no município certo? O runner só vê
   usuários vinculados a pelo menos uma unidade do município.
4. Fuso do município está correto? `SELECT timezone FROM app.municipalities
   WHERE id=...`.

### "Taxa de bounce subiu"

1. Checar SNS topic de complaints (se configuration set ativo).
2. `SELECT to_address, count(*) FROM app.email_send_log WHERE status='failed'
   GROUP BY 1 ORDER BY 2 DESC LIMIT 20` — endereços recorrentes são
   candidatos a purgar da base (ou marcar como inválidos).
3. Se bounce-rate ultrapassar 5%, a AWS pode suspender o envio. Agir
   antes: limpar lista, desabilitar features que mandam pra base suja.

### "Template renderizou com variável literal `{{foo}}`"

O editor valida variáveis conhecidas antes de salvar, mas alguém pode ter
inserido via SQL direto. Conferir:

```sql
SELECT code, scope_type, subject, body_text FROM app.email_templates
WHERE subject LIKE '%{{%' OR body_text LIKE '%{{%';
```

Qualquer `{{...}}` que bata com o nome de variável do catálogo renderiza
normal. Se ficou literal, o nome está fora do catálogo → editar pelo
`/sys/templates-email`.

---

## 7. Checklist de ida ao ar (quando for hora)

- [ ] IAM key rotacionada; a vazada está desativada/deletada
- [ ] Domínio verificado no SES (DKIM + SPF no DNS)
- [ ] Ticket de saída de sandbox aprovado (ou conta já estava)
- [ ] Configuration set `zsaude-prod` criado com destino SNS
- [ ] Secret `zsaude-backend-env` com `EMAIL_BACKEND=ses` + creds
- [ ] Migration `0038_email_send_log` aplicada em prod
- [ ] CronJob/Timer apontado pra imagem `:<tag>` atual
- [ ] Smoke test: `kubectl create job --from=cronjob/zsaude-birthday-emails smoke-001`
      (ou `systemctl start zsaude-birthday.service`) e inspecionar
      `email_send_log` + logs
- [ ] Alerta de falha > 2%/h cadastrado no APM
- [ ] Runbook acima linkado no canal de on-call
