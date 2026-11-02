# Marinho Gestão

Sistema de gestão da Marinho Locações: locadora familiar de equipamentos para obra em Cajueiro (AL). Monorepo com Bun workspaces, Turborepo e Biome.

## Comandos

```bash
bun install
bun run dev:web        # front em http://localhost:3001, com o mock por padrão
bun run check-types    # tipos de todos os pacotes
bun run check          # Biome, com correção automática
bun run test           # Vitest: domain e fluxos do mock
bun run build
bun run db:generate    # gera o cliente Prisma; necessário antes de check-types e build
```

## Arquitetura

```
packages/
  contract/   contrato oRPC + schemas Zod: fonte da verdade da API
  domain/     regras de negócio puras, sem I/O; quem chama passa o `now`
  ui/         primitivos shadcn (Base UI) + tokens da marca
apps/web/src/
  data/
    client.ts   escolhe a fonte e exporta `client` e `orpc`
    http/       link HTTP real
    mock/       backend simulado: implement(contract) + store + seed
    auth/       AuthGateway: mock ou better-auth
    uploads/    UploadService: presigned URL (real) ou IndexedDB (mock)
  features/     telas, componentes e formulários por módulo
  components/   shell, StatusChip, Money, campos de formulário
  routes/       rotas finas: só validam a URL e montam a tela
```

Regras que valem sempre:

- Telas usam só `orpc.*`, `authGateway` e `uploadService`. Importar `data/mock`, `data/http` ou `better-auth` fora de `src/data` é erro de lint.
- Regra de negócio vai em `packages/domain`, com teste. O mock e o backend usam as mesmas funções.
- Cada mutation declara o que invalida em `data/invalidation.ts`.
- `CONFLICT`, `INVALID_TRANSITION` e `PRECONDITION_FAILED` são tratados na própria tela. O resto vira toast global em `lib/query-client.ts`.
- Papéis e permissões ficam em `packages/domain/src/permissions.ts`. Menu, rotas e mock usam a mesma tabela.
- Login é por nome de usuário. O e-mail interno (`<usuario>@marinho.local`) existe só no modelo: não entra no contrato nem na interface.
- Lançamentos nunca são editados nem apagados: erro se corrige com `ledger.reverse`. Totais passam por `ledgerTotals` e `signedAmountCents`, para o estorno abater o lançamento original.
- Toda mutation de dinheiro recebe `idempotencyKey`. No front, use `useIdempotencyKey()`, uma chave por formulário. No mock, envolva o handler em `once()`.

## Trocar mock por backend real

`VITE_DATA_SOURCE` é `mock` (padrão) ou `http`. Em `http`, `VITE_SERVER_URL` é obrigatória.

```bash
VITE_DATA_SOURCE=http VITE_SERVER_URL=http://localhost:3000 bun run dev:web
```

Nenhuma tela muda. O valor é resolvido em tempo de build (`define` em `vite.config.ts`), então o mock não entra no bundle em modo `http`. O passo a passo do backend está em `docs/arquitetura-front.md`.

## Adicionar um procedimento

1. **Contrato:** declare input, output e erros em `packages/contract/src/modules/<modulo>.ts`.
2. **Domain:** coloque a regra nova em `packages/domain`, com teste.
3. **Mock:** implemente em `apps/web/src/data/mock/handlers/<modulo>.ts`, com `requirePermission`. O TypeScript acusa se o mock sair do contrato.
4. **Invalidação:** se for mutation, liste os módulos afetados em `data/invalidation.ts`.
5. **Tela:** use `orpc.<modulo>.<procedimento>.queryOptions()` ou `.mutationOptions()`.
6. **Teste:** cubra o fluxo em `data/mock/mock-flows.test.ts`.

## Convenções

- Código e identificadores em inglês. Interface e rotas em pt-BR.
- Dinheiro sempre em centavos inteiros (`amountCents`). Na tela, use `money()` ou `<Money />`.
- A caução fica na conta `DEPOSIT` e nunca entra no CSV do contador. Só a parte retida gera entrada em `CASH`.
- Datas em ISO 8601 com fuso. O fuso de negócio é `America/Maceio`; formate com `lib/format.ts`.
- IDs internos são `string`. Códigos de negócio são campos próprios: `LOC-0001`, `MAR-001`, `OS-001`.
- Valor que o negócio não definiu é `null` no schema e aparece como "a definir" (`<ToDefine />` ou `<Money />`). Não invente valores.
- Sem `any`. Tipos vêm do contrato (`z.infer`). Formulários usam TanStack Form com os schemas Zod do contrato.
- Filtros, abas e busca ficam na URL, validados com Zod.
- Tipografia da marca: `type-title`, `type-condensed` e `type-brand`. Não use prefixo `text-` em utilitários novos: o `tailwind-merge` os confunde com cor de texto e descarta classes.
- Status nunca depende só da cor: use `<StatusChip />`, que sempre mostra o texto.
- Alvos de toque com pelo menos 44 px. Contraste mínimo de 4,5:1. `#B4532A` em texto pequeno só sobre creme, nunca sobre areia.

## Fora do Biome por enquanto

`biome.json` ignora `apps/server`, `packages/api`, `packages/auth`, `packages/db` e `packages/infra` para o front não reformatar código que o backend ainda vai reescrever. Tire essas exclusões quando o backend começar.
