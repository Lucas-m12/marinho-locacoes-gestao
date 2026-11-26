# 0009 · Camadas do backend e auditoria

- Status: Aceita
- Data: 01/11/2026

## Contexto

Sistema pequeno, mantido por uma pessoa.

## Decisão

- `packages/api` implementa o contrato com um router por módulo. Cada handler chama um **service** (o caso de uso), que usa o Prisma direto, dentro de transação quando precisa, e as regras de `packages/domain`.
- Sem camada de repository.
- Toda mutation grava uma linha em `Event`: quem, ação, entidade, id e dados em JSON. Essa tabela alimenta o histórico das telas e serve de auditoria.
- Permissão por papel com um middleware do oRPC (`requireRole`).

## Consequências

- Para testar, os services recebem o cliente Prisma por parâmetro.
