# 0010 · Tempo, fuso e contagem de diárias

- Status: Aceita
- Data: 01/11/2026

## Contexto

O negócio funciona no horário de Alagoas, e a regra da diária ainda não foi decidida.

## Decisão

- Datas e horas sempre em `timestamptz`, em UTC no banco.
- O fuso `America/Maceio` só entra nas contas que dependem do dia (diárias, "sai hoje", relatórios por mês), sempre por funções de `packages/domain`.
- **Regra provisória das diárias:** conta os dias de calendário de saída a devolução, incluindo os dois. Fica numa função só (`countDailies`), marcada como provisória até o negócio decidir.
- Prazo do sinal: 24 h. Folga entre locações: configurável por tipo.
- Sinal vencido e atraso são calculados na leitura. Não dependem de tarefa agendada para estarem corretos.

## Consequências

- Quando a regra de diária, de atraso e de "não devolvido" for decidida, muda só `packages/domain`.
