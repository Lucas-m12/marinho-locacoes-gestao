# Prompt 01 — Telas do sistema Marinho (front-end funcional com mock)

> Leia este arquivo inteiro antes de começar. Depois leia `docs/design/README.md` e os arquivos de `docs/design/`. Trabalhe em fases (seção 10), rode as verificações de cada fase e faça um commit ao fim de cada uma.

## 1. Contexto

A **Marinho Locações** é uma locadora familiar de equipamentos para obra em Cajueiro (AL) e região: ferramentas elétricas (códigos MAR-001 a MAR-017), andaime (contado por peça) e carrocinha. Atendimento pelo WhatsApp, entrega e coleta na obra, sem loja aberta.

Três pessoas usam o sistema, cada uma com login próprio:

| Papel (`role`) | Quem | O que faz no sistema |
| --- | --- | --- |
| `MANAGER` (gestão) | Lucas | Tudo: cadastro de equipamentos, preços, despesas, painel, configurações, acessos |
| `ATTENDANT` (atendimento) | Esposa | Agenda, orçamentos, reservas, prorrogações, pagamentos, caução, clientes, demanda perdida |
| `EQUIPMENT` (equipamentos) | Pai | O que sai e volta hoje, separação, checklist de saída e volta, status das unidades, manutenção |

O uso principal é **no celular**: a atendente consulta a agenda com o cliente esperando no WhatsApp, e quem cuida dos equipamentos faz o checklist com fotos na garagem e na obra.

## 2. Objetivo e escopo

Implementar **todas as telas** desenhadas, responsivas (celular 390 px, tablet 834 px, desktop 1440 px) e **funcionais de ponta a ponta contra um backend simulado (mock) que roda no navegador**. A arquitetura precisa permitir trocar o mock pelo backend real mudando só uma variável de ambiente.

**Fora de escopo agora (não mexa):**
- `apps/server`, `packages/api`, `packages/auth` e `packages/db`. O backend vem depois e vai implementar o mesmo contrato.
- Schema do Prisma e migrations.
- WhatsApp (API, links ou bots).
- PWA e funcionamento offline.
- Modo escuro.

## 3. O que já existe no repositório

Monorepo criado com Better-T-Stack: Bun workspaces + Turborepo, Biome (indentação com tab, aspas duplas), TypeScript estrito com `noUncheckedIndexedAccess`.

- `apps/web`: React 19, Vite, TanStack Router (rotas em arquivo, `src/routes`), TanStack Query, TanStack Form, `sonner`, `lucide-react`, Tailwind v4. Hoje `src/utils/orpc.ts` cria um cliente oRPC tipado pelo `AppRouterClient` de `@marinho-gestao/api` e aponta para `VITE_SERVER_URL/rpc`. A autenticação usa `better-auth/react` (`src/lib/auth-client.ts`), e a rota `_auth/route.tsx` protege as telas.
- `packages/ui`: primitivos do shadcn/ui no estilo `base-lyra` (Base UI). Tokens ficam em `packages/ui/src/styles/globals.css`. Para adicionar componentes, rode `bunx shadcn@latest add <componente>` dentro de `apps/web`: o `components.json` já manda os arquivos para `packages/ui`.
- Variáveis de ambiente com **varlock**: o schema fica em `apps/web/.env.schema`, os tipos são gerados com `bun run env:generate`, e os valores públicos são expostos em `src/env.public.ts`.
- `apps/web/public/brand/`: SVGs oficiais da marca (`marinho-simbolo.svg`, `marinho-simbolo-negativo.svg`, `marinho-logo.svg`, `marinho-logo-negativo.svg`). Use-os exatamente como estão: sem redesenhar, recolorir ou distorcer.
- `docs/design/`: código-fonte das telas desenhadas, usado como especificação. Veja `docs/design/README.md`.
- `.agents/skills/`: skills de shadcn, TanStack, Hono, Prisma e boas práticas de React. Consulte as de shadcn e React antes de compor componentes.

Use a versão instalada de cada biblioteca. Para APIs do oRPC (contrato primeiro, `implement`, `createRouterClient`, integração com TanStack Query), TanStack Router e Base UI, consulte a documentação atual (Context7 ou o site oficial) antes de escrever código. Não confie em memória.

## 4. Arquitetura

```
packages/
  contract/      NOVO  contrato oRPC + schemas Zod (fonte da verdade da API)
  domain/        NOVO  regras de negócio puras (sem I/O), testadas
  ui/                  primitivos shadcn + tokens da marca
apps/web/src/
  data/
    client.ts          escolhe a fonte (mock | http) e exporta client + orpc utils
    http/              link HTTP real (RPCLink)
    mock/              backend simulado: implement(contract) + store + seed
    auth/              AuthGateway: mock | better-auth
    uploads/           UploadService: presigned URL (real) | IndexedDB (mock)
  features/<modulo>/   componentes, hooks e formulários por módulo
  components/          shell (sidebar, trilho, barra inferior), StatusChip, Money…
  routes/              rotas finas: só montam a tela da feature
```

