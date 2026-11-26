# 0004 · Lançamentos imutáveis, estorno e caução separada

- Status: Aceita
- Data: 01/11/2026

## Contexto

O caixa precisa sempre bater e ser auditável, e a caução pertence ao cliente até ser devolvida ou retida.

## Decisão

- Tabela `LedgerEntry` com conta (`CASH` ou `DEPOSIT`), direção (entrada ou saída), categoria, valor em centavos, data, forma (Pix ou dinheiro) e vínculo opcional com locação ou unidade.
- Lançamentos nunca são editados nem apagados. Erro se corrige com **estorno**: um lançamento inverso, com motivo, ligado ao original.
- Saldos e totais são sempre calculados, nunca guardados.
- A caução fica na conta `DEPOSIT`. Só a parte retida gera uma entrada em `CASH`, sempre com motivo.
- Categorias do caixa são enum.

## Consequências

- A tela de Dinheiro precisa de uma ação "Estornar" no lugar de editar e apagar.
