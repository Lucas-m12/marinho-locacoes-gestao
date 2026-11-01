# Referência de design — Marinho Locações

Estes arquivos são o código-fonte das telas desenhadas no canvas "Marinho — Mapa do sistema" (Claude Design). **Não rodam sozinhos**: dependem do runtime do canvas (`support.js`, `<x-dc>`, `<sc-if>`, `<sc-for>`, `<dc-import>`). Use-os como especificação:

- **Markup** (dentro de `<x-dc>`): layout, hierarquia, textos exatos da interface, cores e tamanhos.
- **`renderVals()`** (no `<script type="text/x-dc">` no fim de cada arquivo): os dados de exemplo e as diferenças entre tamanhos. O prop `bp` vale `desktop`, `tablet` ou `phone`; os valores calculados a partir dele (`pad`, `layoutCols`, `kpiCols`, `twoCols`, `cols`…) dizem como o layout muda em cada tamanho.
- `<sc-if value="{{P}}">` = só no celular; `{{D}}` = só desktop; `{{T}}` = só tablet; `{{notP}}` = desktop e tablet.
- `<sc-for list="{{x}}" as="item">` = repetição sobre os dados de `renderVals()`.
- `<dc-import name="Nav" bp="…" active="…">` = o menu, em `telas/Nav.dc.html`.

## Arquivos

| Arquivo | Tela |
| --- | --- |
| `telas/TelaEntrar.dc.html` | 01 · Entrar |
| `telas/TelaPainel.dc.html` | 02 · Painel |
| `telas/TelaAgenda.dc.html` | 03 · Agenda |
| `telas/TelaNovaLocacao.dc.html` | 04 · Nova locação |
| `telas/TelaLocacoes.dc.html` | 05 · Locações |
| `telas/TelaLocacao.dc.html` | 06 · Locação (detalhe) |
| `telas/TelaEstoque.dc.html` | 07 · Estoque |
| `telas/TelaUnidade.dc.html` | 08 · Unidade (detalhe) |
| `telas/TelaClientes.dc.html` | 09 · Clientes |
| `telas/TelaCliente.dc.html` | 10 · Cliente (detalhe) |
| `telas/TelaDinheiro.dc.html` | 11 · Dinheiro |
| `telas/TelaChecklist.dc.html` | 12 · Saída e volta (checklist) |
| `telas/TelaManutencao.dc.html` | 13 · Manutenção |
| `telas/Mais.dc.html` | 14 · Mais (só celular) |
| `telas/Nav.dc.html` | Menu: barra lateral (desktop), trilho (tablet), barra inferior (celular) |
| `mapa/mapa-de-funcionalidades.dc.html` | Módulos e funcionalidades, com fase F1/F2 |
| `mapa/fluxo-da-locacao.dc.html` | Fluxo de uma locação, do pedido ao pós-venda |
| `mapa/status-do-equipamento.dc.html` | Máquina de estados da unidade |
| `mapa/dinheiro-e-painel.dc.html` | Caixa, caução e painel |

Os nomes de clientes, datas e valores são de exemplo. Códigos MAR e diárias vêm do catálogo real. Marcadores entre colchetes (`[CAUÇÃO]`, `[TAXA]`, `[SINAL]`…) são decisões ainda pendentes do negócio.