### 4.1 `packages/contract` (novo)

- Pacote `@marinho-gestao/contract`. Depende só de `@orpc/contract`, `zod` e `@marinho-gestao/domain`, para os tipos e enums compartilhados.
- Exporta `contract`: um objeto de procedimentos `oc.input(...).output(...)` agrupados por módulo, e todos os schemas Zod (entidades, inputs, outputs, enums).
- Erros tipados com `.errors({...})` onde a tela precisa reagir de forma específica: `CONFLICT` (período ocupado, com as unidades em conflito em `data`), `INVALID_TRANSITION` (mudança de status inválida), `NOT_FOUND`, `FORBIDDEN` e `PRECONDITION_FAILED` (ex.: tipo sem preço).
- O tipo do cliente do front é `ContractRouterClient<typeof contract>`.
- **Regras do contrato:**
  - Dinheiro sempre em **centavos inteiros** (`amountCents: number`).
  - Datas em ISO 8601 com fuso; o fuso de negócio é `America/Maceio`.
  - IDs internos são `string` (cuid/uuid). Os códigos de negócio são campos próprios: `LOC-0001`, `MAR-001`, `OS-001`.
  - Valores que o negócio ainda não definiu são `nullable` no schema e aparecem na interface como "a definir" (seção 7).
- **Procedimentos mínimos.** Ajuste os nomes se precisar, mas mantenha a cobertura:
  - `session.me`
  - `dashboard.today`, `dashboard.summary({ from, to })`
  - `availability.search({ query | typeId, start, end })` e `availability.calendar({ start, days })`. O calendário traz uma linha por unidade, com o estado de cada dia, e as peças de andaime livres por dia.
  - `equipment.listTypes`, `equipment.listUnits({ status?, q? })`, `equipment.getUnit({ code })`, `equipment.createType`, `equipment.updateType`, `equipment.createUnit`, `equipment.updateUnit`, `equipment.changeUnitStatus({ code, to, reason? })`, `equipment.addUnitPhoto`, `equipment.addKnownDamage`, `equipment.listLots` (andaime e carrocinha) e `equipment.updateLot`.
  - `customers.list({ q?, segment? })`, `customers.get`, `customers.create`, `customers.update`, `customers.addDocument`.
  - `rentals.list({ tab, q? })`, `rentals.get({ number })`, `rentals.createQuote` (rascunho), `rentals.sendQuote` (passa a "aguardando sinal" e segura as unidades por 24 h), `rentals.recordPayment`, `rentals.confirm`, `rentals.markSeparated`, `rentals.extend`, `rentals.cancel`, `rentals.close`, `rentals.copyQuoteText` (texto do orçamento para colar no WhatsApp; só texto, sem integração).
  - `rentals.recordLostDemand` e `rentals.listLostDemand`.
  - `inspections.get({ rentalNumber, unitCode, kind: "CHECKOUT" | "RETURN" })`, `inspections.saveItem`, `inspections.attachMedia`, `inspections.complete`. Concluir a volta gera ocorrências para cada divergência entre saída e volta.
  - `deposits.recordReceived`, `deposits.recordRefund`, `deposits.recordRetention({ amountCents, reason })`. A retenção também lança uma entrada no caixa.
  - `ledger.list({ account: "CASH" | "DEPOSIT", from, to })`, `ledger.create`, `ledger.byCategory({ from, to })`, `ledger.receivables`.
  - `maintenance.list`, `maintenance.open`, `maintenance.complete({ finalCostCents })`. Concluir lança a despesa no caixa e muda o status da unidade.
  - `settings.get` e `settings.update`: diária e caução por tipo, taxa de entrega por município, regra do sinal, folga entre locações por tipo e prazo do sinal.
  - `users.list` e `users.update` (papel). Só `MANAGER`.
  - `uploads.requestUpload`, `uploads.completeUpload`, `files.getDownloadUrl` (seção 4.5).

### 4.2 `packages/domain` (novo)

Funções **puras** (sem I/O, sem `Date.now()` escondido: recebem `now`), usadas agora pelo mock e depois pelo backend. Cada uma com testes em **Vitest** (adicione o Vitest ao pacote):

