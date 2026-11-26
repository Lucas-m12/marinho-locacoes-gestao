# MCP do sistema

Deixa o Claude consultar e operar o sistema de gestão pelas mesmas regras das telas. As ferramentas chamam o contrato (`@marinho-gestao/contract`) com um usuário próprio, `claude`. Por isso valem as mesmas permissões e o mesmo histórico.

Há dois jeitos de rodar, com as mesmas ferramentas:

| Modo                            | Onde roda                                                        | Onde funciona                             |
| ------------------------------- | ---------------------------------------------------------------- | ----------------------------------------- |
| **Remoto** (`src/http-main.ts`) | Contêiner `mcp` na VPS, em `https://api.marinholocacoes.com/mcp` | claude.ai, app do celular, Claude Desktop |
| **Local** (`src/stdio.ts`)      | No Mac, aberto pelo Claude por stdio                             | Claude Desktop e Claude Code no Mac       |

## Segurança do modo remoto

Cada requisição passa por cinco barreiras antes de chegar ao sistema:

1. **Caddy:** só os IPs de saída da Anthropic (`160.79.104.0/21` e `153.61.208.0/20`) chegam a `/mcp`. Qualquer outro recebe 404, como se a rota não existisse.
2. **Token:** o contêiner exige `Authorization: Bearer <MCP_TOKEN>`, um valor aleatório de 64 caracteres que fica só no `mcp.env` da VPS e na configuração do conector. A comparação leva o mesmo tempo para qualquer token. Depois de 10 tentativas erradas, o IP fica bloqueado por 15 minutos.
3. **Contêiner isolado:**
   - Fica só na rede interna `mcp`, junto com o Caddy e a API. Não alcança o Postgres nem tem saída para a internet.
   - Não lê o `.env`: não tem a senha do banco, as chaves do R2 nem o segredo do login.
   - Sistema de arquivos somente leitura, sem privilégios do Linux, com memória e processos limitados.
4. **Usuário `claude`, papel Atendimento:** não mexe em pessoas e acessos, configurações, preços nem catálogo. Tudo o que ele faz aparece no histórico como "Claude".
5. **Modo `leitura` por padrão:** as operações só aparecem com `MARINHO_MCP_MODO=completo`.

Além disso:
- Cliente sai sem CPF/CNPJ, endereço e arquivos de documento.
- O log do contêiner registra cada ferramenta chamada, se deu certo e quanto demorou, sem os dados.
- Pagamento ou lançamento repetido no mesmo dia não é lançado duas vezes.

Ficam de fora, de propósito: documentos, fotos, vistorias, caução, estornos, manutenção, pessoas e acessos, e configurações.

**Use uma conta pessoal do Claude (Pro ou Max).** Num plano Team ou Enterprise, o token do cabeçalho vale para todo mundo da organização que ativar o conector. E lá só o administrador da organização adiciona conectores.

## Ligar na VPS (uma vez)

São seis passos. Nos passos 2 a 5, os comandos rodam na VPS, em `/opt/marinho`.

### 1. Criar o usuário do Claude no sistema

Em sistema.marinholocacoes.com, entre como `lucas` → **Configurações** → aba **Pessoas** → **Criar pessoa**:

- Nome: `Claude`
- Usuário: `claude`
- Papel: **Atendimento**
- Senha: gere uma no seu Mac com `openssl rand -base64 24` e guarde até o passo 2.

### 2. Criar o `mcp.env`

**Objetivo:** guardar o token e a senha do Claude num arquivo que só o contêiner `mcp` lê.

```bash
cd /opt/marinho
umask 077
cat > mcp.env <<EOF
MCP_TOKEN=$(openssl rand -hex 32)
MARINHO_USUARIO=claude
MARINHO_SENHA=
MARINHO_MCP_MODO=leitura
EOF
nano mcp.env
```

- `umask 077` faz o arquivo nascer só com permissão para o seu usuário.
- `$(openssl rand -hex 32)` gera o token na hora, sem passar pela tela.
- No `nano`, cole a senha do passo 1 depois de `MARINHO_SENHA=`, salve com Ctrl+O e saia com Ctrl+X.

**Confira:** `ls -l mcp.env` deve mostrar `-rw-------`.

### 3. Ligar o perfil `mcp`

```bash
echo 'COMPOSE_PROFILES=mcp' >> .env
```

**O que faz:** o contêiner `mcp` está no `docker-compose.yml` dentro do perfil `mcp`. Sem essa linha, o deploy ignora o contêiner. É assim que a versão nova pode ir para produção antes de você ligar o MCP.

### 4. Subir

Se o PR do MCP já passou pelo deploy:

```bash
docker compose up -d
docker compose ps
```

**Resultado esperado:** `marinho-mcp-1` aparece como `running (healthy)` depois de uns 20 segundos.

Se o deploy ainda não rodou, ele sobe o `mcp` sozinho. Esse deploy recria o Caddy e a API, por causa da rede nova, então o site fica fora por alguns segundos. Antes de trocar qualquer coisa, o `deploy.sh` confere o Caddyfile.

