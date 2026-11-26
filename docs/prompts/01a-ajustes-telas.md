# Prompt 01a — Ajustes nas telas (login por usuário, estorno e exportação CSV)

> Ajustes decididos depois do prompt 01. Leia `docs/decisoes/` (principalmente 0003, 0004, 0011 e 0016). Se a fase que estes ajustes tocam já foi feita, aplique agora; se não, aplique quando chegar nela. Mantenha tudo o mais como está no prompt 01.

## 1. Login por nome de usuário (ADR 0011)

- O campo de login da tela Entrar passa a se chamar **"Usuário"** (`autocomplete="username"`, sem `type="email"`), e o texto de apoio passa a ser "Use o usuário e a senha que o Lucas criou para você".
- `AuthGateway.signIn({ username, password, rememberMe })`. "Continuar conectado" vira o `rememberMe`.
  - Real: `authClient.signIn.username(...)`, do plugin `username` do Better Auth. O `createAuthClient` ganha os plugins de cliente `usernameClient()` e `adminClient()`.
  - Mock: valida contra os usuários do seed.
- Usuários do mock, todos com a senha `marinho123`:

| Usuário | Nome | Papel |
| --- | --- | --- |
| `lucas` | Lucas | `MANAGER` |
| `atendimento` | Atendimento | `ATTENDANT` |
| `equipamentos` | Equipamentos | `EQUIPMENT` |

  Os e-mails internos (`lucas@marinho.local` etc.) existem só no modelo e nunca aparecem na interface.
- Sessão do mock dura 90 dias se "Continuar conectado" estiver marcado, ou até fechar o navegador se não estiver.
- **Configurações → Pessoas** (só `MANAGER`):
  - lista nome, usuário e papel;
  - **Criar pessoa**: nome, usuário, papel e senha inicial, com mínimo de 8 caracteres;
  - **Mudar papel**;
  - **Redefinir senha**, que gera ou define uma senha nova e mostra uma vez para copiar.

  Acrescente ao contrato `users.create`, `users.setRole` e `users.setPassword`, que no futuro correspondem às ações do plugin `admin` do Better Auth.
- Não existe "Esqueci a senha" por e-mail. O link da tela Entrar abre uma mensagem: "Peça ao Lucas para redefinir sua senha."

## 2. Estorno em vez de editar ou apagar lançamento (ADR 0004)

- Lançamentos de Dinheiro nunca são editados nem apagados. Cada lançamento tem a ação **Estornar**, que pede o motivo e cria um lançamento inverso ligado ao original.
- Na lista, o original aparece riscado com o selo "Estornado", e o estorno aparece com o selo "Estorno de …".
- Contrato: `ledger.reverse({ entryId, reason, idempotencyKey })`.
- Toda mutation de dinheiro (`rentals.recordPayment`, `deposits.*`, `ledger.create`, `ledger.reverse`) recebe uma `idempotencyKey` gerada pelo front, com `crypto.randomUUID()` por envio de formulário. O mock guarda as chaves e, se a mesma chave chegar de novo, devolve o resultado anterior sem lançar outra vez.

## 3. Exportar CSV para o contador (ADR 0016)

- Na tela Dinheiro, o botão **Exportar mês (CSV)** abre a escolha do mês e baixa o arquivo `marinho-caixa-AAAA-MM.csv`.
- Contrato: `ledger.exportCsv({ month: "AAAA-MM" })` devolve `{ fileName, content }`. No mock, o CSV é gerado no navegador; o download é feito com `Blob` e `URL.createObjectURL`.
- Formato: separador `;`, UTF-8 com BOM, valores em reais com vírgula decimal (`1234,50`) e datas `dd/mm/aaaa`. Colunas: `Data;Tipo;Categoria;Descrição;Forma;Valor;Locação;Unidade`, com Tipo valendo "Entrada" ou "Saída". Estornos entram com o sinal invertido.
- Só a conta Caixa entra no arquivo. A caução fica de fora, porque não é faturamento.
- Disponível para `MANAGER` e `ATTENDANT`.

## 4. Conferência

Rode tipos, Biome e testes, acrescentando testes no mock para:
- login com usuário e senha errada;
- estorno anulando o saldo;
- idempotência: a mesma chave não duplica o lançamento;
- CSV com BOM, `;` e vírgula decimal.

Faça um commit `feat(web): login por usuário, estorno e exportação CSV`.