- `money`: formatação BRL (`R$ 1.234,56`), soma e porcentagem, sempre em centavos.
- `countDailies(start, end, tz)`: **regra provisória**, numa função só e documentada como provisória. Conta os dias de calendário de saída a devolução, contando os dois. Exemplo: sábado 08:00 → terça 17:00 = 4 diárias.
- `quoteTotals({ items, deliveryFeeCents, discountCents })`: subtotal por item (`dailyPrice × diárias`, e para andaime `preço por peça × peças × diárias`), total e caução somada (null se alguma for null).
- `overlaps` e `isUnitAvailable({ unit, start, end, bookings, maintenance, turnaroundHours })`: segue a regra do documento de requisitos. A unidade está livre de A a B se não estiver Bloqueada, Danificada, Não devolvida ou Aposentada; se estiver Em manutenção, só se a previsão de volta for antes de A; e se nenhuma reserva ativa dela cruzar [A, B + folga].
- `availableLotQuantity({ total, inMaintenance, retired, bookings, start, end })` para o andaime.
- `unitStatusMachine`: transições válidas da unidade. Está em `docs/design/mapa/status-do-equipamento.dc.html` e é resumida abaixo.
- `rentalStatusMachine`: `QUOTE → AWAITING_DEPOSIT → CONFIRMED → SEPARATED → ON_SITE → RETURNED → CLOSED`, mais `CANCELED` e `EXPIRED` (sinal não pago no prazo). "Atrasada" **não é status**: é derivada de `ON_SITE` com devolução prevista no passado.
- `customerTier(history)`: Bloqueado > Atenção > Confiável > Recorrente > Novo, pelas regras da seção 7.
- `nextCode(prefix, existing)`: gera `LOC-0001`, `OS-001` e afins.

Transições da unidade:

| De | Para |
| --- | --- |
| Disponível | Separado, Bloqueado, Em manutenção, Aposentado |
| Separado | Alugado, Disponível |
| Alugado | Em inspeção, Não devolvido |
| Em inspeção | Disponível, Em manutenção, Danificado |
| Em manutenção | Disponível, Em inspeção |
| Danificado | Em manutenção, Aposentado |
| Não devolvido | Em inspeção (recuperado), Aposentado |
| Bloqueado | Disponível |
| Aposentado | (final) |

### 4.3 Camada de dados do front (`apps/web/src/data`)

- Nova variável pública `VITE_DATA_SOURCE` do tipo `enum(mock, http)`, com padrão `mock`. Declare em `apps/web/.env.schema` (com `@public`), rode `bun run env:generate` e exponha em `src/env.public.ts`. Em `http`, `VITE_SERVER_URL` continua obrigatória. Em `mock`, ela não é usada.
- `data/client.ts` exporta `client: ContractRouterClient<typeof contract>` e `orpc = createTanstackQueryUtils(client)`.
  - `mock`: `createRouterClient(mockRouter, { context: () => ({ session }) })`, com o `mockRouter` vindo de `data/mock` por **import dinâmico**, para o mock não entrar no bundle de produção em modo `http`.
  - `http`: `createORPCClient(new RPCLink({ url: VITE_SERVER_URL + "/rpc", fetch: ... credentials: "include" }))`.
- **Nenhum componente importa nada de `data/mock`, `data/http`, `better-auth` ou `fetch` direto.** As telas usam só `orpc.*.queryOptions()` / `mutationOptions()`, o `AuthGateway` e o `UploadService`. Trocar a fonte não pode exigir mudança em nenhuma tela.
- Remova a dependência do web em `@marinho-gestao/api`: hoje ele importa `AppRouterClient`, e passa a usar o tipo do contrato. Ajuste `__root.tsx`, `main.tsx`, `utils/orpc.ts` e os scripts `build` e `check-types` do `apps/web/package.json`, que hoje compilam `packages/api`, se deixarem de fazer sentido.
- Erros: um `QueryCache`/`MutationCache` global mostra toast em pt-BR. `CONFLICT`, `INVALID_TRANSITION` e `PRECONDITION_FAILED` são tratados na própria tela, com mensagem específica.
- Invalidação: cada mutation invalida as queries dos módulos que afeta. Por exemplo, `rentals.sendQuote` invalida `rentals`, `availability` e `dashboard`.

### 4.4 Backend simulado (`apps/web/src/data/mock`)

- `mockRouter = implement(contract)` com handlers que validam com o próprio contrato e aplicam as regras de `packages/domain`. Como implementa o contrato, o TypeScript acusa erro se o mock sair dele.
- Store em memória, persistido no `localStorage` com chave versionada (`marinho:mock:v1`) e migração simples: se a versão mudar, ressemeia.
- Latência simulada de 150 a 400 ms por chamada, para os estados de carregamento aparecerem.
- Checa o papel do usuário (`FORBIDDEN`) nas mesmas regras que o backend terá. Exemplos: só `MANAGER` mexe em configurações e usuários; `EQUIPMENT` não vê o módulo Dinheiro.
- O mock **recusa reserva dupla** com `CONFLICT`. Esta é a regra que o Postgres vai garantir depois com uma `EXCLUDE constraint`.
- Expiração de sinal: ao ler os dados, orçamentos `AWAITING_DEPOSIT` com prazo vencido viram `EXPIRED` e liberam as unidades.
- **Seed relativa a "hoje"**, para a demonstração sempre parecer viva: D0 = hoje, D-1 = ontem e assim por diante. Use os dados de `renderVals()` das telas em `docs/design/telas/` e a tabela da seção 8. Em Configurações, no modo mock, um botão "Restaurar dados de exemplo" ressemeia tudo.
- Usuários do mock: `lucas@marinho.local` (MANAGER), `atendimento@marinho.local` (ATTENDANT) e `equipamentos@marinho.local` (EQUIPMENT), todos com a senha `marinho123`. Só no modo mock, a tela Entrar mostra uma dica com esses acessos.