**Se der errado:** `docker compose logs mcp`. As mensagens mais comuns são `MCP_TOKEN precisa de pelo menos 32 caracteres` (passo 2) e `Defina MARINHO_USUARIO`.

### 5. Testar de dentro da VPS

```bash
# De fora da lista de IPs, o /mcp não existe:
curl -s -o /dev/null -w '%{http_code}\n' https://api.marinholocacoes.com/mcp
# esperado: 404

# De dentro da rede do Docker, com o token, pelo Caddy:
TOKEN=$(sed -n 's/^MCP_TOKEN=//p' mcp.env)
docker compose exec -T caddy wget -qO- \
  --header "authorization: Bearer $TOKEN" \
  --header 'content-type: application/json' \
  --header 'accept: application/json, text/event-stream' \
  --post-data '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"conferir_conexao","arguments":{}}}' \
  http://mcp:3000/mcp
unset TOKEN
```

**Resultado esperado:** um JSON com `"usuario":"claude"` e `"papel":"ATTENDANT"`. O `TOKEN=$(…)` guarda o token numa variável sem mostrar na tela, e o `unset` apaga a variável no fim.

### 6. Adicionar o conector no Claude

1. Na VPS, mostre o token para copiar: `sed -n 's/^MCP_TOKEN=//p' /opt/marinho/mcp.env`
2. No claude.ai, pelo navegador, abra as configurações de **Conectores** e escolha **Adicionar conector personalizado** (o caminho exato do menu pode mudar):
   - Nome: `Marinho`
   - URL: `https://api.marinholocacoes.com/mcp`
   - Autenticação: **No sign in** (sem login)
   - Request headers: nome `Authorization`, valor `Bearer ` seguido do token
3. Limpe a tela do terminal (`clear`).
4. Numa conversa, ative o conector Marinho no menu de ferramentas e peça: "confere a conexão com o sistema da Marinho".

No celular, o conector aparece sozinho no app do Claude, na mesma conta.

## Rotina

| Para                      | Comando, em `/opt/marinho`                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| Ver o que o Claude chamou | `docker compose logs -f mcp`                                                                            |
| Liberar as operações      | `MARINHO_MCP_MODO=completo` no `mcp.env`, depois `docker compose up -d mcp`                             |
| Trocar o token            | Gere outro em `MCP_TOKEN`, rode `docker compose up -d mcp` e cole o novo no conector                    |
| Desligar o MCP            | `docker compose stop mcp` (e tire o `COMPOSE_PROFILES=mcp` do `.env` para não voltar no próximo deploy) |

### Cortar o acesso na hora

1. Troque o `MCP_TOKEN` (tabela acima). O conector para de funcionar na próxima chamada.
2. No sistema, **Configurações** → **Pessoas** → **Redefinir senha** do Claude.
3. Redefinir a senha **não derruba sessões já abertas** (isso vale para qualquer pessoa no sistema). Para derrubar as sessões do Claude:

```bash
docker compose exec postgres psql -U marinho -d marinho \
  -c "delete from session using \"user\" where session.\"userId\" = \"user\".id and \"user\".username = 'claude';"
```

### Se a Anthropic mudar os IPs

A lista atual está em platform.claude.com/docs/en/api/ip-addresses. Para trocar, ponha no `.env`, separado por espaço, `MCP_ALLOWED_IPS=<faixa> <faixa>` e rode `docker compose up -d caddy`. Sinal de lista errada: o conector não conecta e o `docker compose logs mcp` não mostra nenhuma chamada.

## Agente do WhatsApp (contêiner `mcp-whatsapp`)

O agente da equipe no WhatsApp (OpenClaw, em `/opt/openclaw` na VPS) usa um segundo contêiner com as mesmas ferramentas: `mcp-whatsapp`, no perfil `whatsapp`. Ele tem usuário, token e modo próprios, então dá para deixar o agente só em consulta enquanto o Claude fica em modo completo, e cortar um sem mexer no outro.

- **Sem Caddy:** não tem rota pública. Só o OpenClaw chega nele, pela rede interna `marinho-whatsapp`, em `http://mcp-whatsapp:3000/mcp`.
- **Usuário `whatsapp`, papel Atendimento:** crie em **Configurações** → **Pessoas**, como o `claude` no passo 1. O histórico mostra "WhatsApp".
- **Variáveis:** `mcp-whatsapp.env`, no formato de `deploy/mcp-whatsapp.env.example`, com permissão 600.
- **Ligar:** `COMPOSE_PROFILES=mcp,whatsapp` no `.env` e `docker compose up -d`.
- **Liberar as operações:** `MARINHO_MCP_MODO=completo` no `mcp-whatsapp.env` e `docker compose up -d mcp-whatsapp`.
- **Cortar o acesso:** troque o `MCP_TOKEN` do `mcp-whatsapp.env` (e o `MARINHO_MCP_TOKEN` do OpenClaw) ou `docker compose stop mcp-whatsapp`.

