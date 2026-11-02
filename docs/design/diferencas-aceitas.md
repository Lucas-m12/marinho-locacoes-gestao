# Diferenças aceitas entre o design e o app

Cada linha é uma diferença que **fica** depois da comparação lado a lado (`bun run e2e:visual`, relatório em `apps/e2e/visual-output/index.html`). Motivos válidos: dado real diferente do exemplo, componente do shadcn com comportamento melhor, acessibilidade ou erro no design.

| Tela | Tamanho | O que muda | Por quê |
| --- | --- | --- | --- |
| Todas com menu | desktop, tablet | O menu tem o item **Configurações** (gestão). | Erro no design: o menu do desktop e do tablet não tinha como chegar a preços, taxas e pessoas, que o prompt 01 exige. No celular elas continuam em Mais. |
| Todas com menu | tablet | O avatar do trilho abre um menu com **Sair**. | Erro no design: no tablet não havia como sair. O visual do avatar é o mesmo. |
| Todas | todos | Datas e horas em `input type="datetime-local"` ("07/11/2026, 08:00" com ícone de calendário) em vez de "Sáb, 07/11/2026 · 08:00". | Componente nativo: teclado e seletor de data certos no celular e leitura correta por leitor de tela. |
| Todas | todos | Onde o design mostra marcadores (`[CAUÇÃO]`, `[TAXA]`, `[SINAL]`, `[PREÇO]`, `[ACESSÓRIOS]`, `[ENDEREÇO]`), o app mostra "a definir" ou o dado real. | Dado real: o negócio ainda não definiu esses valores e a regra do projeto é não inventar. |
| 02 Painel | todos | "Aguardando sinal" lista LOC-0031 **e** LOC-0033. | Erro no design: a Agenda do próprio design mostra a LOC-0033 segurando a pistola e 12 peças de andaime como "Aguardando sinal", e o seed segue o prompt 01 (orçamento enviado). O Painel e a lista de Locações do design tratam a mesma locação como rascunho. |
| 05 Locações | todos | LOC-0033 aparece como "Aguardando sinal", não "Orçamento". | Mesmo motivo da linha acima. |
| 02 Painel, 05 Locações, 06 Locação, 07 Estoque | todos | Nomes completos do catálogo ("Serra mármore Makita 4100NH3", "Aspirador de pó e água WAP GTW Inox 12"). | Dado real do catálogo. |
| 03 Agenda | todos | O calendário lista as 17 unidades, o andaime e a carrocinha; o design mostra só uma parte. MAR-003 aparece livre (no design, reservada em 07–08/11). | Dado real do seed. |
| 03 Agenda | celular | Coluna do nome do equipamento com 84 px (design: 92 px). | Acessibilidade: com 92 px as células do dia ficam com 43 px; com 84 px chegam aos 44 px de alvo de toque. |
| 04 Nova locação | todos | A busca de cliente fica vazia depois de escolher o cliente (o design mantém "Cícero"). | Comportamento melhor: a lista de resultados fecha e a busca fica pronta para trocar de cliente. |
| 04 Nova locação | todos | Campo **Peças** no item de andaime. | Erro no design: não havia como informar a quantidade de peças. |
| 04 Nova locação | todos | Campo **Município** e, sem taxa na tabela, o campo "Taxa de entrega para Viçosa" para digitar o valor combinado. | Dado real (taxa de Viçosa a definir) e o prompt 01 pede município e taxa. |
| 04 Nova locação | todos | Campo **Desconto** em Observações. | ADR 0007: o desconto existe e aparece no resumo do próprio design. |
| 04 Nova locação | todos | No resumo, "Pistola de pintura a bateria Yankee Ferr" em vez de "Pistola de pintura". | Dado real: a disponibilidade devolve o nome do catálogo; o nome curto não faz parte do contrato. |
| 04 Nova locação | todos | Chip "Novo" em vez de "Cliente novo". | Mesmo chip de situação do cliente usado em todas as telas. |
| 06 Locação | todos | Botão **Cancelar** no cabeçalho; chip de status e botão "Checklist de saída" em cada equipamento. | Funções do prompt 01 que o design não mostrou. |
| 06 Locação | todos | "Acessórios: a definir" em vez de "Vai na maleta · acessórios: [ACESSÓRIOS]"; histórico com "Atendimento" e "Equipamentos" em vez de "Esposa" e "Pai". | Dado real do seed (usuários e acessórios). |
| 06 Locação | todos | Linha "Taxa de entrega: a definir" em Pagamentos. | Dado real: taxa ainda não definida. |
| 10 Cliente | todos | Botão **Bloquear**; Observações em campo editável. | Funções do prompt 01 ("observações editáveis", bloqueio manual). |
| 11 Dinheiro | todos | Botão **Exportar mês (CSV)** e ação **Estornar** em cada lançamento; 32 lançamentos com "Ver todos". | Funções do prompt 01a; dado real do seed. |
| 11 Dinheiro | celular | Descrições quebram em duas linhas por causa do botão Estornar (44 px). | Acessibilidade: alvo de toque de 44 px. |
| 11 Dinheiro | todos | "A receber" lista LOC-0028, LOC-0029, LOC-0030 e LOC-0032, com a regra provisória do atraso. | Dado real do seed. |
| 12 Saída e volta | todos | Item "Já tinha: Risco na lateral esquerda" no topo do checklist (9 itens, "7 de 9"). | Dado real: o dano registrado na unidade entra como item já existente, para não ser cobrado na volta. |
| 12 Saída e volta | todos | Botão de ícone **Adicionar observação** ao lado de N/A. | Erro no design: o prompt 01 pede uma observação por item. |
| 12 Saída e volta | todos | "Concluir saída" desabilitado com o aviso "Responda todos os itens para concluir." | Comportamento melhor: o design deixava concluir com itens sem resposta. |
| 12 Saída e volta | todos | "Saldo de R$ 500 recebido" pede a forma de pagamento; caução "a definir" pede o valor. | O pagamento precisa da forma para o caixa; caução do tipo ainda não definida. |
| 12 Saída e volta | todos | Fotos reais no lugar de `[FOTO]`; título "Checklist · Martelo demolidor 5 kg". | Dado real (nome do tipo no catálogo). |
| Listas (05, 07, 09, 11) | celular | Mais itens e cartões mais altos que no design. | Dado real do seed. |