### 4.5 Upload por presigned URL

Fluxo único, igual no mock e no real. As telas só chamam `uploadService.upload(file, { purpose, onProgress })`:

1. `uploads.requestUpload({ purpose, fileName, contentType, sizeBytes })` devolve `{ fileKey, uploadUrl, method: "PUT", headers, expiresAt }`. Os `purpose` são: `UNIT_PHOTO`, `DAMAGE_PHOTO`, `CHECKLIST_PHOTO`, `CHECKLIST_VIDEO`, `CUSTOMER_DOCUMENT` e `RECEIPT`.
2. O front envia o arquivo com `PUT` direto para `uploadUrl`, com os `headers` recebidos, **sem passar pelo backend**. Use `XMLHttpRequest` para ter o progresso.
3. `uploads.completeUpload({ fileKey })` devolve um `FileRef { fileKey, contentType, sizeBytes, uploadedAt }`. A mutation da tela (ex.: `inspections.attachMedia`) então recebe o `fileKey`.
4. Para exibir, `files.getDownloadUrl({ fileKey })` devolve uma URL temporária. O bucket é privado, porque documentos de clientes são dados pessoais. Faça cache da URL até `expiresAt`.

Detalhes:
- No mock, `uploadUrl` é `mock-upload://<fileKey>`. O `UploadService` reconhece o esquema e grava o `Blob` no **IndexedDB** (use `idb-keyval`), e `getDownloadUrl` devolve um `URL.createObjectURL` do blob guardado.
- **Antes de enviar fotos, reduza no navegador:** lado maior com até 2000 px, JPEG com qualidade 0,85. As fotos são tiradas no celular, muitas vezes com 4G fraco.
- Limites: imagem até 10 MB depois de reduzir, vídeo até 50 MB e 30 s, documento até 10 MB (imagem ou PDF).
- No celular, use `<input type="file" accept="image/*" capture="environment">` para abrir a câmera direto.
- Mostre o progresso, permita tentar de novo em caso de falha e não deixe concluir um checklist com upload em andamento.

### 4.6 Autenticação no front

- Interface `AuthGateway { getSession(); signIn(email, password); signOut(); }`, com duas implementações: mock (sessão no `localStorage`) e real (`better-auth/react`). A sessão inclui `user.role`.
- **Sem cadastro público.** Apague `sign-up-form.tsx` e o alternar entre entrar e cadastrar. Contas são criadas pelo `MANAGER` em Configurações (no mock) ou pelo backend no futuro.
- A rota `_auth` usa o `AuthGateway` no `beforeLoad` e manda para `/entrar` quem não tem sessão.
- Menu e rotas respeitam o papel: esconda o que o papel não usa e, se acessar a URL direto, mostre "Sem acesso" com um link de volta.

## 5. Visual

Siga a identidade da marca. A referência visual exata de cada tela está em `docs/design/telas/`.

**Cores.** Troque os tokens do shadcn em `packages/ui/src/styles/globals.css`. Use **só tema claro**: remova o `.dark`, o `ThemeProvider` e o `mode-toggle`.

| Uso | Cor |
| --- | --- |
| Fundo da página (areia) | `#F2E8D7` |
| Cartões e superfícies (creme) | `#FBF6EC` |
| Primária: azul-marinho (botão principal, menu, títulos) | `#13294B` |
| Texto sobre o azul | `#FBF6EC`; secundário `#C9D2DF` |
| Destaque sobre o azul (botão "Nova locação" no menu) | terracota claro `#E58A5F`, com texto azul |
| Destaque sobre o claro | terracota `#B4532A`: texto pequeno **só sobre creme**; sobre areia, só texto grande |
| Texto secundário sobre o claro | `#5E544C` |
| Linhas internas | `#E6DAC6`; borda de campos `#8C8070`; fundo de campos `#FFFFFF` |
| Erro e alertas | `#8A3A1A` sobre `#F7DCCF` |

Chips de status: Disponível `#E2EADF`/`#2E4F2E` · Separado e Confirmada `#DCE3EE`/`#13294B` · Alugado e Na obra `#13294B`/`#FBF6EC` · Em inspeção e Aguardando sinal `#EFE6D6`/`#5E544C` · Em manutenção, Atrasada e Danificado `#F7DCCF`/`#8A3A1A`. Crie tokens semânticos (`--status-available` etc.) e um componente `StatusChip` único. O status nunca depende só da cor: o texto sempre aparece.

**Tipografia.** Só **Archivo**, fonte variável com o eixo de largura. Instale `@fontsource-variable/archivo` se ele trouxer o eixo `wdth`; se não, use o Google Fonts (`Archivo:wdth,wght@62..125,100..900`).
- Títulos de tela e de seção: `font-stretch: 75%`, peso 800, caixa alta.
- Nome da marca: `font-stretch: 125%`, peso 800.
- Textos: 400 a 600.
- Substitua a Inter em `--font-sans`.