## Modo local (opcional, no Mac)

Para usar no Claude Code ou no Claude Desktop sem passar pela VPS.

1. Guarde a senha do `claude` no Chaves: `security add-generic-password -s marinho-mcp -a claude -w` (ele pede a senha).
2. No Claude Code:

   ```bash
   claude mcp add marinho --scope user \
     -e MARINHO_USUARIO=claude -e MARINHO_MCP_MODO=leitura \
     -- bun /Users/lucas/Documents/marinho-gestao/apps/mcp/src/stdio.ts
   ```

3. No Claude Desktop, em **Configurações** → **Desenvolvedor** → **Editar configuração**, use o caminho completo do Bun (`which bun`):

   ```json
   {
     "mcpServers": {
       "marinho": {
         "command": "/Users/lucas/.bun/bin/bun",
         "args": ["/Users/lucas/Documents/marinho-gestao/apps/mcp/src/stdio.ts"],
         "env": { "MARINHO_USUARIO": "claude", "MARINHO_MCP_MODO": "leitura" }
       }
     }
   }
   ```

O modo local lê a senha do Chaves a cada login e faz logout quando o Claude fecha.

## Ferramentas

**Consultas (15):** `conferir_conexao`, `resumo_do_dia`, `verificar_disponibilidade`, `agenda`, `listar_equipamentos`, `tabela_de_precos`, `listar_locacoes`, `ver_locacao`, `texto_do_orcamento`, `simular_prorrogacao`, `buscar_clientes`, `ver_cliente`, `resumo_financeiro`, `lancamentos_do_caixa` e `demanda_perdida`.

**Operações (10, modo completo):** `cadastrar_cliente`, `criar_orcamento`, `enviar_orcamento`, `registrar_pagamento`, `confirmar_locacao`, `prorrogar_locacao`, `cancelar_locacao` (destrutiva), `encerrar_locacao` (destrutiva), `registrar_demanda_perdida` e `lancar_no_caixa`.

## Variáveis

| Variável           | Padrão                                | Para quê                                                          |
| ------------------ | ------------------------------------- | ----------------------------------------------------------------- |
| `MCP_TOKEN`        | obrigatória no remoto                 | Token do cabeçalho `Authorization`. Mínimo de 32 caracteres.      |
| `MCP_PUBLIC_HOST`  | `api.marinholocacoes.com`             | Hosts aceitos, separados por vírgula. O compose acrescenta `mcp`. |
| `MARINHO_USUARIO`  | obrigatória                           | Usuário do Claude no sistema.                                     |
| `MARINHO_SENHA`    | (vazia)                               | Senha dele. No Mac, o modo local lê do Chaves.                    |
| `MARINHO_MCP_MODO` | `leitura`                             | `leitura` ou `completo`.                                          |
| `MARINHO_API_URL`  | `https://api.marinholocacoes.com`     | No compose: `http://server:3000`, pela rede interna.              |
| `MARINHO_ORIGIN`   | `https://sistema.marinholocacoes.com` | Origem confiável do Better Auth, enviada no login.                |
| `PORT`             | `3000`                                | Porta do modo remoto dentro do contêiner.                         |

A senha só viaja por HTTPS. A exceção é `http` para `localhost` ou para um nome sem ponto, que só existe na rede do Docker.

## Desenvolvimento

```bash
bun run --cwd apps/mcp test         # ferramentas, sessão e HTTP contra uma API falsa em memória
bun run --cwd apps/mcp check-types
bun run --cwd apps/mcp build        # dist/mcp.js, o arquivo único que vai na imagem
```

- `src/tools.ts`: as ferramentas. Cada uma declara a entrada em Zod, com a descrição em português que o Claude lê, e chama o cliente do contrato. Ferramenta que muda dado leva `write`.
- `src/api.ts`: login no Better Auth, cookie em memória e cliente oRPC (`RPCLink`), com novo login quando a API responde `UNAUTHORIZED`.
- `src/http.ts`: as barreiras do modo remoto (caminho, Host, bloqueio por tentativas e token) e o `createMcpHandler` do SDK, sem sessão. Atende clientes das eras 2025 e 2026.
- `src/results.ts`: formato das respostas e dos erros, o que sai de cliente e de lançamento, e a chave de idempotência.
- `src/testing.ts`: API falsa (login e `/rpc` reais do oRPC) para os testes.

Para incluir uma ferramenta:
1. Escolha o procedimento do contrato.
2. Confira se o papel Atendimento pode chamá-lo (`packages/domain/src/permissions.ts`).
3. Devolva só o que o Claude precisa.
4. Cubra com um teste em `src/mcp.test.ts`.

A imagem do servidor leva o `dist/mcp.js` (veja `apps/server/Dockerfile`). O contêiner `mcp` usa a mesma imagem e a mesma tag do `server`, então deploy e rollback andam juntos.
