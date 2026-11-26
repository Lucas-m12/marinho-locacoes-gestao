# Prompt 03 — Backend: tarefas agendadas, backup, VPS e deploy

> **Rode depois do prompt 02**, com a suíte de cenários verde contra o servidor real.
> Leia `docs/decisoes/` (principalmente 0011, 0012, 0013 e 0016), `CLAUDE.md` e `docs/operacao/r2.md`.
> Este prompt prepara **arquivos e documentação**. Ele não acessa a VPS, a Cloudflare nem o GitHub por conta própria. Os passos que dependem de conta, senha ou servidor ficam num roteiro para o Lucas executar (seção 7).
> Trabalhe em fases (seção 8), com um commit no fim de cada uma.

## 1. Objetivo

Deixar o sistema pronto para produção:
- Front na Cloudflare em `https://sistema.marinholocacoes.com`.
- API, Postgres e tarefas agendadas numa VPS Ubuntu, atrás do Caddy, em `https://api.marinholocacoes.com`.
- Uploads e backups no R2.
- CI e deploy pelo GitHub Actions.

## 2. Tarefas agendadas (`apps/server/src/jobs`)

Um processo separado, `bun run jobs`, que usa `croner` com o fuso `America/Maceio`. Ele reaproveita os services do `packages/api` e o `createPrismaClient`. Cada tarefa:
- é idempotente;
- registra início, fim e quantidade de registros afetados no log em JSON;
- grava um `Event` com o ator `system`;
- pode ser rodada à mão com `bun run job <nome>`.

| Tarefa | Quando | O que faz |
| --- | --- | --- |
| `expire-quotes` | a cada 5 min | Roda o `expireStaleQuotes(now)`. Os services já fazem isso na leitura; aqui é só para manter o banco em dia. |
| `cleanup-uploads` | de hora em hora | Apaga do R2 e do banco os `Upload` `PENDING` com mais de 24 h. |
| `purge-customer-documents` | todo dia às 03:30 | Apaga do R2 os documentos de clientes sem locação há 2 anos (ADR 0016) e registra no `Event` o que foi apagado, sem dados pessoais. O prazo vem de `Settings` (`documentRetentionMonths`, padrão 24). |
| `backup-database` | todo dia às 03:00 | `pg_dump --format=custom`, compactado, enviado para o bucket R2 `marinho-backups` em `postgres/aaaa/mm/dd/marinho-<timestamp>.dump`. O envio é com `aws4fetch`; para arquivos grandes, use multipart. O tamanho e o tempo de cada backup vão para o log. |

- A retenção dos backups é feita por regra de ciclo de vida do bucket: apagar depois de 30 dias. A regra fica documentada em `docs/operacao/r2.md`, não é criada por código.
- O container das tarefas precisa do `pg_dump` 18. Use uma imagem com `postgresql-client-18`, ou faça a tarefa de backup chamar `docker exec` no container do Postgres. Escolha uma das duas, explique por quê e documente.

## 3. Containers e VPS (`deploy/`)

Crie `deploy/docker-compose.prod.yml`, separado do `docker-compose.yml` de desenvolvimento:

