# Prompt 04 — Ligar front e backend e testar tudo com Playwright, comparando com o design

> Pré-requisitos: prompts 01, 01a e 02 concluídos. O 03 é opcional para este prompt, mas se o `.github/workflows/ci.yml` existir, inclua o E2E nele (seção 8).
> Antes de começar, leia `CLAUDE.md`, `docs/decisoes/`, `docs/design/README.md` (inclusive a seção "Imagens de referência") e veja as imagens em `docs/design/referencias/`.
> Trabalhe em fases (seção 9), com um commit no fim de cada uma. **Não altere `docs/design/` nem as imagens de referência.** Se o design estiver errado ou não for viável, registre em `docs/design/diferencas-aceitas.md` (seção 6.4).

## 1. Objetivo

1. O front usa o backend real (`VITE_DATA_SOURCE=http`) localmente, com todos os fluxos funcionando.
2. Uma suíte E2E em Playwright cobre os fluxos de cada papel nos três tamanhos de tela, contra o backend real.
3. Uma comparação visual com as referências do design gera um relatório lado a lado. Você corrige as diferenças reais e registra as aceitas.
4. Depois de aprovada, cada tela vira uma linha de base de regressão visual (`toHaveScreenshot`).

## 2. Ligar front e back

- `apps/web/.env`: `VITE_DATA_SOURCE=http` e `VITE_SERVER_URL=http://localhost:3000`.
- `apps/server/.env`: `CORS_ORIGIN=http://localhost:3001` e `BETTER_AUTH_URL=http://localhost:3000`. Em desenvolvimento o cookie é `sameSite=lax` sem `secure`. `localhost:3001` e `localhost:3000` são o mesmo site, então o cookie vai junto.
- Suba tudo com os scripts que já existem (`db:start`, `db:migrate`, `db:seed:demo`, `dev`) e percorra as telas. Antes de escrever os testes, corrija o que estiver quebrado entre os dois lados.
- **O contrato decide.** Se o servidor e o mock divergirem, corrija o lado errado e anote no resumo final.

## 3. Infraestrutura de teste

### 3.1 Relógio controlável (só fora de produção)

As referências mostram **segunda-feira, 02/11/2026, de manhã**. Para o app mostrar o mesmo dia:
- O `clock` do contexto do servidor lê um relógio de teste quando `E2E_TEST_HOOKS=1`.
- No front, o Playwright fixa a hora do navegador com `page.clock` (`setFixedTime` ou `install`) no mesmo instante.

### 3.2 Rotas de teste no servidor

Ficam ativas **só** com `E2E_TEST_HOOKS=1` e `NODE_ENV !== "production"`. Se `E2E_TEST_HOOKS=1` aparecer com `NODE_ENV=production`, o servidor se recusa a subir. Escreva um teste unitário para isso.

- `POST /__test/reset { now }`: apaga as tabelas de negócio, **mantendo os usuários e as sessões**, e roda o seed de demonstração com o `now` informado.
- `POST /__test/clock { now }`: muda o relógio do servidor, por exemplo para o sinal expirar.

### 3.3 Storage dos uploads

Use o **MinIO** em container (serviço `minio` no `docker-compose.yml`, só para desenvolvimento e teste), compatível com S3.
- O `R2Storage` passa a aceitar `S3_ENDPOINT` opcional para apontar para o MinIO. O fluxo de URL pré-assinada fica idêntico ao de produção.
- Crie o bucket e o CORS do MinIO por script, dentro do setup do E2E.

### 3.4 Pacote `apps/e2e`

Novo pacote com `@playwright/test` e `@axe-core/playwright`.
- `webServer` sobe o Postgres de teste (`postgres-test`), o MinIO, as migrations, o servidor com `E2E_TEST_HOOKS=1` e o web com `VITE_DATA_SOURCE=http`.
- **`workers: 1`**: o banco é compartilhado.
- Antes de cada arquivo de teste, chame `/__test/reset` com `now = 2026-11-02T07:30:00-03:00`.

### 3.5 Projetos do Playwright

| Projeto | Viewport | Observações |
| --- | --- | --- |
| `desktop` | 1440 × 900 | |
| `tablet` | 834 × 1194 | `hasTouch` |
| `celular` | 390 × 844 | `isMobile`, `hasTouch`, `deviceScaleFactor: 1` |

Configurações comuns:
- `deviceScaleFactor: 1` em todos, para comparar com as referências.
- `locale: "pt-BR"` e `timezoneId: "America/Maceio"`.
- `reducedMotion: "reduce"`.

### 3.6 Login

Um `globalSetup` entra com cada papel (`lucas`, `atendimento` e `equipamentos`, com as senhas do seed de demonstração) e salva um `storageState` por papel.

### 3.7 Guardas em todo teste

Um fixture faz o teste falhar se aparecer:
- erro no console;
- `pageerror`;
- resposta 5xx;
- requisição para fora de `localhost`.

## 4. Testes funcionais (contra o backend real)

