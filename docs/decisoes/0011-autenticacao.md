# 0011 · Autenticação com Better Auth

- Status: Aceita
- Data: 01/11/2026

## Contexto

Três pessoas da família, que precisam do jeito mais fácil possível de entrar, principalmente no celular.

## Decisão

- Login por **nome de usuário + senha**, com o plugin `username`. Cada usuário tem um e-mail interno (ex.: `pai@marinho.local`) só porque o Better Auth exige; ele nunca aparece.
- Sessão de 90 dias, renovada a cada uso (`expiresIn` 90 d, `updateAge` 1 d). "Continuar conectado" = `rememberMe`.
- Sem cadastro público (`disableSignUp: true`). Contas, papéis e troca de senha pelo plugin `admin`, feitos pelo papel `MANAGER`. Não tem e-mail de recuperação de senha.
- Papéis: `MANAGER` (gestão), `ATTENDANT` (atendimento), `EQUIPMENT` (equipamentos).
- `rateLimit` do Better Auth ligado.
- Domínios: front em `sistema.marinholocacoes.com` e API em `api.marinholocacoes.com`. Como ficam no mesmo domínio, o cookie pode ser `sameSite: "lax"` e o Safari do iPhone não derruba a sessão.

## Consequências

- Depois dá para acrescentar entrar com Google ou passkey sem tirar a senha.