**Forma.** Cartões com raio de 14 px, botões e campos com 10 px. Sem sombras, degradês ou emojis. Ícones de linha do `lucide-react`. Detalhe da marca: faixa inferior dividida 3:1, azul-marinho e terracota, em painéis de destaque.

**Responsivo.** Mobile-first, com três layouts:

| Tamanho | Largura | Navegação | Conteúdo |
| --- | --- | --- | --- |
| Celular | < 768 px | Barra inferior fixa: Painel, Agenda, **Nova** (destaque), Locações, Mais. Topo com símbolo e avatar. | Uma coluna; tabelas viram cartões |
| Tablet | 768–1279 px | Trilho lateral de 88 px, ícones com rótulo curto, botão "+" no topo | Uma coluna; tabelas com menos colunas |
| Desktop | ≥ 1280 px | Barra lateral de 248 px: logo, "Nova locação", menu e usuário no rodapé | Duas colunas onde o design mostra |

**Acessibilidade.**
- Alvos de toque com pelo menos 44 px.
- Contraste mínimo de 4,5:1.
- Use `<button>`, `<a>` e `<label>` de verdade.
- `aria-current="page"` no item ativo do menu.
- Foco visível.
- Formulários com mensagens de erro ligadas ao campo.
- Respeite `prefers-reduced-motion`.

**Estados obrigatórios em toda tela:** carregando (skeleton), vazio (texto que diz o que fazer), erro (com "Tentar de novo") e sucesso das mutations (toast).

**Formatos.** Tudo em **pt-BR**. Datas com `date-fns` e locale `ptBR` no fuso `America/Maceio` (ex.: "Sáb, 07/11 · 08:00"). Dinheiro como "R$ 1.234".

## 6. Telas e rotas

As rotas ficam em português, porque a família vê as URLs. Cada rota só monta a tela, e a lógica fica em `features/`. Para cada tela, siga o arquivo de referência indicado.

| # | Rota | Referência | Papéis |
| --- | --- | --- | --- |
| 01 | `/entrar` | `TelaEntrar` | todos |
| 02 | `/painel` (e `/` redireciona para ela) | `TelaPainel` | todos (EQUIPMENT não vê dinheiro) |
| 03 | `/agenda` | `TelaAgenda` | todos |
| 04 | `/locacoes/nova` | `TelaNovaLocacao` | MANAGER, ATTENDANT |
| 05 | `/locacoes` (`?aba=abertas|encerradas|perdidas&q=`) | `TelaLocacoes` | todos |
| 06 | `/locacoes/$numero` | `TelaLocacao` | todos (ações conforme o papel) |
| 07 | `/estoque` (`?status=&q=`) | `TelaEstoque` | todos |
| 08 | `/estoque/$codigo` | `TelaUnidade` | todos |
| 09 | `/clientes` (`?segmento=&q=`) | `TelaClientes` | MANAGER, ATTENDANT |
| 10 | `/clientes/$id` | `TelaCliente` | MANAGER, ATTENDANT |
| 11 | `/dinheiro` (`?conta=caixa|caucao|receber`) | `TelaDinheiro` | MANAGER, ATTENDANT |
| 12 | `/locacoes/$numero/saida/$unidade` e `/locacoes/$numero/volta/$unidade` | `TelaChecklist` | todos |
| 13 | `/manutencao` | `TelaManutencao` | MANAGER, EQUIPMENT |
| 14 | `/mais` (só celular; em telas maiores redireciona para `/painel`) | `Mais` | todos |
| 15 | `/configuracoes` (`?aba=precos|entrega|regras|pessoas`) | sem desenho: siga o mesmo padrão visual | MANAGER |

Filtros, abas e busca ficam na URL como search params validados com Zod, para o link da tela poder ser compartilhado.

### O que cada tela precisa **fazer** (além de ficar igual ao desenho)

1. **Entrar:** login com validação, mensagem clara de erro e "Continuar conectado". No desktop, o painel azul de marca fica à esquerda; no tablet e no celular, o logo fica acima do formulário. Depois de entrar, vai para `/painel` ou para a URL que a pessoa tentava abrir.

2. **Painel**
   - Saudação com a data de hoje.
   - Alerta de atrasados, com link para a locação.
   - KPIs dos últimos 30 dias: entrou, saiu, resultado e caução em mãos.
   - "Saem hoje" e "Voltam hoje", com atalho para a locação.
   - "Equipamentos agora" (contagem por status, em barras) e peças de andaime livres hoje.
   - "Aguardando sinal" com contagem regressiva do prazo.
   - Quem tem papel EQUIPMENT não vê os blocos de dinheiro.

