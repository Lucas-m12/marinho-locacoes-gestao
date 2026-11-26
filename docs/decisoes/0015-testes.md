# 0015 · Estratégia de testes

- Status: Aceita
- Data: 01/11/2026

## Contexto

O mock e o backend precisam se comportar igual.

## Decisão

- `packages/domain`: testes unitários em Vitest.
- **Cenários contra o cliente do contrato** (reserva dupla recusada, sinal que expira, retenção de caução que lança no caixa, manutenção que lança despesa…), escritos uma vez e rodados contra o mock agora e contra o servidor real depois, com Postgres de verdade num container.

## Consequências

- Uma regra de negócio nova entra primeiro como teste de cenário.