| Serviço | Imagem | O que faz |
| --- | --- | --- |
| `caddy` | `caddy:2` | TLS automático (Let's Encrypt) e proxy reverso de `api.marinholocacoes.com` para `server:3000`. Portas 80 e 443. Headers de segurança. Logs em JSON. |
| `server` | `ghcr.io/<usuario>/marinho-gestao-server:<tag>` | A API. Sem porta publicada. Healthcheck em `/health`. |
| `jobs` | a mesma imagem do `server`, com outro comando | As tarefas agendadas. |
| `postgres` | `postgres:18` | Volume nomeado. **Sem porta publicada.** Senha vinda do arquivo de ambiente. |

- Arquivo `deploy/Caddyfile`.
- Variáveis de produção num arquivo `/opt/marinho/.env` na VPS, que nunca vai para o repositório. Crie `deploy/.env.example` com todas as variáveis e uma descrição, sem valores reais.
- **Dockerfile do servidor:** revise o `apps/server/Dockerfile` atual. Ele instala dependências do monorepo inteiro e copia tudo para a imagem final. Use build em etapas para a imagem final levar só o necessário: o `dist`, o cliente do Prisma gerado, as migrations e o `node_modules` de produção. Rode como usuário não-root e acrescente um `HEALTHCHECK`.
- **Migrations:** um serviço `migrate`, de execução única (perfil `migrate`), que roda `prisma migrate deploy` antes de o `server` subir no deploy.
- Script `deploy/bootstrap-vps.sh`, para o Lucas ler e rodar uma vez na VPS. Ele faz:
  - cria um usuário `deploy` com sudo e acesso só por chave SSH;
  - desliga o login do root e o login por senha no SSH;
  - configura o `ufw` liberando só as portas 22, 80 e 443;
  - instala `unattended-upgrades`, Docker Engine e o plugin Compose, e `fail2ban`;
  - cria a pasta `/opt/marinho`.

  O script precisa ser idempotente e comentado linha a linha, porque o objetivo é o Lucas aprender o que cada passo faz.

## 4. CI/CD (`.github/workflows`)

- **`ci.yml`**, em todo push e pull request:
  - `bun install --frozen-lockfile`;
  - `db:generate`;
  - `check-types`;
  - Biome (`biome ci`);
  - testes de `domain` e cenários contra o mock;
  - cenários contra o servidor, com Postgres 18 como `services:` do GitHub Actions;
  - build do web e do servidor.
- **`deploy.yml`**, em push na `main` depois do CI verde, ou acionado à mão:
  1. build da imagem do servidor e push para o GHCR, com as tags `sha-<commit>` e `latest`;
  2. por SSH (chave em secret), na VPS: `docker compose pull`, `docker compose run --rm migrate`, `docker compose up -d server jobs`;
  3. espera o `/health` responder;
  4. se falhar, volta para a tag anterior e o job falha;
  5. deploy do front na Cloudflare com o `packages/infra` (Alchemy).
- Secrets do GitHub: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` e `GHCR` (o `GITHUB_TOKEN` com permissão de packages). Liste todos no roteiro.

## 5. Front em produção

- Em `packages/infra/alchemy.run.ts`: passe `VITE_DATA_SOURCE=http` e `VITE_SERVER_URL=https://api.marinholocacoes.com`, e configure o domínio personalizado `sistema.marinholocacoes.com`. Confira a API do Alchemy na versão instalada.
- **O build de produção do front deve falhar se `VITE_DATA_SOURCE` for `mock`.** Assim o mock nunca vai para produção por engano.
- Produção do servidor:
  - `CORS_ORIGIN=https://sistema.marinholocacoes.com`;
  - `BETTER_AUTH_URL=https://api.marinholocacoes.com`;
  - cookie `sameSite=lax` e `secure`. Front e API são subdomínios do mesmo domínio, então o cookie vai junto nas chamadas.

## 6. Observabilidade

- Sentry no plano gratuito, no front (React) e no servidor (Bun/Hono), com DSN por variável de ambiente.
  - Sem dados pessoais: desligue o envio de IP e de corpo das requisições.
  - Defina o `release` como o sha do commit.
- Documente como acompanhar os logs: `docker compose logs -f server jobs`.
- Sugira no roteiro um monitor de disponibilidade gratuito apontado para `/health`, sem implementar.

## 7. Roteiro para o Lucas (`docs/operacao/`)

Escreva em português, passo a passo, com os comandos exatos:

- **`primeiro-deploy.md`**
  1. Escolher e criar a VPS: Ubuntu 24.04 LTS, 2 vCPU e 2 a 4 GB de RAM bastam. Uma região no Brasil é melhor, mas não obrigatória.
  2. Apontar no DNS da Cloudflare `api.marinholocacoes.com` (registro A, **sem proxy**, para o Caddy emitir o certificado) e `sistema.marinholocacoes.com`.
  3. Rodar o `bootstrap-vps.sh`.
  4. Criar os buckets `marinho-prod` e `marinho-backups` no R2, os tokens de API restritos a cada bucket, o CORS e o ciclo de vida.
  5. Preencher o `/opt/marinho/.env`.
  6. Cadastrar os secrets do GitHub.
  7. Primeiro deploy.
  8. Rodar o `db:seed` com as senhas iniciais e pedir para cada pessoa trocar a sua no primeiro acesso.
  9. Conferir pelo celular.
- **`backup-e-restauracao.md`**: como baixar um backup do R2 e restaurar num Postgres local com `pg_restore`, para conferir. **Faça o teste de restauração antes do lançamento.**
- **`rotina.md`**: deploy, rollback para a imagem anterior, ver logs, rodar uma tarefa à mão, criar usuário, redefinir senha, trocar segredos (`BETTER_AUTH_SECRET` e tokens do R2) e atualizar a VPS.
- **`r2.md`**: completar o que o prompt 02 começou (CORS, ciclo de vida e tokens).

## 8. Ordem de trabalho

1. **Tarefas agendadas**, com testes das tarefas contra o Postgres de teste e o `MemoryStorage`.
2. **Dockerfile, compose de produção, Caddyfile e bootstrap.** Valide localmente com `docker compose -f deploy/docker-compose.prod.yml config` e subindo a pilha com um domínio de teste ou `localhost`.
3. **CI/CD.**
4. **Front em produção e Sentry.**
5. **Roteiros de operação.**

No fim, escreva um resumo com o que foi feito, a lista de tudo que o Lucas precisa criar ou configurar fora do repositório e uma estimativa do custo mensal (VPS mais R2), deixando claro de onde vêm os preços e que eles precisam ser conferidos no dia.
