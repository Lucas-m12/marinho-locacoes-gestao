# Rotina de operação

Os comandos com `docker compose` rodam na VPS, dentro de `/opt/marinho`:

```bash
ssh deploy@IP_DA_VPS
cd /opt/marinho
```

| Arquivo em `/opt/marinho` | O que é | Quem mantém |
| --- | --- | --- |
| `docker-compose.yml` | cópia de `deploy/docker-compose.prod.yml` | o workflow Deploy, a cada deploy |
| `Caddyfile` | cópia de `deploy/Caddyfile` | o workflow Deploy |
| `deploy.sh` | cópia de `deploy/deploy.sh` | o workflow Deploy |
| `.env` | segredos e `IMAGE_TAG` | você (e o `deploy.sh`, só a linha `IMAGE_TAG`) |
| `.previous-image-tag` | versão anterior, para o rollback | o `deploy.sh` |

Mudanças no compose ou no Caddyfile se fazem no repositório; o próximo deploy leva para a VPS. Editar direto na VPS funciona até o próximo deploy, que sobrescreve.

Para ver o que está rodando: `docker compose ps`.

## Deploy

**Normal:** push (ou merge) na `main`. O CI roda e, verde, o workflow **Deploy** publica a API e depois o front. Acompanhe em **Actions**.

**Sem commit novo:** Actions → **Deploy** → **Run workflow** (na `main`).

**À mão, na VPS** (para uma versão que já está no GHCR):

```bash
./deploy.sh sha-0123456789ab
```

Se a imagem não estiver na VPS, ele precisa baixar do GHCR. O workflow faz login sozinho; à mão, crie um token clássico no GitHub com só `read:packages` e rode `docker login ghcr.io -u Lucas-m12` antes (e `docker logout ghcr.io` depois).

O `deploy.sh` faz, na ordem: baixa a imagem, roda `prisma migrate deploy`, sobe `server` e `jobs`, espera o `/health` ficar saudável por até 2 minutos e, se não ficar, volta sozinho para a versão anterior.

## Rollback

**API, para a versão anterior ao último deploy:**

```bash
./deploy.sh rollback
```

Não roda migrations. Rodar de novo alterna entre as duas últimas versões.

**API, para uma versão específica:** `./deploy.sh sha-<commit>`. Lista das versões: aba **Packages** do repositório no GitHub, ou `docker image ls` na VPS (o deploy guarda a atual e a anterior).

**Front:** o caminho normal é `git revert` do commit na `main`, que passa pelo CI e pelo Deploy. Numa emergência: painel da Cloudflare → **Workers & Pages** → o worker do `web` → **Deployments** → escolha a versão anterior → **Rollback**. O próximo deploy pelo GitHub substitui.

**Migrations não voltam.** Voltar a API para uma versão antiga deixa o banco como está. Por isso, toda migration precisa funcionar com a versão anterior do código: acrescente colunas com valor padrão ou `null`; para renomear ou apagar uma coluna, faça em dois deploys (primeiro o código para de usar, depois a migration apaga).

## Logs

```bash
docker compose logs -f server jobs              # acompanhar ao vivo (Ctrl+C sai)
docker compose logs --since 1h server           # última hora
docker compose logs --since 24h jobs | grep '"job finished"'
docker compose logs caddy --tail 100            # acessos e certificado
```

Os logs são JSON, uma linha por evento. Com o `jq` (`sudo apt install -y jq`), dá para filtrar:

```bash
docker compose logs --no-log-prefix --since 24h server | jq -c 'select(.level == "error")'
docker compose logs --no-log-prefix --since 1h server | jq -c 'select(.message == "request" and .status >= 500)'
```

Cada requisição tem um `requestId`, que também volta no cabeçalho `X-Request-Id` da resposta: com ele, você acha a linha certa no log.

O Docker guarda até 50 MB de log por container (5 arquivos de 10 MB, configurado no bootstrap); o mais antigo é descartado.

Erros também vão para o **Sentry** (projetos `marinho-api` e `marinho-web`), com o sha do commit como release, sem IP, cookies, corpo nem busca da URL. O monitor de disponibilidade (passo 10 do primeiro deploy) avisa se o `/health` parar de responder.

## Tarefas agendadas

Rodam no container `jobs`, no fuso de Maceió:

| Tarefa | Quando | O que faz |
| --- | --- | --- |
| `expire-quotes` | a cada 5 min | expira orçamentos com sinal vencido e libera a agenda |
| `cleanup-uploads` | de hora em hora (minuto 15) | apaga do R2 e do banco os uploads pendentes com mais de 24 h |
| `purge-customer-documents` | 03:30 | apaga documentos de clientes sem locação há mais do prazo (padrão 24 meses) |
| `backup-database` | 03:00 | `pg_dump` para o bucket `marinho-backups` ([backup-e-restauracao.md](backup-e-restauracao.md)) |

Rodar uma à mão (todas podem rodar de novo sem estrago):

```bash
docker compose exec jobs bun dist/jobs.mjs backup-database
```

O comando sai com código 0 se deu certo e 1 se falhou; o log mostra o motivo. Para ver as últimas execuções que mudaram algo:

```bash
docker compose exec postgres psql -U marinho -d marinho -c \
  "select created_at, entity_id as tarefa, payload->>'affected' as afetados
   from event where entity = 'Job' order by created_at desc limit 20"
```

Rodadas que não mudam nada (a maioria das `expire-quotes`) aparecem só no log, para não encher o histórico.

**Prazo dos documentos:** fica na coluna `document_retention_months` da tabela `settings` (ainda sem tela). Para mudar, depois de confirmar com o advogado (ADR 0016):

```bash
docker compose exec postgres psql -U marinho -d marinho -c \
  "update settings set document_retention_months = 24 where id = 1"
```

## Usuários e senhas

**Criar usuário, mudar papel e redefinir senha:** pelo sistema, entrando como `lucas` (papel Gestão): **Configurações → Pessoas e acessos**. A senha redefinida aparece uma vez só: passe para a pessoa e peça para ela não reaproveitar de outro lugar.

**Esqueceu a senha do `lucas`** (o único gestor, então ninguém consegue redefinir pelo sistema):

```bash
cd /opt/marinho
read -rsp "Senha nova (8+ caracteres): " NOVA_SENHA; echo; export NOVA_SENHA
HASH=$(docker compose run --rm -T -e NOVA_SENHA server \
  bun -e 'import { hashPassword } from "better-auth/crypto"; console.log(await hashPassword(process.env.NOVA_SENHA))' | tail -n 1)
printf '%s\n' "update account set password = :'hash' where \"providerId\" = 'credential' and \"userId\" = (select id from \"user\" where username = 'lucas');" |
  docker compose exec -T postgres psql -U marinho -d marinho -v hash="$HASH"
unset NOVA_SENHA HASH
```

Deve aparecer `UPDATE 1`. Troque `lucas` pelo usuário certo se for outro.

## Trocar segredos

Depois de editar o `.env`, `docker compose up -d` recria só os containers cuja configuração mudou.

**`BETTER_AUTH_SECRET`** (todo mundo precisa entrar de novo):

```bash
openssl rand -base64 48      # copie o resultado
nano .env                     # cole em BETTER_AUTH_SECRET
docker compose up -d server
```

**Tokens do R2** (uploads ou backups):

1. Painel → **R2 → Manage R2 API Tokens** → crie um token novo com a mesma permissão e o mesmo bucket ([r2.md](r2.md)).
2. Troque as duas linhas no `.env` (`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` ou as `R2_BACKUP_...`).
3. `docker compose up -d server jobs`
4. Teste: envie uma foto pelo sistema; rode `docker compose exec jobs bun dist/jobs.mjs backup-database`.
5. Só então apague o token antigo no painel.

**Senha do Postgres** (`POSTGRES_PASSWORD`): mudar no `.env` não muda a senha dentro do banco. Primeiro o banco, depois o arquivo:

```bash
NOVA=$(openssl rand -hex 32)
docker compose exec -T postgres psql -U marinho -d postgres -c "alter user marinho with password '$NOVA'"
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$NOVA/" .env
unset NOVA
docker compose up -d
```

Atualize a cópia do `.env` no gerenciador de senhas.

**Chave SSH do GitHub Actions:** gere outra (`ssh-keygen -t ed25519 -f ~/.ssh/marinho-github-actions-2 -N ""`), acrescente a `.pub` em `/home/deploy/.ssh/authorized_keys`, troque o secret `VPS_SSH_KEY`, rode o Deploy à mão e, funcionando, apague a linha da chave antiga do `authorized_keys`.

**Token da Cloudflare (Alchemy):** painel → **My Profile → API Tokens** → **Roll** no token, e troque o secret `CLOUDFLARE_API_TOKEN`.

## Atualizar a VPS

**Sozinho:** o `unattended-upgrades` instala as atualizações de segurança do Ubuntu todo dia e, se alguma exigir, reinicia às 04:30 de Maceió. Os containers voltam sozinhos (`restart: unless-stopped`).

**Uma vez por mês:**

```bash
sudo apt update && sudo apt upgrade -y        # inclui o Docker, que o automático não cobre
[ -f /var/run/reboot-required ] && sudo reboot
```

Depois do reinício: `cd /opt/marinho && docker compose ps` (tudo `Up`, o `server` `healthy`).

**Imagens do Caddy e do Postgres** (versões menores, ex.: 18.1 → 18.2), com backup antes:

```bash
docker compose exec jobs bun dist/jobs.mjs backup-database
docker compose pull caddy postgres
docker compose up -d caddy postgres
```

Nunca troque `postgres:18` por `postgres:19` no compose sem um plano de migração (dump e restauração): o volume da 18 não abre na 19.

**Espaço em disco:**

```bash
df -h /
docker system df
```

O `deploy.sh` já apaga as imagens antigas da API (guarda a atual e a anterior). Se o disco apertar: `docker image prune -a` (apaga imagens sem container; as próximas vêm do GHCR quando precisar).

## Abrir o banco

```bash
docker compose exec postgres psql -U marinho -d marinho
```

`\dt` lista as tabelas, `\q` sai. Lembre: lançamentos de caixa nunca são editados nem apagados (há um trigger que recusa); corrija pelo sistema, com estorno.
