# Primeiro deploy

Roteiro para colocar o sistema no ar pela primeira vez. Siga na ordem: cada passo depende do anterior. Onde aparecer `IP_DA_VPS`, use o IP da sua VPS.

Como vai ficar:

| Peça | Onde | Endereço |
| --- | --- | --- |
| Front (telas) | Cloudflare Workers, publicado pelo Alchemy | `https://sistema.marinholocacoes.com` |
| API, Postgres e tarefas | VPS, em containers, atrás do Caddy | `https://api.marinholocacoes.com` |
| Fotos, documentos e backups | Cloudflare R2 | buckets `marinho-prod` e `marinho-backups` |
| Imagem do servidor | GitHub Container Registry | `ghcr.io/lucas-m12/marinho-gestao-server` |

O deploy de todo dia é automático: push na `main` → CI verde → workflow **Deploy**. Este roteiro prepara tudo o que o workflow precisa.

## 0. Antes de começar: chaves SSH

No seu computador, crie duas chaves: uma sua e uma só para o GitHub Actions. Se já tiver uma chave sua (`~/.ssh/id_ed25519.pub`), pule a primeira linha.

```bash
ssh-keygen -t ed25519 -C "lucas@notebook"
ssh-keygen -t ed25519 -f ~/.ssh/marinho-github-actions -C "github-actions-marinho" -N ""
```

- `~/.ssh/id_ed25519.pub`: chave pública sua, vai para a VPS.
- `~/.ssh/marinho-github-actions` (sem `.pub`): chave privada do deploy automático. Vai só para o secret `VPS_SSH_KEY` do GitHub. Não use para mais nada.

## 1. Criar a VPS

- Sistema: **Ubuntu 24.04 LTS**.
- Tamanho: **2 vCPU e 2 a 4 GB de RAM** bastam, com 40 GB de disco ou mais.
- Região: no Brasil (São Paulo) é melhor para a latência do celular, mas não é obrigatório.
- Arquitetura: prefira **x86 (amd64)**. Se escolher ARM, crie no GitHub a variável `VPS_PLATFORM` com o valor `linux/arm64` (passo 6).
- No painel do provedor, cadastre a sua chave pública (`~/.ssh/id_ed25519.pub`) na criação. Ela vai para o root, e o bootstrap copia para o usuário `deploy`.

Anote o IP (v4). Teste: `ssh root@IP_DA_VPS`.

## 2. DNS na Cloudflare

O domínio `marinholocacoes.com` precisa estar na Cloudflare (nameservers da Cloudflare). No painel: **marinholocacoes.com → DNS → Records**.

| Tipo | Nome | Conteúdo | Proxy |
| --- | --- | --- | --- |
| A | `api` | `IP_DA_VPS` | **Desligado** (nuvem cinza, "DNS only") |

- O proxy fica desligado para o Caddy, na VPS, falar direto com o Let's Encrypt e emitir o certificado.
- Se a VPS tiver IPv6, pode criar também um `AAAA` para `api`, também sem proxy.
- **Não crie** registro para `sistema`: o Alchemy cria sozinho no primeiro deploy do front (é um "Custom Domain" do Worker, com certificado da Cloudflare). Se já existir um registro `sistema`, apague antes do primeiro deploy.
- Se a zona tiver registros `CAA`, inclua `letsencrypt.org`.

Confira (pode levar alguns minutos):

```bash
dig +short api.marinholocacoes.com   # deve mostrar o IP da VPS
```

## 3. Preparar a VPS

Leia o `deploy/bootstrap-vps.sh` antes: cada linha está comentada. Depois:

```bash
scp deploy/bootstrap-vps.sh root@IP_DA_VPS:/root/
ssh root@IP_DA_VPS
bash /root/bootstrap-vps.sh
```

O script pede uma senha para o usuário `deploy`. Ela serve só para o `sudo` (o SSH continua só por chave). Guarde no gerenciador de senhas.

**Sem fechar a sessão do root**, abra outro terminal e confira:

```bash
ssh deploy@IP_DA_VPS
docker ps          # deve listar uma tabela vazia, sem pedir sudo
sudo -v            # deve aceitar a senha que você escolheu
exit
```

Só depois feche a sessão do root. A partir daqui, `ssh root@...` não funciona mais, e isso é o esperado.

Agora libere a chave do GitHub Actions no usuário `deploy`:

```bash
ssh deploy@IP_DA_VPS 'cat >> ~/.ssh/authorized_keys' < ~/.ssh/marinho-github-actions.pub
```

E pegue a "impressão digital" da VPS para o GitHub confiar nela (secret `VPS_KNOWN_HOSTS`, passo 6):

