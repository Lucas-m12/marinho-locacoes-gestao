# 0007 · Preços, preço congelado e descontos

- Status: Aceita
- Data: 01/11/2026

## Contexto

A tabela de preços muda, mas uma locação fechada não pode mudar de valor.

## Decisão

- O tipo de equipamento guarda o preço atual (diária e caução, que pode ser `null` enquanto não estiver definida).
- Cada item da locação guarda o **preço congelado** quando o sinal entra.
- Não existe tabela de vigência de preços. Mudanças de preço ficam registradas na tabela de eventos (ADR 0009).
- Desconto vai no total da locação, sempre com motivo. Atendimento só aplica descontos da tabela de descontos; acima disso, só gestão.

## Consequências

- Uma tabela de vigências só será criada se surgir preço programado.
