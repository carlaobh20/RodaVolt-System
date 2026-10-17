# Desenvolvimento local do RodaVolt

Inspeção e preparação em 17/10/2026.

## Ambiente identificado

| Item | Configuração |
| --- | --- |
| Pasta no Mac | `/Users/carloshenriqueferro/Documents/ChatGPT/RODAVOLT - SYSTEM` |
| GitHub | [carlaobh20/RodaVolt-System](https://github.com/carlaobh20/RodaVolt-System) |
| Trabalho / produção | `dev` / `main` |
| Stack | React 19, TypeScript 6, Vite 8, Tailwind 4, Supabase |
| Runtime | Node 22 (`.nvmrc`) e npm; dependências fixadas em `package-lock.json` |
| Comando de build / saída | `npm run build` / `dist` |
| Produção acessível | [prime-charge-system.vercel.app](https://prime-charge-system.vercel.app), título RodaVolt |
| Vercel | Equipe `carlos-ferros-projects`; projetos `prime-charge-system` e `rodavolt-os` |

Na inspeção, `main` estava em `811949d` e `dev` em `2d504a9`. Há quatro commits
exclusivos de trabalho em `dev` e dois merges exclusivos em `main`; nenhum merge
foi necessário para preparar o checkout. Existe também `landing-rodavolt`, que foi preservada.

O GitHub já registra deployments automáticos de produção e preview, com status de
sucesso, para os **dois** projetos Vercel. O domínio `rodavolt-os.vercel.app` retornou
404; os deployments de `rodavolt-os` têm URLs com prefixo `rodavolt-`. Não é necessário
criar outro projeto Vercel. A escolha do projeto canônico, os aliases atuais e as
configurações internas ainda precisam ser conferidos com acesso à Vercel.

## Rodar localmente

```bash
cd "/Users/carloshenriqueferro/Documents/ChatGPT/RODAVOLT - SYSTEM"
# Se usar nvm:
nvm use
npm ci
# Somente em um checkout novo, sem .env.local:
cp -n .env.example .env.local
npm run dev -- --host 127.0.0.1 --port 5175 --strictPort
```

Abra `http://127.0.0.1:5175`. A porta 5174 já é usada pelo app de Finanças Pessoais;
a porta 5175 mantém os dois projetos independentes. A pasta é o próprio checkout: as edições feitas aqui já alteram
os arquivos do Mac, sem cópia ou transferência por bundle.

O `.env.local` foi criado a partir do exemplo existente e está ignorado pelo Git.
São necessárias somente estas variáveis no frontend:

```dotenv
VITE_SUPABASE_URL=<URL do projeto correto>
VITE_SUPABASE_PUBLISHABLE_KEY=<chave pública desse projeto>
```

**Configuração confirmada:** o projeto `ojvhiadjnxhhevoryjtu.supabase.co` está tanto
no exemplo quanto no JavaScript público de produção. A chave pública do exemplo
respondeu HTTP 200 no endpoint de configuração do Auth. A primeira tentativa no
terminal falhou com `ENOTFOUND`; um resolvedor DNS público retornou os registros A
e o teste com esses registros, mantendo a verificação TLS, funcionou. O navegador
também alcançou o endpoint normalmente. Não foi necessário trocar URL ou chave,
reativar banco nem alterar o DNS do computador.

A integração Supabase conectada lista somente `NewEncorpeiSaude` e recusou acesso
administrativo ao projeto do RodaVolt. Isso não impede o frontend de usar sua chave
pública. Para administrar schema ou configuração do projeto por aqui futuramente,
será necessário liberar o RodaVolt à integração. Login com usuário e fluxos com dados
ainda precisam de uma sessão de teste do app; nenhum login foi enviado neste setup.

Não coloque `service_role`, `sb_secret_*`, senha de banco ou token de GitHub/Vercel
em variáveis `VITE_*`. Não use o banco de outro app como substituto. Ao confirmar o
projeto, confira também os redirects de autenticação usados pelo app e se o preview
e o desenvolvimento compartilham dados com produção. Um frontend local não isola o banco.

## Fluxo de edição e publicação

1. Confira a branch e a árvore de trabalho; preserve alterações ainda não commitadas.

   ```bash
   git status --short --branch
   git fetch origin
   git switch dev
   git pull --ff-only origin dev
   ```

2. Edite e execute `npm run check` (lint + TypeScript + build). Para alterações de
   comportamento, rode os testes do módulo e valide a tela no navegador. O check de
   build não comprova autenticação nem disponibilidade do banco.

3. Revise o conteúdo e selecione os arquivos da tarefa.

   ```bash
   git diff --check
   git diff
   git add <arquivos-da-tarefa>
   git diff --cached
   git commit -m "descrição objetiva da alteração"
   git push origin dev
   ```

4. Confira a [CI no GitHub](https://github.com/carlaobh20/RodaVolt-System/actions)
   e o status Vercel do **mesmo SHA**. A integração existente cria previews com os
   pushes. Valide no preview o login e a tela alterada antes de promover.
5. Abra um PR de `dev` para `main`. Depois de CI e validação funcional, o merge em
   `main` aciona o deploy de produção. Confira o status e o domínio publicado.

A CI usa valores públicos fictícios apenas para compilar e não acessa o banco.
Não aplica migrations, não cria usuários e não publica diretamente na Vercel.
A publicação permanece a cargo da integração GitHub–Vercel existente.

As branches `main` e `dev` não estavam protegidas no GitHub na inspeção. A CI criada
executa validações, mas não obriga aprovação nem impede sozinha um merge com falha.
Regras de proteção não foram alteradas neste setup.

## Validação e limites

- `npm ci`, `npm run lint` e `npm run build` passaram no checkout de `dev`.
- `npm run check` passou após a preparação. Página inicial e tela de login do
  motorista renderizadas no navegador em `http://127.0.0.1:5175`.
- O lint apresentou seis warnings preexistentes; o build avisou sobre chunks acima
  de 500 kB. Não houve alteração de produto para resolver esses avisos neste setup.
- `.env.local` e `.vercel/project.json` são ignorados pelo Git.
- GitHub autenticado como `carlaobh20`; commit e push de preparação em `dev`
  confirmados. A primeira CI passou e os dois previews Vercel concluíram com sucesso
  para o commit `7aa559e`.
- Supabase Auth acessível; chave pública validada por HTTP 200, sem ler dados.
- Login autenticado e fluxos com dados não foram exercitados.
- Acesso de gerenciamento à Vercel ainda depende da instalação/conexão da integração.

Nenhuma migration ou seed foi executada contra o banco remoto. O histórico de
`CLAUDE.md` contém migrations antigas descritas como pendentes; não reaplique com
base nesse texto. Confira o estado real do banco antes de qualquer trabalho de schema.

Referências: [GitHub e deploys automáticos na Vercel](https://vercel.com/docs/git/vercel-for-github),
[Vite na Vercel](https://vercel.com/docs/frameworks/frontend/vite),
[chaves de API do Supabase](https://supabase.com/docs/guides/getting-started/api-keys).
