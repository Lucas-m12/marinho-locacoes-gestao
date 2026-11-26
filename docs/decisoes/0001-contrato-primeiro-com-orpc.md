# 0001 · Contrato primeiro com oRPC e mock no front

- Status: Aceita
- Data: 01/11/2026

## Contexto

O front será feito antes do backend e precisa funcionar de ponta a ponta. Depois, o backend real deve entrar sem mudar as telas.

## Decisão

- `packages/contract` guarda o contrato oRPC (`@orpc/contract`) e todos os schemas Zod. É a fonte da verdade da API.
- O front usa `ContractRouterClient<typeof contract>`. A fonte vem de `VITE_DATA_SOURCE`: `mock` usa `createRouterClient(implement(contract))` no navegador; `http` usa `RPCLink` para o servidor.
- `packages/domain` guarda as regras puras de negócio (diárias, disponibilidade, máquinas de status, situação do cliente, dinheiro). O mock usa agora e o backend reaproveita depois.
- O backend (`packages/api`) vai implementar o mesmo contrato com `implement(contract)`.

## Consequências

- Se o mock ou o backend saírem do contrato, o TypeScript acusa erro na compilação.
- O protocolo do oRPC não é REST puro. Se um dia precisar de REST público, o oRPC gera OpenAPI a partir do mesmo contrato.