```bash
ssh-keyscan -H IP_DA_VPS > /tmp/marinho-known-hosts
ssh deploy@IP_DA_VPS 'ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub'
ssh-keygen -lf /tmp/marinho-known-hosts
```

A linha `ED25519` das duas últimas saídas deve ter o mesmo `SHA256:...`. Se tiver, o conteúdo de `/tmp/marinho-known-hosts` é o valor do secret.

## 4. Cloudflare R2

Siga o [r2.md](r2.md), seção "Produção":

1. criar os buckets `marinho-prod` e `marinho-backups`;
2. criar dois tokens, cada um restrito ao seu bucket;
3. configurar o CORS do `marinho-prod`;
4. criar a regra de ciclo de vida do `marinho-backups` (apagar depois de 30 dias).

Guarde o Account ID e as duas chaves de cada token: entram no `.env` do próximo passo.

## 5. Sentry (opcional, mas recomendado)

Em [sentry.io](https://sentry.io), no plano gratuito ("Developer"):

1. Crie dois projetos: `marinho-web` (plataforma **React**) e `marinho-api` (plataforma **Bun**).
2. Em cada projeto: **Settings → Security & Privacy**, ligue **Prevent Storing of IP Addresses** e deixe o **Data Scrubber** ligado. O código já não manda IP, cookies, cabeçalhos, corpo das requisições nem a busca da URL; isso é uma segunda trava.
3. Copie o DSN de cada projeto (**Settings → Client Keys (DSN)**):
   - o da `marinho-api` vai no `.env` da VPS (`SENTRY_DSN`);
   - o da `marinho-web` vai na variável `VITE_SENTRY_DSN` do GitHub (passo 6).
4. Em **Alerts**, crie um alerta por e-mail para "a new issue is created".

Sem DSN, o sistema funciona igual, só não envia erros.

## 6. Arquivo de ambiente na VPS

```bash
scp deploy/.env.example deploy@IP_DA_VPS:/opt/marinho/.env
ssh deploy@IP_DA_VPS
chmod 600 /opt/marinho/.env
openssl rand -hex 32        # copie: POSTGRES_PASSWORD
openssl rand -base64 48     # copie: BETTER_AUTH_SECRET
nano /opt/marinho/.env
```

Preencha cada linha seguindo os comentários do arquivo. Deixe `IMAGE_TAG=latest`: o primeiro deploy troca sozinho. Salve no nano com `Ctrl+O`, `Enter`, `Ctrl+X`.

Guarde uma cópia do `.env` preenchido no gerenciador de senhas. Ele não está em nenhum backup.

## 7. Secrets e variáveis do GitHub

No repositório: **Settings → Secrets and variables → Actions**. Com o [GitHub CLI](https://cli.github.com) (`gh auth login` antes), dá para fazer tudo do terminal, na pasta do projeto:

```bash
gh secret set VPS_HOST --body "IP_DA_VPS"
gh secret set VPS_USER --body "deploy"
gh secret set VPS_SSH_KEY < ~/.ssh/marinho-github-actions
gh secret set VPS_KNOWN_HOSTS < /tmp/marinho-known-hosts
gh secret set CLOUDFLARE_ACCOUNT_ID --body "SEU_ACCOUNT_ID"
gh secret set CLOUDFLARE_API_TOKEN          # cola o token quando pedir
gh variable set VITE_SENTRY_DSN --body "DSN_DO_PROJETO_MARINHO_WEB"
```

| Nome | Tipo | O que é |
| --- | --- | --- |
| `VPS_HOST` | secret | IP da VPS |
| `VPS_USER` | secret | `deploy` |
| `VPS_SSH_KEY` | secret | chave **privada** `~/.ssh/marinho-github-actions` |
| `VPS_KNOWN_HOSTS` | secret | saída do `ssh-keyscan` conferida no passo 3. Sem ela, o deploy confia na chave que a VPS apresentar na hora e mostra um aviso |
| `CLOUDFLARE_ACCOUNT_ID` | secret | painel da Cloudflare → qualquer domínio → coluna da direita, "Account ID" |
| `CLOUDFLARE_API_TOKEN` | secret | token do Alchemy (abaixo) |
| `GHCR` | — | **não precisa criar**: o workflow usa o `GITHUB_TOKEN` automático, com `packages: write` para publicar a imagem e `packages: read` para a VPS baixar |
| `VITE_SENTRY_DSN` | variável | DSN do projeto `marinho-web` (opcional) |
| `VPS_PLATFORM` | variável | só se a VPS for ARM: `linux/arm64` |

**Token da Cloudflare para o Alchemy:** em **My Profile → API Tokens → Create Token**, use o modelo **Edit Cloudflare Workers**. Em "Account Resources", escolha a sua conta; em "Zone Resources", `marinholocacoes.com`. Acrescente a permissão **Zone → DNS → Edit** (o domínio `sistema` é criado pelo Alchemy). Se o deploy reclamar de alguma permissão, o erro diz qual falta: edite o token e rode de novo. Outra opção é deixar o Alchemy criar o token: `cd packages/infra && bun x alchemy cloudflare token --name marinho-ci`, escolhendo as mesmas permissões.

## 8. Primeiro deploy

O workflow **Deploy** só roda a partir da `main`. Leve o trabalho para a `main` (pull request ou merge) e acompanhe em **Actions**:

1. **CI** roda tipos, Biome, testes e build.
2. **Deploy** começa quando o CI termina verde:
   - **Imagem do servidor**: build e push para o GHCR (`sha-<12 primeiros do commit>` e `latest`);
   - **API na VPS**: copia `docker-compose.yml`, `Caddyfile` e `deploy.sh` para `/opt/marinho`, faz login no GHCR, roda `./deploy.sh sha-...` (migrations, `server`, `jobs`, espera o `/health`) e confere `https://api.marinholocacoes.com/health` pela internet;
   - **Front na Cloudflare**: `alchemy deploy --stage prod`. Na primeira vez ele também cria o "state store" do Alchemy na sua conta.

Para rodar de novo sem novo commit: **Actions → Deploy → Run workflow**.

No primeiro deploy o Caddy pede o certificado. Se o `/health` pela internet falhar, veja na VPS:

```bash
cd /opt/marinho
docker compose ps
docker compose logs caddy --tail 50
```

Os erros mais comuns: DNS ainda não propagou, proxy da Cloudflare ligado no `api` (precisa estar cinza) ou porta 80 bloqueada no firewall do provedor (além do `ufw`, alguns provedores têm firewall no painel).

## 9. Usuários iniciais

Na VPS, com as senhas iniciais em mãos (8 caracteres ou mais). O `read -rs` lê sem mostrar na tela e sem gravar no histórico:

```bash
cd /opt/marinho
read -rsp "Senha do lucas: " SEED_PASSWORD_LUCAS; echo; export SEED_PASSWORD_LUCAS
read -rsp "Senha do atendimento: " SEED_PASSWORD_ATENDIMENTO; echo; export SEED_PASSWORD_ATENDIMENTO
read -rsp "Senha de equipamentos: " SEED_PASSWORD_EQUIPAMENTOS; echo; export SEED_PASSWORD_EQUIPAMENTOS
docker compose run --rm \
  -e SEED_PASSWORD_LUCAS -e SEED_PASSWORD_ATENDIMENTO -e SEED_PASSWORD_EQUIPAMENTOS \
  migrate bun run db:seed:image
unset SEED_PASSWORD_LUCAS SEED_PASSWORD_ATENDIMENTO SEED_PASSWORD_EQUIPAMENTOS
```

O seed cria o catálogo real, as configurações e os três usuários. Rodar de novo não duplica nada nem muda senhas.

**Trocar as senhas iniciais:** o sistema ainda não tem tela para cada pessoa trocar a própria senha. Por enquanto, no primeiro acesso de cada pessoa, entre como `lucas` em **Configurações → Pessoas e acessos → Redefinir senha** e deixe a própria pessoa digitar a senha nova.

## 10. Conferir pelo celular

1. Abra `https://sistema.marinholocacoes.com` no celular. O cadeado aparece e a tela de login carrega.
2. Entre como `lucas`, com "Continuar conectado".
3. Envie uma foto de unidade no **Estoque**. Se der erro, confira o CORS do `marinho-prod` ([r2.md](r2.md)).
4. Abra a foto enviada (testa a leitura por URL temporária).
5. Adicione à tela inicial (Safari: Compartilhar → Adicionar à Tela de Início).
6. Na VPS, rode um backup na mão e confira o arquivo no bucket `marinho-backups`:

   ```bash
   cd /opt/marinho
   docker compose exec jobs bun dist/jobs.mjs backup-database
   ```

7. **Antes do lançamento**, faça o teste de restauração de [backup-e-restauracao.md](backup-e-restauracao.md).
8. Cadastre um monitor de disponibilidade gratuito (ex.: [UptimeRobot](https://uptimerobot.com) ou [Better Stack](https://betterstack.com/uptime)) do tipo HTTP(S) com palavra-chave, apontado para `https://api.marinholocacoes.com/health`, procurando `"ok":true`, a cada 5 minutos, com alerta por e-mail. Ele avisa se a VPS, o Caddy ou o Postgres caírem.

A operação do dia a dia (deploy, rollback, logs, tarefas, senhas, segredos e atualizações) está em [rotina.md](rotina.md).