3. **Agenda**
   - Busca por equipamento (nome, código ou apelido: "maquita" encontra a serra mármore) e período.
   - O resultado mostra cada unidade como "livre no período" (com o valor calculado e o botão **Reservar**, que abre Nova locação já preenchida) ou "ocupada até X" (com "livre a partir de" e **Registrar demanda perdida**).
   - Calendário com 14 dias no desktop, 7 no tablet e 5 no celular, navegação de período, legenda e peças de andaime livres por dia.
   - Tocar num dia livre abre Nova locação com a unidade e a data.

4. **Nova locação**
   - Seções: 1 Cliente (busca, ou cadastro rápido numa gaveta lateral), 2 Período, 3 Equipamentos (adicionar e tirar, mostrando a disponibilidade; tipo sem preço bloqueia com aviso), 4 Entrega (modalidade, endereço, link do pino e taxa do município), 5 Observações.
   - Resumo ao vivo, calculado em `domain`: fixo à direita no desktop e no fim da página no tablet e no celular.
   - **Salvar rascunho** cria o orçamento sem segurar as unidades.
   - **Salvar e enviar orçamento** passa para "aguardando sinal", segura as unidades por 24 h e oferece **Copiar texto do orçamento**.
   - Se o mock devolver `CONFLICT`, a unidade em conflito fica marcada e aparecem as alternativas livres.
   - Avisa quando falta o documento de um cliente novo.

5. **Locações**
   - Abas Abertas, Encerradas e Demanda perdida, com busca.
   - Tabela no desktop e no tablet, cartões no celular.
   - "Atrasada" aparece como chip derivado.
   - Cartão "Demanda perdida" com o botão **Registrar pedido não atendido** (equipamento ou tipo pedido, motivo, município, data).

6. **Locação (detalhe)**
   - Linha do andamento: horizontal no desktop e no tablet, vertical no celular.
   - Ações conforme o status e o papel: registrar sinal (pagamento), confirmar, marcar separada, **Registrar entrega** (abre o checklist de saída de cada unidade), prorrogar (diálogo que checa a agenda e recalcula o valor), **Registrar devolução** (checklist de volta), encerrar e cancelar (com motivo).
   - Equipamentos com o preço congelado.
   - Obra e entrega.
   - Pagamentos (sinal, saldo, taxa, consumível e diária extra; forma Pix ou dinheiro).
   - Caução (recebida, devolvida em até 24 h ou retida com valor e motivo).
   - Cliente resumido.
   - Histórico automático: quem fez o quê, e quando.

7. **Estoque**
   - Filtros por status com contagem, busca por código, nome ou apelido.
   - Tabela no desktop e no tablet, cartões no celular.
   - Cartões de andaime e carrocinha, contados por quantidade.
   - **Cadastrar equipamento** (gaveta lateral): tipo novo ou unidade de um tipo existente. Os campos de tipo e de unidade estão no documento de requisitos e no desenho.

8. **Unidade**
   - Fotos: principal, frente, verso, placa e nº de série, enviadas por upload.
   - Ficha editável.
   - **Mudar status**: só aparecem as transições válidas da máquina de estados, e o motivo é obrigatório para Bloqueado, Danificado e Aposentado.
   - "Quanto rendeu" (F2: deixe visível e calculado com o que existe).
   - Locações da unidade.
   - Danos que já tinha, com foto. Eles aparecem automaticamente no checklist para ninguém cobrar o cliente duas vezes.

9. **Clientes**
   - Filtros por segmento: todos, profissionais, reforma da casa e atenção.
   - Busca.
   - Situação calculada (chip).
   - **Cadastrar cliente** (gaveta lateral): PF, profissional ou empresa, com os campos da seção 7.

10. **Cliente:** números (locações, total gasto, atrasos, saldo em aberto), dados, documentos (upload e visualização por URL temporária; o aviso "Só vocês três têm acesso" continua), locações, observações editáveis e **Nova locação para ele**.

11. **Dinheiro**
   - Abas Caixa, Caução e A receber.
   - KPIs.
   - Lançamentos com entrada em verde e saída em terracota, e o vínculo (locação ou unidade).
   - Totais por categoria com barras.
   - **Entrada** e **Despesa** abrem um diálogo: valor, data, categoria, forma, vínculo opcional e comprovante opcional por upload.
   - A aba Caução mostra recebidas, devolvidas e retidas, separadas do caixa.

12. **Saída e volta (checklist)**
   - Os itens vêm do checklist do tipo de equipamento. Cada item tem OK, Não OK ou N/A, mais uma observação.
   - Danos que a unidade já tinha aparecem preenchidos.
   - Fotos nos mesmos ângulos e vídeo do teste de 10 s, todos por upload, com progresso.
   - Na saída: termo assinado, saldo recebido e caução recebida (os dois lançam no dinheiro).
   - Na volta: mostra lado a lado o que foi registrado na saída. Cada divergência vira ocorrência (dano, peça faltando, sujeira) com valor sugerido e decisão (cobrar, perdoar ou em disputa).
   - **Concluir saída**: unidade vai de Separado para Alugado e a locação para Na obra.
   - **Concluir volta**: unidade vai para Em inspeção e depois Disponível (ou Em manutenção ou Danificado, conforme o resultado). A locação vai para Devolvida.
   - Botões grandes, pensados para usar com uma mão no celular.

