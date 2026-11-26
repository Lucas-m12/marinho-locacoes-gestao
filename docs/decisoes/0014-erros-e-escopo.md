# 0014 · Erros, escopo e outras convenções

- Status: Aceita
- Data: 01/11/2026

## Contexto

Convenções gerais.

## Decisão

- Erros da API usam **códigos estáveis** (`RENTAL_PERIOD_CONFLICT`, `INVALID_TRANSITION`, `FORBIDDEN`…) com dados estruturados. Quem traduz para português é o front.
- Um negócio só: sem `tenantId` e sem multiempresa.
- Código e identificadores em inglês; interface, rotas e mensagens para o usuário em português.
- Fora de escopo por enquanto: WhatsApp (API, links ou bots), PWA e offline, modo escuro, nota fiscal (depende da forma jurídica, que está com o contador).
- Sem importação de dados: a operação ainda não começou. O banco nasce só com o catálogo real.

## Consequências

- O modelo de locação guarda o necessário para emitir nota fiscal no futuro.