Escreva em `apps/e2e/tests/fluxos/`. Use seletores por papel e texto acessível (`getByRole`, `getByLabel`), não por classe CSS. Todos rodam nos três projetos, salvo os indicados.

1. **Entrar**
   - Usuário ou senha errada mostra a mensagem certa.
   - Entrar leva ao Painel.
   - Sem "Continuar conectado", a sessão não sobrevive ao fechar o contexto.
   - Sair funciona.
   - Abrir `/agenda` sem sessão leva a `/entrar` e, depois do login, volta para `/agenda`.
2. **Painel:** os blocos mostram os números do seed (R$ 2.340, R$ 610, R$ 1.730 e R$ 900), o alerta de MAR-008 atrasado e "Expira em 5 h" em LOC-0031. O papel `equipamentos` não vê os blocos de dinheiro.
3. **Reserva completa**, como atendimento:
   1. Agenda: busca "maquita" e acha MAR-008.
   2. Busca martelete de 07/11 a 10/11: MAR-001 aparece livre, com R$ 320.
   3. **Reservar** abre Nova locação preenchida.
   4. Escolhe o cliente, a entrega e o município, e envia o orçamento.
   5. **Copiar texto do orçamento** coloca o texto na área de transferência. Leia com permissão de clipboard.
   6. Na locação, registra o sinal (Pix), confirma e marca como separada.
4. **Reserva dupla:** com a mesma unidade e um período sobreposto, a segunda tentativa mostra o conflito e oferece alternativas. Repita com duas abas em paralelo (`Promise.all`): só uma reserva passa.
5. **Andaime:** reservar 13 peças num período em que só 12 estão livres é recusado com a mensagem certa.
6. **Sinal vencido:** cria um orçamento e avança o relógio do servidor (e do navegador) em 25 h. A locação aparece como expirada e a unidade volta a ficar livre na Agenda.
7. **Saída e volta**, como `equipamentos`, no celular:
   - Checklist de saída de LOC-0029 com **upload real de foto** (use `setInputFiles` com uma imagem de teste em `apps/e2e/fixtures/`) e barra de progresso.
   - Concluir leva a unidade para Alugado e a locação para Na obra.
   - Na volta, marcar "Não OK" num item cria uma ocorrência.
   - O acerto da caução com retenção lança na conta de caução e no caixa.
   - A unidade vai para Em inspeção.
8. **Dinheiro**
   - Lança uma despesa com comprovante (upload).
   - Estorna esse lançamento: o original aparece riscado e o total volta ao que era.
   - Estornar de novo não é possível.
   - **Exportar mês (CSV):** capture o download e confira o BOM, o separador `;`, a vírgula decimal e o estorno com sinal invertido.
   - Clicar duas vezes rápido em "Registrar pagamento" gera **um** lançamento só (idempotência).
9. **Estoque e unidade:** filtra por status e busca por apelido. Muda o status de uma unidade: só as transições válidas aparecem, e o motivo é obrigatório quando o ADR exige. Envia uma foto da unidade.
10. **Clientes:** cadastra um cliente com documento (upload). Abre o documento por URL temporária. O papel `equipamentos` não acessa Clientes, nem pelo menu nem pela URL direta ("Sem acesso").
11. **Manutenção:** abre uma OS (a unidade vai para Em manutenção) e marca como pronta com custo (a despesa aparece em Dinheiro).
12. **Configurações:** a gestão cria uma pessoa, muda o papel e redefine a senha. A pessoa nova entra com a senha nova. Os outros papéis não veem Configurações.
13. **Mais** (só no projeto `celular`): leva às telas certas, filtradas pelo papel. Em telas maiores, `/mais` redireciona para o Painel.

## 5. Qualidade em todas as telas

Para cada uma das 14 telas, em cada projeto em que ela existe, em `apps/e2e/tests/qualidade/`:

- **Acessibilidade:** o `AxeBuilder` não acusa nenhuma violação `serious` ou `critical`. Se um item não puder ser corrigido, ele só pode ser ignorado com justificativa no próprio teste.
- **Sem rolagem horizontal:** `document.documentElement.scrollWidth <= clientWidth`.
- **Alvos de toque** (`tablet` e `celular`): todo `button`, `a[href]`, `input` e `[role=tab]` visível tem pelo menos 44 × 44 px. Liste os que falharem.
- **Navegação certa para o tamanho:** barra lateral no desktop, trilho no tablet e barra inferior no celular, com `aria-current="page"` no item ativo.
- **Estados:** vazio (filtro sem resultado), carregando (atrase uma resposta com `page.route`) e erro (force um 500 com `page.route`, que mostra "Tentar de novo" e se recupera).

## 6. Comparação com o design

### 6.1 Capturas do app no estado das referências

Em `apps/e2e/tests/visual/captura.spec.ts`, para cada tela e tamanho das referências:
- reset com `now = 2026-11-02T07:30:00-03:00`;
- relógio do navegador fixo no mesmo instante;
- usuário `lucas`.

