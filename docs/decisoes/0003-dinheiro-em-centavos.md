# 0003 · Dinheiro sempre em centavos

- Status: Aceita
- Data: 01/11/2026

## Contexto

Valores com casas decimais em ponto flutuante geram erro de arredondamento em somas e percentuais.

## Decisão

- Todo valor de dinheiro (preço, caução, pagamento, lançamento, taxa, desconto) é guardado e trafegado em **centavos inteiros**, em campos com sufixo `Cents` (`amountCents`).
- Coluna `Int` no Postgres, não `BigInt`: o `BigInt` não vira número no JSON, e o limite de cerca de R$ 21 milhões por valor não é um problema.
- Arredondamento só no fim da conta, para o centavo mais próximo, numa única função de `packages/domain`. Nunca arredondar item por item.
- Formatação para a tela (`R$ 1.234,56`) só no front, com uma função de `packages/domain`.

## Consequências

- Nenhum `float` ou `Decimal` para dinheiro em lugar nenhum do código.
