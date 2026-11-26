# 0016 · Dados pessoais e exportação para o contador

- Status: Aceita
- Data: 01/11/2026

## Contexto

Documentos de clientes são dados pessoais. O contador vai precisar das entradas e despesas.

## Decisão

- Fotos de documento de clientes sem locação há **2 anos** são apagadas por uma tarefa agendada. O prazo final deve ser confirmado com o advogado, junto com o contrato.
- O acesso aos documentos é só para os três usuários, por URL de curta duração (ADR 0012).
- **Exportação mensal em CSV** do caixa, para o contador: `ledger.exportCsv({ month })`, separador `;`, UTF-8 com BOM (para abrir direto no Excel em português), valores em reais com vírgula decimal. Colunas: data, entrada ou saída, categoria, descrição, forma, valor, locação, unidade.

## Consequências

- Prever a tarefa de limpeza na VPS desde o início.