Navegue até o mesmo estado da referência:
- 06 é a locação LOC-0029;
- 08 é a unidade MAR-002;
- 10 é o cliente José Carlos;
- 12 é a saída de LOC-0029 / MAR-002, com os 6 primeiros itens marcados OK;
- 04 é Nova locação para Cícero Santos, com a pistola de pintura e 12 peças de andaime, de 07/11 a 10/11, em Viçosa, com a observação do design.

Capture **do mesmo jeito que o gerador das referências**: viewport do tamanho do conteúdo (`scrollHeight`) e depois `page.screenshot()`, para a barra inferior do celular ficar no fim. Antes de capturar, espere as fontes (`document.fonts.ready`) e as imagens carregarem, e desligue cursor piscando e animações. Salve em `apps/e2e/visual-output/app/<mesmo nome da referência>.png`.

### 6.2 Relatório lado a lado

Um script `bun run e2e:visual` gera `apps/e2e/visual-output/index.html` com, para cada par:
- **Design | App | Diferença**, usando `pixelmatch` (via `pngjs`). Quando as alturas forem diferentes, alinhe pelo topo e preencha o resto.
- O percentual de pixels diferentes e a diferença de altura.
- Ordenação da maior diferença para a menor.

Não espere 0%: os dados reais, a fonte e o navegador mudam detalhes. Use o relatório para **encontrar** as diferenças, não como aprovação automática.

### 6.3 Corrigir

Abra cada par (você consegue ver as imagens) e compare, nesta ordem de importância:
1. Estrutura e navegação.
2. Hierarquia e textos.
3. Cores, inclusive os chips de status.
4. Tipografia: Archivo condensada nos títulos.
5. Espaçamentos e raios.
6. Ícones.
7. O que muda entre os três tamanhos.

Corrija no front, ou no backend se for dado, até que **cada tela fique visualmente equivalente à referência**. Rode `e2e:visual` de novo depois de cada rodada de correções.

### 6.4 Diferenças aceitas

`docs/design/diferencas-aceitas.md` tem uma linha por diferença que **fica**: tela, tamanho, o que muda e por quê. Motivos válidos:
- dado real diferente do exemplo;
- componente do shadcn com comportamento melhor;
- acessibilidade;
- erro no design.

"Deu trabalho" não é motivo.

### 6.5 Linha de base de regressão

Quando o relatório estiver bom, crie `apps/e2e/tests/visual/regressao.spec.ts` com `expect(page).toHaveScreenshot()` para cada tela e tamanho, no mesmo estado:
- mascare só o que muda sozinho (horários relativos, contagem regressiva, se houver);
- `maxDiffPixelRatio` de 0,01;
- linhas de base geradas com `--update-snapshots` e versionadas no repositório.

**Atenção:** linhas de base dependem do sistema operacional. Gere no mesmo ambiente do CI, usando a imagem Docker oficial do Playwright na mesma versão instalada (`mcr.microsoft.com/playwright:v<versão>-noble`) e um script `e2e:update` que roda dentro dela.

## 7. Scripts

Na raiz:
- `e2e`: tudo, exceto o relatório visual;
- `e2e:ui`: Playwright UI;
- `e2e:visual`: captura e relatório lado a lado;
- `e2e:update`: atualiza as linhas de base dentro do container do Playwright;
- `e2e:mock`: a suíte de fluxos com `VITE_DATA_SOURCE=mock` e sem servidor. Os testes que dependem de rotas de teste do servidor, upload real ou duas abas pulam no modo mock, com `test.skip` e o motivo.

## 8. CI

Se `.github/workflows/ci.yml` existir, acrescente um job `e2e`:
- serviços `postgres:18` e MinIO;
- roda dentro da imagem do Playwright na mesma versão;
- executa `e2e` e a regressão visual (não o relatório).
- Se falhar, publica como artefato o relatório HTML do Playwright, os traces e as diferenças.

Se o arquivo não existir, documente os passos em `apps/e2e/README.md`.

## 9. Ordem de trabalho

1. **Ligação:** `.env`, relógio de teste, rotas de teste, MinIO e um passeio manual pelas telas com `VITE_DATA_SOURCE=http`, corrigindo o que quebrar.
2. **Base do E2E:** pacote `apps/e2e`, `webServer`, projetos, login por papel e guardas de console e rede.
3. **Fluxos** da seção 4, corrigindo os bugs encontrados.
4. **Qualidade** da seção 5.
5. **Visual:** captura, relatório, rodadas de correção e diferenças aceitas.
6. **Regressão visual**, scripts e CI.

Em cada fase: `check-types`, Biome, testes unitários e de cenário, e a parte do E2E que já existe. Commits `test(e2e): …` e `fix(web): …`.

## 10. Resumo final

- Quantos testes há e quantos passam, por projeto.
- Os bugs encontrados e corrigidos, separados entre front, back e mock.
- Uma tabela das 40 telas e tamanhos com o percentual de diferença antes e depois das correções.
- O link para `apps/e2e/visual-output/index.html`.
- As diferenças aceitas.
- O que ficou pendente.

Atualize o `CLAUDE.md` com a seção "Testes E2E e visuais".