13. **Manutenção**
   - KPIs.
   - Ordens de serviço em cartões.
   - **Abrir ordem de serviço**: unidade, motivo, onde (assistência ou na base), custo previsto e previsão de volta. A unidade passa para Em manutenção.
   - **Marcar como pronta**: custo final, lança a despesa no caixa e muda o status da unidade.
   - "Revisões programadas" fica como texto informativo (F2).

14. **Mais:** lista de Estoque, Clientes, Dinheiro, Manutenção, Configurações e Sair, filtrada pelo papel.

15. **Configurações**
   - Preços e cauções por tipo (diária; caução pode ficar em branco).
   - Taxa de entrega por município (Cajueiro, Capela, Viçosa, Chã Preta, Paulo Jacinto, Mar Vermelho, Maribondo, Pindoba, Atalaia, Pilar e Murici).
   - Regras: valor ou percentual do sinal, prazo do sinal (24 h), folga entre locações por tipo e regra provisória das diárias (somente leitura, com aviso).
   - Pessoas: lista e papel.
   - "Restaurar dados de exemplo", só no mock.

## 7. Regras de negócio e pendências

- **Pendências do negócio.** Não invente valores. Os campos ficam `null` e a interface mostra "a definir":
  - Caução de cada tipo: se faltar, o orçamento mostra "a definir" e o valor é digitado na entrega.
  - Taxa de entrega por município: se faltar, é digitada no orçamento.
  - Valor do sinal.
  - Regra de atraso: sugira diárias extras × diária, editável e marcada como "regra provisória".
  - Diária de MAR-005, MAR-012 e MAR-016.
  - Voltagem marcada como [CONFERIR].
  - Acessórios de cada tipo.
  - Composição do kit de andaime.
- **Preço congelado**: quando o sinal entra, os preços da locação deixam de acompanhar a tabela.
- **Caução não é faturamento**: fica numa conta separada. Só a parte retida vira entrada no caixa, e sempre com motivo.
- **Folga entre locações**: por tipo, configurável. A semente usa 12 h.
- **Prazo do sinal**: 24 h. Depois disso, o orçamento expira e libera a agenda.
- **Situação do cliente**, da mais forte para a mais fraca:
  1. Bloqueado: manual ou saldo vencido.
  2. Atenção: atraso acima de 1 dia sem aviso, ou dano em disputa.
  3. Confiável: 3 locações sem atraso, dano ou saldo.
  4. Recorrente: 2 ou mais locações em 90 dias.
  5. Novo: nenhuma ou só a primeira locação.
  A situação é calculada. Só Bloqueado pode ser marcado à mão.
- **Campos do cliente**:
  - Tipo (PF, profissional ou empresa); nome ou razão social; CPF ou CNPJ.
  - Responsável e pessoas autorizadas a receber (empresa).
  - WhatsApp e telefone alternativo.
  - Endereço, bairro e cidade.
  - Profissão ou atividade.
  - Origem (Instagram, Google, indicação ou loja parceira) e quem indicou.
  - Aceite de mensagens promocionais.
  - Observações.
  O endereço da **obra** fica na locação, não no cliente.
- **Andaime e carrocinha** são controlados por quantidade (lotes), não por unidade com código.

## 8. Dados de exemplo (seed)

**Tipos e unidades (catálogo real).** Diária em reais; "—" = sem preço ainda.

| Código | Equipamento | Diária |
| --- | --- | --- |
| MAR-001 | Martelete Bosch GBH 2-28 D | 80 |
| MAR-002 | Martelo demolidor Bosch GSH 500 | 100 |
| MAR-003 | Furadeira de impacto DeWalt | 30 |
| MAR-004 | Furadeira de impacto Black+Decker | 30 |
| MAR-005 | Parafusadeira a bateria The Black Tools 21 V | — |
| MAR-006 | Esmerilhadeira Bosch GWS 6-100 | 50 |
| MAR-007 | Esmerilhadeira Black+Decker | 50 |
| MAR-008 | Serra mármore Makita 4100NH3 (apelido "maquita") | 40 |
| MAR-009 | Serra circular Makita HS7010 | 60 |
| MAR-010 | Serra circular The Black Tools 1.100 W | 40 |
| MAR-011 | Serra tico-tico Wesco | 40 |
| MAR-012 | Plaina elétrica Nakasaki NK2823B | — |
| MAR-013 | Tupia laminadora 800 W | 40 |
| MAR-014 | Lixadeira roto-orbital Arstheco | 40 |
| MAR-015 | Pistola de pintura a bateria Yankee Ferr | 50 |
| MAR-016 | Máquina de solda Tork KAB 180 BV + máscara | — |
| MAR-017 | Aspirador de pó e água WAP GTW Inox 12 | 40 |

