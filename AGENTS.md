# Trabalho local no RodaVolt

Este checkout é a pasta local do usuário, com acesso direto ao GitHub. O fluxo atual
está em `docs/DESENVOLVIMENTO-LOCAL.md`; as instruções antigas de transferência por
bundle em `CLAUDE.md` são históricas e não se aplicam a este ambiente.

- Repositório: `https://github.com/carlaobh20/RodaVolt-System.git`.
- Use a branch existente `dev` para trabalho e `main` para produção. Antes de editar,
  confira `git status --short --branch`, faça `git fetch origin` e compare com
  `origin/dev`. Atualize com `git pull --ff-only` quando a árvore estiver limpa.
  Preserve alterações locais e resolva divergências sem reset destrutivo ou force push.
- Leia `CLAUDE.md` para contexto do domínio. O estado antigo das branches e dos
  deployments naquele arquivo deve ser conferido no GitHub, não tomado como atual.
- Node 22, npm e `package-lock.json`. Instale com `npm ci`; valide com
  `npm run check`. Execute os testes específicos do módulo quando alterar seu comportamento.
- Revise o diff e adicione somente os arquivos da tarefa antes de commitar. Faça push
  para `dev`, confira CI e preview Vercel. A promoção para `main` ocorre por PR com
  CI e teste funcional validados; não faça merge de produção por inferência.
- `.env.local`, `.vercel/`, dependências, builds e backups não são versionados.
  `VITE_*` vai para o navegador: use somente a URL e a chave pública do Supabase.
- Não execute migrations, seeds ou scripts SQL contra o banco remoto durante setup
  ou validação do frontend. Os testes SQL precisam de um banco local descartável.
- Preserve a zona congelada `src/features/estrategia/expansao/`, conforme `CLAUDE.md`.