Lotes: **Andaime**, 20 peças, R$ 2 por peça por dia. **Carrocinha**, 1, R$ 80 por dia. Todas as cauções ficam `null`.

**Situação do exemplo** (D0 = hoje). Reproduza a semana mostrada nas telas, com as datas relativas:
- LOC-0026: Rafael Lima (encanador, Atalaia), MAR-006, de D-3 a D0 17:00. Na obra; sinal R$ 50 e saldo R$ 150.
- LOC-0027: Pedro Henrique (eletricista, Cajueiro), MAR-001, de D-3 a D0 12:00. Na obra.
- LOC-0028: João Batista (pedreiro, Pilar), MAR-008, de D-4 a D-1 17:00. **Atrasada.**
- LOC-0029: José Carlos (pedreiro, Capela, situação Confiável, 3 locações), MAR-002, de D0 08:00 a D+6 17:00, R$ 700. Confirmada; MAR-002 Separado; sinal de R$ 200 por Pix em D-2.
- LOC-0030: Antônio Ferreira (pequeno empreiteiro, Cajueiro), andaime 8 peças, de D0 09:30 a D+14. Confirmada.
- LOC-0031: Ana Paula (reforma da casa, Cajueiro), carrocinha em D+1. Aguardando sinal; o prazo expira em cerca de 5 h.
- LOC-0032: Maria do Carmo (reforma da casa, Viçosa), MAR-017, de D0 14:00 a D+1. Confirmada; MAR-017 Separado.
- LOC-0033: Cícero Santos (pintor, Viçosa, cliente novo, sem documento), MAR-015 e andaime 12 peças, de D+5 a D+8. Orçamento enviado, aguardando sinal.
- MAR-010 Em inspeção (voltou em D-1). MAR-011 Em manutenção na OS-004 (troca de escovas, R$ 45, volta em D+3). As outras unidades estão Disponíveis.
- Lançamentos dos últimos 30 dias somando **entrou R$ 2.340** e **saiu R$ 610**, divididos como em `TelaDinheiro`. Caução em mãos: R$ 900.
- Demanda perdida: betoneira (2 pedidos), lavadora de alta pressão (1) e martelo demolidor ocupado (1).
- Histórico de LOC-0009 e LOC-0018 (José Carlos) e de LOC-0015 e LOC-0021 (MAR-002), para os números das telas de cliente e unidade baterem.

## 9. Qualidade

- `bun run check-types`, `bun run check` (Biome) e `bun run build` passam sem erro.
- Testes em Vitest para todo `packages/domain` e para os fluxos principais do mock:
  - reserva dupla recusada;
  - sinal vencido expira e libera a unidade;
  - checklist de volta gera ocorrências;
  - retenção de caução lança no caixa;
  - concluir manutenção lança a despesa.
- Sem `any`. Tipos vêm do contrato (`z.infer`). Formulários com TanStack Form e os schemas Zod do contrato.
- Importação direta de `data/mock`, `data/http` ou `better-auth` fora de `src/data` é proibida. Se o Biome permitir, adicione uma regra que impeça.
- Se houver navegador disponível (Playwright ou o Chrome do Claude Code), abra cada tela em 390, 834 e 1440 px, compare com a referência e corrija diferenças. Se não houver, diga isso no resumo final.
- Crie `CLAUDE.md` na raiz com: a arquitetura acima, como trocar mock por http, como adicionar um procedimento ao contrato (contrato → domain → mock → tela) e as convenções (código e identificadores em inglês, interface e rotas em pt-BR, dinheiro em centavos, fuso America/Maceio).
- Crie `docs/arquitetura-front.md` com o fluxo de upload e uma lista do que o backend vai precisar implementar para cada procedimento.

## 10. Ordem de trabalho

Faça uma fase por vez. No fim de cada fase, rode tipos, Biome e testes, e faça um commit (`feat(web): …`, `feat(contract): …`).

1. **Base:** `packages/domain` com testes; `packages/contract`; `VITE_DATA_SOURCE`; `data/client`, com o mock vazio respondendo `session.me`; `AuthGateway`; tokens, fontes e logo; shell responsivo com os três menus; rotas vazias com estados de carregamento; Entrar funcionando no mock.
2. **Estoque e agenda:** seed; Estoque; Unidade; Agenda; `UploadService` com IndexedDB.
3. **Locações:** Nova locação; Locações; Locação; demanda perdida.
4. **Operação:** checklist de saída e de volta; caução; ocorrências.
5. **Dinheiro e painel:** Dinheiro; Painel; Manutenção.
6. **Clientes e ajustes:** Clientes; Cliente; Mais; Configurações; papéis; revisão responsiva e de acessibilidade; documentação.

No fim, escreva um resumo com:
- o que foi feito;
- o que ficou diferente do desenho, e por quê;
- quais pendências do negócio apareceram como "a definir";
- o passo a passo para ligar o backend: implementar o `contract` em `packages/api`, os endpoints de presigned URL e trocar `VITE_DATA_SOURCE=http`.
