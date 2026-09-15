-- Épico 6 — RodaScore v1.0: motor de pré-seleção de motorista/candidato.
--
-- Pedido do Carlos: o formulário público (`/quero-alugar`, migration 0053) vira um wizard
-- multi-etapa mais completo, e cada envio passa a gerar um SCORE OBJETIVO E AUDITÁVEL — nunca
-- baseado em característica pessoal sensível (estado civil, endereço, etc.), só em critérios
-- ligados à capacidade de operar/pagar o aluguel. IA fica de fora por decisão dele agora
-- ("a IA vou colocar depois, plugamos o Gemini") — este motor é 100% regra determinística.
--
-- Duas coisas que este épico NÃO é, de propósito:
-- 1. Não é o "Score PrimeCharge" que já existe (`driverScore.ts`, calculado em TS, exibido no
--    Resumo do Kanban). Aquele mede motorista JÁ ATIVO (tempo de casa, contrato cumprido,
--    pontualidade) — é score de RETENÇÃO. RodaScore mede CANDIDATO, antes de qualquer contrato
--    existir. São propósitos diferentes, convivem sem se tocar. Rotulei de novo o card do
--    Resumo ("Score de Retenção") só pra ninguém confundir os dois na tela.
-- 2. Não decide sozinho. Não existe fluxo de aprovação automática em lugar nenhum — a única
--    coisa que este motor faz é calcular um número e levantar flags; toda decisão (aprovar,
--    reprovar, pedir mais informação) é ação humana explícita, registrada com autor e
--    justificativa (`motorista_decisoes`, seção 6).
--
-- Decisão de arquitetura mais importante deste arquivo: o cálculo roda em SQL (função
-- `fn_calcular_rodascore`), não em TypeScript, ao contrário de `driverScore.ts`/`healthScore.ts`.
-- Motivo: o dado de entrada do RodaScore vem, em parte, de um formulário PÚBLICO/ANÔNIMO
-- (`criar_lead_publico`, migration 0053) — se o cálculo fosse feito no cliente e o resultado
-- apenas enviado como número pronto, qualquer pessoa com o DevTools aberto poderia forjar um
-- score perfeito antes de enviar. Calculando dentro da própria transação SECURITY DEFINER que
-- já grava o lead, o visitante nunca tem chance de influenciar o número — só os fatos brutos
-- (CNH, experiência, etc.), que o servidor pontua sozinho.

-- ============================================================
-- 1. Campos novos de triagem: Locações e Financeiro (categorias que ainda não existiam)
-- + estruturação de 3 campos que hoje são texto livre (não dá pra pontuar objetivamente
-- "Ex.: 1 ano, 6 meses" de forma confiável — vira enum/número, auditável de verdade).
-- ============================================================

alter table motoristas_triagem
  -- Histórico de locação anterior (categoria "Locações", 15 pts)
  add column if not exists ja_alugou_veiculo_antes boolean,
  add column if not exists locacao_anterior_sem_pendencias boolean,
  add column if not exists locacao_anterior_motivo_saida text,

  -- Capacidade financeira (categoria "Financeiro", 15 pts) — coleta mínima necessária: renda
  -- declarada (pra medir CAPACIDADE DE PAGAR o aluguel, nunca "quão rico é"), e diversificação
  -- de renda (reduz risco de calote por perda de uma única fonte). Não coletamos banco/agência
  -- nem renda exata de terceiros — não é usado pra nada aqui, não faz sentido pedir.
  add column if not exists renda_mensal_declarada numeric(10,2),
  add column if not exists possui_outra_fonte_renda boolean,
  add column if not exists possui_conta_bancaria boolean,

  -- km_semanal: era texto livre ("Ex.: 800 km"); vira número. Coluna antiga (`km_semanal_estimado`)
  -- fica como está, só de-facto parada — não apago dado de quem já respondeu antes desta
  -- migration (mesmo princípio de nunca destruir dado já usado em outras fases).
  add column if not exists km_semanal_km integer;

comment on column motoristas_triagem.km_semanal_estimado is
  'DEPRECATED a partir da migration 0054 — RodaScore usa km_semanal_km (numérico). Coluna '
  'mantida só por dado histórico de quem respondeu antes desta migration, nunca mais escrita.';

-- tempo_experiencia e disponibilidade_horas continuam texto, mas passam a aceitar só um
-- conjunto fechado de valores a partir de agora — `not valid` pra não quebrar nenhuma linha já
-- gravada antes desta migration (ex.: o "2 anos" digitado à mão no teste ponta-a-ponta).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_triagem_tempo_experiencia') then
    alter table motoristas_triagem
      add constraint chk_triagem_tempo_experiencia
        check (tempo_experiencia is null or tempo_experiencia in
          ('nenhuma','menos_6_meses','6_a_12_meses','1_a_2_anos','2_a_5_anos','mais_5_anos'))
        not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_triagem_disponibilidade') then
    alter table motoristas_triagem
      add constraint chk_triagem_disponibilidade
        check (disponibilidade_horas is null or disponibilidade_horas in
          ('periodo_integral','meio_periodo','fins_de_semana','flexivel'))
        not valid;
  end if;
end $$;

comment on column motoristas_triagem.tempo_experiencia is
  'A partir da migration 0054: um dos valores fechados do check acima (era texto livre antes '
  '— "Ex.: 1 ano, 6 meses" não dá pra pontuar com confiança). Linhas gravadas antes desta '
  'migration podem ter texto livre antigo — o motor de score trata qualquer valor '
  'desconhecido como "não informado" (null-safe), nunca erro.';

-- ============================================================
-- 1.1. criar_lead_publico precisa aceitar os campos novos da seção 1 (senão o wizard novo
-- envia esses dados e a RPC simplesmente os ignora, silenciosamente). Redefinida por inteiro
-- (create or replace) — corpo idêntico ao da migration 0053, só com os campos novos
-- adicionados ao INSERT/UPDATE de motoristas_triagem.
-- ============================================================

create or replace function public.criar_lead_publico(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_etapa_id uuid;
  v_cpf text;
  v_nome text;
  v_id uuid;
begin
  if not coalesce((p->>'aceitou_politica_privacidade')::boolean, false) then
    raise exception 'É necessário aceitar a Política de Privacidade para enviar o cadastro.';
  end if;

  select id into v_empresa_id from empresas order by criado_em asc limit 1;
  if v_empresa_id is null then
    raise exception 'Nenhuma empresa configurada.';
  end if;

  v_nome := trim(coalesce(p->>'nome_completo', ''));
  if v_nome = '' then
    raise exception 'Nome obrigatório.';
  end if;

  v_cpf := regexp_replace(coalesce(p->>'cpf', ''), '\D', '', 'g');
  if length(v_cpf) <> 11 then
    raise exception 'CPF inválido.';
  end if;

  select id into v_etapa_id from funil_etapas
    where empresa_id = v_empresa_id and grupo = 'lead' and ativa = true
    order by ordem asc
    limit 1;

  insert into motoristas (
    empresa_id, nome_completo, cpf, email, telefone, data_nascimento,
    cnh_numero, cnh_categoria, cnh_validade, endereco, cidade, estado,
    observacoes, status, origem_lead, origem_lead_detalhe, etapa_funil_id
  ) values (
    v_empresa_id,
    v_nome,
    v_cpf,
    nullif(trim(coalesce(p->>'email', '')), ''),
    nullif(trim(coalesce(p->>'telefone', '')), ''),
    nullif(p->>'data_nascimento', '')::date,
    nullif(trim(coalesce(p->>'cnh_numero', '')), ''),
    nullif(trim(coalesce(p->>'cnh_categoria', '')), ''),
    nullif(p->>'cnh_validade', '')::date,
    nullif(trim(coalesce(p->>'endereco', '')), ''),
    nullif(trim(coalesce(p->>'cidade', '')), ''),
    nullif(trim(coalesce(p->>'estado', '')), ''),
    nullif(trim(coalesce(p->>'observacoes', '')), ''),
    'lead',
    'outro',
    coalesce(nullif(trim(coalesce(p->>'origem_lead_detalhe', '')), ''), 'Site — formulário público (Quero alugar)'),
    v_etapa_id
  )
  on conflict (empresa_id, cpf) do update set
    nome_completo = excluded.nome_completo,
    email = coalesce(excluded.email, motoristas.email),
    telefone = coalesce(excluded.telefone, motoristas.telefone),
    data_nascimento = coalesce(excluded.data_nascimento, motoristas.data_nascimento),
    cnh_numero = coalesce(excluded.cnh_numero, motoristas.cnh_numero),
    cnh_categoria = coalesce(excluded.cnh_categoria, motoristas.cnh_categoria),
    cnh_validade = coalesce(excluded.cnh_validade, motoristas.cnh_validade),
    endereco = coalesce(excluded.endereco, motoristas.endereco),
    cidade = coalesce(excluded.cidade, motoristas.cidade),
    estado = coalesce(excluded.estado, motoristas.estado),
    observacoes = coalesce(excluded.observacoes, motoristas.observacoes)
  where motoristas.status = 'lead'
  returning id into v_id;

  if v_id is null then
    select id into v_id from motoristas where empresa_id = v_empresa_id and cpf = v_cpf;
  end if;

  if public.fn_lead_publico_valido(v_empresa_id, v_id) then
    insert into motoristas_triagem (
      motorista_id, empresa_id, rg, estado_civil, cep, numero, complemento, bairro,
      ja_dirige_app, tempo_experiencia, apps_utilizados, km_semanal_estimado, cnh_ear,
      possui_veiculo_proprio, disponibilidade_horas, referencia_nome, referencia_telefone,
      contato_emergencia_nome, contato_emergencia_telefone, quando_pretende_comecar,
      melhor_horario_contato, aceitou_politica_privacidade, aceitou_politica_em,
      ja_alugou_veiculo_antes, locacao_anterior_sem_pendencias, locacao_anterior_motivo_saida,
      renda_mensal_declarada, possui_outra_fonte_renda, possui_conta_bancaria, km_semanal_km
    ) values (
      v_id,
      v_empresa_id,
      nullif(trim(coalesce(p->>'rg', '')), ''),
      nullif(trim(coalesce(p->>'estado_civil', '')), ''),
      nullif(regexp_replace(coalesce(p->>'cep', ''), '\D', '', 'g'), ''),
      nullif(trim(coalesce(p->>'numero', '')), ''),
      nullif(trim(coalesce(p->>'complemento', '')), ''),
      nullif(trim(coalesce(p->>'bairro', '')), ''),
      (p->>'ja_dirige_app')::boolean,
      nullif(trim(coalesce(p->>'tempo_experiencia', '')), ''),
      coalesce((select array_agg(value) from jsonb_array_elements_text(coalesce(p->'apps_utilizados', '[]'::jsonb))), '{}'),
      nullif(trim(coalesce(p->>'km_semanal_estimado', '')), ''),
      (p->>'cnh_ear')::boolean,
      (p->>'possui_veiculo_proprio')::boolean,
      nullif(trim(coalesce(p->>'disponibilidade_horas', '')), ''),
      nullif(trim(coalesce(p->>'referencia_nome', '')), ''),
      nullif(trim(coalesce(p->>'referencia_telefone', '')), ''),
      nullif(trim(coalesce(p->>'contato_emergencia_nome', '')), ''),
      nullif(trim(coalesce(p->>'contato_emergencia_telefone', '')), ''),
      nullif(trim(coalesce(p->>'quando_pretende_comecar', '')), ''),
      nullif(trim(coalesce(p->>'melhor_horario_contato', '')), ''),
      true,
      now(),
      (p->>'ja_alugou_veiculo_antes')::boolean,
      (p->>'locacao_anterior_sem_pendencias')::boolean,
      nullif(trim(coalesce(p->>'locacao_anterior_motivo_saida', '')), ''),
      nullif(p->>'renda_mensal_declarada', '')::numeric,
      (p->>'possui_outra_fonte_renda')::boolean,
      (p->>'possui_conta_bancaria')::boolean,
      nullif(p->>'km_semanal_km', '')::int
    )
    on conflict (motorista_id) do update set
      rg = coalesce(excluded.rg, motoristas_triagem.rg),
      estado_civil = coalesce(excluded.estado_civil, motoristas_triagem.estado_civil),
      cep = coalesce(excluded.cep, motoristas_triagem.cep),
      numero = coalesce(excluded.numero, motoristas_triagem.numero),
      complemento = coalesce(excluded.complemento, motoristas_triagem.complemento),
      bairro = coalesce(excluded.bairro, motoristas_triagem.bairro),
      ja_dirige_app = coalesce(excluded.ja_dirige_app, motoristas_triagem.ja_dirige_app),
      tempo_experiencia = coalesce(excluded.tempo_experiencia, motoristas_triagem.tempo_experiencia),
      apps_utilizados = case when array_length(excluded.apps_utilizados, 1) > 0 then excluded.apps_utilizados else motoristas_triagem.apps_utilizados end,
      km_semanal_estimado = coalesce(excluded.km_semanal_estimado, motoristas_triagem.km_semanal_estimado),
      cnh_ear = coalesce(excluded.cnh_ear, motoristas_triagem.cnh_ear),
      possui_veiculo_proprio = coalesce(excluded.possui_veiculo_proprio, motoristas_triagem.possui_veiculo_proprio),
      disponibilidade_horas = coalesce(excluded.disponibilidade_horas, motoristas_triagem.disponibilidade_horas),
      referencia_nome = coalesce(excluded.referencia_nome, motoristas_triagem.referencia_nome),
      referencia_telefone = coalesce(excluded.referencia_telefone, motoristas_triagem.referencia_telefone),
      contato_emergencia_nome = coalesce(excluded.contato_emergencia_nome, motoristas_triagem.contato_emergencia_nome),
      contato_emergencia_telefone = coalesce(excluded.contato_emergencia_telefone, motoristas_triagem.contato_emergencia_telefone),
      quando_pretende_comecar = coalesce(excluded.quando_pretende_comecar, motoristas_triagem.quando_pretende_comecar),
      melhor_horario_contato = coalesce(excluded.melhor_horario_contato, motoristas_triagem.melhor_horario_contato),
      aceitou_politica_privacidade = true,
      aceitou_politica_em = now(),
      ja_alugou_veiculo_antes = coalesce(excluded.ja_alugou_veiculo_antes, motoristas_triagem.ja_alugou_veiculo_antes),
      locacao_anterior_sem_pendencias = coalesce(excluded.locacao_anterior_sem_pendencias, motoristas_triagem.locacao_anterior_sem_pendencias),
      locacao_anterior_motivo_saida = coalesce(excluded.locacao_anterior_motivo_saida, motoristas_triagem.locacao_anterior_motivo_saida),
      renda_mensal_declarada = coalesce(excluded.renda_mensal_declarada, motoristas_triagem.renda_mensal_declarada),
      possui_outra_fonte_renda = coalesce(excluded.possui_outra_fonte_renda, motoristas_triagem.possui_outra_fonte_renda),
      possui_conta_bancaria = coalesce(excluded.possui_conta_bancaria, motoristas_triagem.possui_conta_bancaria),
      km_semanal_km = coalesce(excluded.km_semanal_km, motoristas_triagem.km_semanal_km);
  end if;

  return jsonb_build_object('id', v_id, 'empresa_id', v_empresa_id);
end;
$$;

revoke all on function public.criar_lead_publico(jsonb) from public;
grant execute on function public.criar_lead_publico(jsonb) to anon, authenticated;

-- ============================================================
-- 2. rodascore_config — pesos e parâmetros, versionados. v1.0 seedada abaixo pra toda empresa
-- existente. Nunca é sobrescrita: uma v1.1 futura é uma LINHA NOVA com vigente_desde depois;
-- resultados antigos continuam apontando pra v1.0 (rastreabilidade — nunca recalcula
-- silenciosamente o passado com régua nova).
-- ============================================================

create table if not exists rodascore_config (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  versao text not null,

  peso_documentacao int not null default 10,
  peso_cnh int not null default 15,
  peso_apps int not null default 20,
  peso_locacoes int not null default 15,
  peso_financeiro int not null default 15,
  peso_operacional int not null default 10,
  peso_consistencia_referencias int not null default 5,
  peso_entrevista int not null default 10,

  faixa_forte_min int not null default 80,
  faixa_analise_min int not null default 65,
  faixa_alto_risco_min int not null default 50,

  -- Parâmetro do critério financeiro: referência de custo semanal do aluguel, usada só pra
  -- medir CAPACIDADE DE PAGAR (renda declarada ÷ este valor), nunca renda em valor absoluto —
  -- ver seção 5 sobre por que não pontuamos "quão rica é a pessoa".
  referencia_aluguel_semanal numeric(10,2) not null default 350.00,

  vigente_desde timestamptz not null default now(),
  ativa boolean not null default true,
  criado_por uuid references usuarios(id) on delete set null,
  criado_em timestamptz not null default now(),

  constraint chk_rodascore_pesos_somam_100 check (
    peso_documentacao + peso_cnh + peso_apps + peso_locacoes + peso_financeiro +
    peso_operacional + peso_consistencia_referencias + peso_entrevista = 100
  )
);

comment on table rodascore_config is
  'RodaScore — pesos por categoria, versionados por empresa. Nunca faça UPDATE nos pesos de '
  'uma versão vigente: crie uma linha nova (versao nova, vigente_desde now(), ativa=true) e '
  'desative a anterior (ativa=false) — resultados já calculados (rodascore_resultado) guardam '
  'a config_id usada, então nunca mudam de valor retroativamente.';

create unique index if not exists uq_rodascore_config_versao on rodascore_config(empresa_id, versao);
create index if not exists idx_rodascore_config_ativa on rodascore_config(empresa_id) where ativa;

alter table rodascore_config enable row level security;

drop policy if exists "rodascore_config: select por empresa" on rodascore_config;
create policy "rodascore_config: select por empresa" on rodascore_config
  for select using (empresa_id = public.current_empresa_id());

-- Escrita restrita a quem já administra o funil (mesma ação usada em funil_etapas, migration
-- 0026) — mudar peso de score é decisão de gestão, não operação do dia a dia.
drop policy if exists "rodascore_config: insert restrito" on rodascore_config;
create policy "rodascore_config: insert restrito" on rodascore_config
  for insert with check (empresa_id = public.current_empresa_id() and public.pode('motoristas', 'gerenciar_funil'));

drop policy if exists "rodascore_config: update restrito" on rodascore_config;
create policy "rodascore_config: update restrito" on rodascore_config
  for update using (empresa_id = public.current_empresa_id() and public.pode('motoristas', 'gerenciar_funil'));

-- Seed v1.0 pra toda empresa que ainda não tem config nenhuma.
insert into rodascore_config (empresa_id, versao)
select e.id, 'v1.0' from empresas e
where not exists (select 1 from rodascore_config c where c.empresa_id = e.id);

-- ============================================================
-- 3. rodascore_resultado — snapshot do cálculo mais recente por motorista. 1:1 (upsert), não
-- histórico linha-a-linha — quem quer histórico de decisão usa `motorista_decisoes` (seção 6),
-- que é o que realmente precisa ficar imutável pra auditoria.
-- ============================================================

create table if not exists rodascore_resultado (
  motorista_id uuid primary key references motoristas(id) on delete cascade,
  empresa_id uuid not null references empresas(id) on delete cascade,
  config_id uuid not null references rodascore_config(id),

  score_documentacao int not null default 0,
  score_cnh int not null default 0,
  score_apps int not null default 0,
  score_locacoes int not null default 0,
  score_financeiro int not null default 0,
  score_operacional int not null default 0,
  score_consistencia_referencias int not null default 0,
  score_entrevista int,

  entrevista_pendente boolean not null default true,
  total int not null default 0,
  faixa text,

  calculado_em timestamptz not null default now()
);

comment on table rodascore_resultado is
  'Snapshot do RodaScore. Enquanto entrevista_pendente=true, `total` e `faixa` são PARCIAIS '
  '(máximo 90, não 100) — a UI precisa deixar isso explícito ("aguardando entrevista"), nunca '
  'mostrar um score final incompleto como se fosse definitivo.';

alter table rodascore_resultado enable row level security;

drop policy if exists "rodascore_resultado: select por empresa" on rodascore_resultado;
create policy "rodascore_resultado: select por empresa" on rodascore_resultado
  for select using (empresa_id = public.current_empresa_id());

-- Sem policy de insert/update pra staff nem anon: só a função SECURITY DEFINER
-- (fn_calcular_rodascore, seção 4) escreve aqui.

-- ============================================================
-- 4. rodascore_flags — separado do score de propósito (pedido explícito do Carlos: flag NÃO
-- entra na conta, só bloqueia aprovação). Automáticas são regeradas a cada cálculo; manuais
-- (criadas por um humano na tela) nunca são tocadas pelo motor.
-- ============================================================

create table if not exists rodascore_flags (
  id uuid primary key default gen_random_uuid(),
  motorista_id uuid not null references motoristas(id) on delete cascade,
  empresa_id uuid not null references empresas(id) on delete cascade,

  codigo text not null,
  descricao text not null,
  severidade text not null check (severidade in ('critica','atencao')),
  origem text not null check (origem in ('automatica','manual')),

  resolvida boolean not null default false,
  resolvida_em timestamptz,
  resolvida_por uuid references usuarios(id) on delete set null,

  criado_por uuid references usuarios(id) on delete set null,
  criado_em timestamptz not null default now()
);

create index if not exists idx_rodascore_flags_motorista on rodascore_flags(motorista_id);

alter table rodascore_flags enable row level security;

drop policy if exists "rodascore_flags: select por empresa" on rodascore_flags;
create policy "rodascore_flags: select por empresa" on rodascore_flags
  for select using (empresa_id = public.current_empresa_id());

-- Staff pode criar flag manual e resolver qualquer flag (automática ou manual) — nunca apaga
-- (soft, via `resolvida`), pra manter rastro de que existiu.
drop policy if exists "rodascore_flags: insert manual por empresa" on rodascore_flags;
create policy "rodascore_flags: insert manual por empresa" on rodascore_flags
  for insert with check (
    empresa_id = public.current_empresa_id()
    and origem = 'manual'
    and public.pode('motoristas', 'editar')
  );

drop policy if exists "rodascore_flags: update (resolver) por empresa" on rodascore_flags;
create policy "rodascore_flags: update (resolver) por empresa" on rodascore_flags
  for update using (empresa_id = public.current_empresa_id() and public.pode('motoristas', 'editar'));

-- ============================================================
-- 5. Motor de cálculo — fn_calcular_rodascore(motorista_id)
--
-- Regra dura de não-discriminação: a função abaixo só lê `motoristas_triagem` (experiência,
-- CNH, locação, financeiro, operacional, referências) + `arquivos` (documentação) +
-- `motorista_entrevista` (seção 7). NUNCA lê estado_civil, endereço, RG, nem qualquer coluna
-- de `motoristas` que seja dado pessoal em vez de critério de capacidade/risco operacional.
--
-- Financeiro (seção específica): pontua CAPACIDADE DE PAGAR (renda declarada ÷ referência de
-- aluguel semanal×4), nunca renda em valor absoluto — uma pessoa de renda baixa que ganha 3x o
-- valor do aluguel pontua igual a uma de renda alta que ganha 3x o dela. Isso é decisão minha
-- [Provável, decisão de arquitetura sem pedido explícito do Carlos sobre ESTA nuance
-- específica], porque "não pontuar característica sensível" pedido por ele se aplica aqui de
-- um jeito não óbvio: pontuar renda absoluta seria pontuar classe social, não capacidade de
-- pagamento. `possui_conta_bancaria` foi excluído do score pelo mesmo motivo (proxy fraco de
-- condição social) — vira só flag informativa, nunca pontuação.
-- ============================================================

create or replace function public.fn_calcular_rodascore(p_motorista_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_config record;
  v_triagem record;
  v_motorista record;
  v_entrevista record;

  v_score_doc int := 0;
  v_score_cnh int := 0;
  v_score_apps int := 0;
  v_score_locacoes int := 0;
  v_score_financeiro int := 0;
  v_score_operacional int := 0;
  v_score_consistencia int := 0;
  v_score_entrevista int;
  v_entrevista_pendente boolean := true;
  v_total int;
  v_faixa text;

  v_doc_cnh_ok boolean;
  v_doc_comprovante_ok boolean;
  v_idade_anos int;
  v_ratio_financeiro numeric;
begin
  select id, empresa_id, data_nascimento, cnh_categoria, cnh_validade
    into v_motorista
    from motoristas where id = p_motorista_id;

  if v_motorista.id is null then
    raise exception 'Motorista não encontrado.';
  end if;

  v_empresa_id := v_motorista.empresa_id;

  select * into v_config from rodascore_config
    where empresa_id = v_empresa_id and ativa = true
    order by vigente_desde desc limit 1;

  if v_config.id is null then
    raise exception 'Nenhuma configuração de RodaScore ativa para esta empresa.';
  end if;

  select * into v_triagem from motoristas_triagem where motorista_id = p_motorista_id;
  select * into v_entrevista from motorista_entrevista where motorista_id = p_motorista_id;

  -- Limpa flags automáticas anteriores (recalcula do zero) — flags manuais nunca são tocadas.
  delete from rodascore_flags where motorista_id = p_motorista_id and origem = 'automatica';

  -- ---------- 1. Documentação (peso_documentacao) ----------
  select bool_or(a.categoria = 'CNH' and coalesce(a.status_revisao::text, 'aguardando') <> 'rejeitado')
    into v_doc_cnh_ok
    from arquivos a where a.entidade_tipo = 'motorista' and a.entidade_id = p_motorista_id;

  select bool_or(a.categoria = 'Comprovante de residência' and coalesce(a.status_revisao::text, 'aguardando') <> 'rejeitado')
    into v_doc_comprovante_ok
    from arquivos a where a.entidade_tipo = 'motorista' and a.entidade_id = p_motorista_id;

  v_score_doc := round(v_config.peso_documentacao::numeric *
    ((case when coalesce(v_doc_cnh_ok, false) then 0.5 else 0 end) +
     (case when coalesce(v_doc_comprovante_ok, false) then 0.5 else 0 end)));

  if not coalesce(v_doc_cnh_ok, false) then
    insert into rodascore_flags (motorista_id, empresa_id, codigo, descricao, severidade, origem)
    values (p_motorista_id, v_empresa_id, 'doc_cnh_ausente_ou_reprovada', 'CNH não enviada ou reprovada na revisão de documentos.', 'critica', 'automatica');
  end if;
  if not coalesce(v_doc_comprovante_ok, false) then
    insert into rodascore_flags (motorista_id, empresa_id, codigo, descricao, severidade, origem)
    values (p_motorista_id, v_empresa_id, 'doc_comprovante_ausente_ou_reprovado', 'Comprovante de residência não enviado ou reprovado na revisão de documentos.', 'atencao', 'automatica');
  end if;

  -- ---------- 2. CNH (peso_cnh): metade validade, metade categoria compatível ----------
  if v_motorista.cnh_validade is not null and v_motorista.cnh_validade >= current_date then
    v_score_cnh := v_score_cnh + round(v_config.peso_cnh::numeric * 0.667);
  else
    insert into rodascore_flags (motorista_id, empresa_id, codigo, descricao, severidade, origem)
    values (p_motorista_id, v_empresa_id, 'cnh_vencida_ou_ausente', 'CNH vencida ou sem data de validade informada.', 'critica', 'automatica');
  end if;

  if v_motorista.cnh_categoria is not null and v_motorista.cnh_categoria !~ '^[Aa]$' then
    v_score_cnh := v_score_cnh + round(v_config.peso_cnh::numeric * 0.333);
  else
    insert into rodascore_flags (motorista_id, empresa_id, codigo, descricao, severidade, origem)
    values (p_motorista_id, v_empresa_id, 'cnh_categoria_incompativel', 'Categoria de CNH ausente ou não habilita condução de carro (só moto).', 'critica', 'automatica');
  end if;

  -- ---------- 3. Idade mínima (flag, não afeta score diretamente) ----------
  if v_motorista.data_nascimento is not null then
    v_idade_anos := extract(year from age(current_date, v_motorista.data_nascimento));
    if v_idade_anos < 18 then
      insert into rodascore_flags (motorista_id, empresa_id, codigo, descricao, severidade, origem)
      values (p_motorista_id, v_empresa_id, 'menor_de_idade', 'Candidato(a) declarado com menos de 18 anos.', 'critica', 'automatica');
    end if;
  end if;

  -- ---------- 4. Apps (peso_apps): experiência (75%) + diversidade de apps (25%) ----------
  if coalesce(v_triagem.ja_dirige_app, false) then
    v_score_apps := v_score_apps + round(v_config.peso_apps::numeric * 0.75 *
      (case v_triagem.tempo_experiencia
        when 'mais_5_anos' then 1.0
        when '2_a_5_anos' then 0.87
        when '1_a_2_anos' then 0.73
        when '6_a_12_meses' then 0.53
        when 'menos_6_meses' then 0.27
        else 0.0
      end));

    v_score_apps := v_score_apps + round(v_config.peso_apps::numeric * 0.25 *
      (case
        when coalesce(array_length(v_triagem.apps_utilizados, 1), 0) >= 3 then 1.0
        when coalesce(array_length(v_triagem.apps_utilizados, 1), 0) = 2 then 0.8
        when coalesce(array_length(v_triagem.apps_utilizados, 1), 0) = 1 then 0.6
        else 0.0
      end));
  end if;

  -- ---------- 5. Locações (peso_locacoes) ----------
  if v_triagem.ja_alugou_veiculo_antes is null then
    -- Nunca alugou antes (ou não respondeu): não é penalidade, é ausência de histórico —
    -- ponto de partida neutro documentado, revisável com dado real (mesmo princípio que o
    -- projeto já aplica em Driver Score/Prime Driver).
    v_score_locacoes := round(v_config.peso_locacoes::numeric * 0.67);
  elsif v_triagem.ja_alugou_veiculo_antes = false then
    v_score_locacoes := round(v_config.peso_locacoes::numeric * 0.67);
  elsif coalesce(v_triagem.locacao_anterior_sem_pendencias, false) then
    v_score_locacoes := v_config.peso_locacoes;
  else
    v_score_locacoes := round(v_config.peso_locacoes::numeric * 0.33);
    insert into rodascore_flags (motorista_id, empresa_id, codigo, descricao, severidade, origem)
    values (p_motorista_id, v_empresa_id, 'locacao_anterior_com_pendencia', 'Candidato(a) declarou pendência em locação de veículo anterior.', 'atencao', 'automatica');
  end if;

  -- ---------- 6. Financeiro (peso_financeiro): capacidade de pagar, não renda absoluta ----------
  if v_triagem.renda_mensal_declarada is not null and v_triagem.renda_mensal_declarada > 0
     and v_config.referencia_aluguel_semanal > 0 then
    v_ratio_financeiro := v_triagem.renda_mensal_declarada / (v_config.referencia_aluguel_semanal * 4);
    v_score_financeiro := round(v_config.peso_financeiro::numeric * 0.8 *
      (case
        when v_ratio_financeiro >= 3 then 1.0
        when v_ratio_financeiro >= 2 then 0.75
        when v_ratio_financeiro >= 1.5 then 0.5
        when v_ratio_financeiro >= 1 then 0.25
        else 0.0
      end));
    if v_ratio_financeiro < 1 then
      insert into rodascore_flags (motorista_id, empresa_id, codigo, descricao, severidade, origem)
      values (p_motorista_id, v_empresa_id, 'renda_declarada_insuficiente', 'Renda declarada abaixo da referência de custo do aluguel — verificar com o candidato.', 'atencao', 'automatica');
    end if;
  else
    insert into rodascore_flags (motorista_id, empresa_id, codigo, descricao, severidade, origem)
    values (p_motorista_id, v_empresa_id, 'renda_nao_informada', 'Renda mensal não informada pelo candidato.', 'atencao', 'automatica');
  end if;

  if coalesce(v_triagem.possui_outra_fonte_renda, false) then
    v_score_financeiro := v_score_financeiro + round(v_config.peso_financeiro::numeric * 0.2);
  end if;

  if v_triagem.possui_conta_bancaria = false then
    insert into rodascore_flags (motorista_id, empresa_id, codigo, descricao, severidade, origem)
    values (p_motorista_id, v_empresa_id, 'sem_conta_bancaria', 'Candidato(a) declarou não ter conta bancária — pode dificultar o pagamento recorrente.', 'atencao', 'automatica');
  end if;

  -- ---------- 7. Operacional (peso_operacional): disponibilidade + prazo pra começar ----------
  v_score_operacional := v_score_operacional + round(v_config.peso_operacional::numeric * 0.5 *
    (case v_triagem.disponibilidade_horas
      when 'periodo_integral' then 1.0
      when 'flexivel' then 0.8
      when 'meio_periodo' then 0.6
      when 'fins_de_semana' then 0.4
      else 0.0
    end));

  v_score_operacional := v_score_operacional + round(v_config.peso_operacional::numeric * 0.5 *
    (case v_triagem.quando_pretende_comecar
      when 'imediatamente' then 1.0
      when '15_dias' then 0.8
      when '30_dias' then 0.4
      else 0.0
    end));

  -- ---------- 8. Consistência / Referências (peso_consistencia_referencias) ----------
  if v_triagem.referencia_nome is not null and v_triagem.referencia_telefone is not null
     and v_triagem.contato_emergencia_nome is not null and v_triagem.contato_emergencia_telefone is not null then
    if regexp_replace(v_triagem.referencia_telefone, '\D', '', 'g') <> regexp_replace(v_triagem.contato_emergencia_telefone, '\D', '', 'g') then
      v_score_consistencia := v_config.peso_consistencia_referencias;
    else
      v_score_consistencia := round(v_config.peso_consistencia_referencias::numeric * 0.5);
      insert into rodascore_flags (motorista_id, empresa_id, codigo, descricao, severidade, origem)
      values (p_motorista_id, v_empresa_id, 'referencia_igual_emergencia', 'Telefone de referência pessoal é igual ao de contato de emergência.', 'atencao', 'automatica');
    end if;
  elsif v_triagem.referencia_nome is not null or v_triagem.contato_emergencia_nome is not null then
    v_score_consistencia := round(v_config.peso_consistencia_referencias::numeric * 0.5);
  end if;

  -- ---------- 9. Entrevista (peso_entrevista): só existe depois que o staff registra ----------
  if v_entrevista.nota is not null then
    v_score_entrevista := round(v_config.peso_entrevista::numeric * (v_entrevista.nota / 10.0));
    v_entrevista_pendente := false;
  else
    v_score_entrevista := null;
    v_entrevista_pendente := true;
  end if;

  v_total := v_score_doc + v_score_cnh + v_score_apps + v_score_locacoes + v_score_financeiro
    + v_score_operacional + v_score_consistencia + coalesce(v_score_entrevista, 0);

  if v_entrevista_pendente then
    v_faixa := null; -- parcial — UI mostra "aguardando entrevista", nunca uma faixa fechada.
  else
    v_faixa := case
      when v_total >= v_config.faixa_forte_min then 'forte'
      when v_total >= v_config.faixa_analise_min then 'analise'
      when v_total >= v_config.faixa_alto_risco_min then 'alto_risco'
      else 'nao_priorizar'
    end;
  end if;

  insert into rodascore_resultado (
    motorista_id, empresa_id, config_id, score_documentacao, score_cnh, score_apps,
    score_locacoes, score_financeiro, score_operacional, score_consistencia_referencias,
    score_entrevista, entrevista_pendente, total, faixa, calculado_em
  ) values (
    p_motorista_id, v_empresa_id, v_config.id, v_score_doc, v_score_cnh, v_score_apps,
    v_score_locacoes, v_score_financeiro, v_score_operacional, v_score_consistencia,
    v_score_entrevista, v_entrevista_pendente, v_total, v_faixa, now()
  )
  on conflict (motorista_id) do update set
    empresa_id = excluded.empresa_id,
    config_id = excluded.config_id,
    score_documentacao = excluded.score_documentacao,
    score_cnh = excluded.score_cnh,
    score_apps = excluded.score_apps,
    score_locacoes = excluded.score_locacoes,
    score_financeiro = excluded.score_financeiro,
    score_operacional = excluded.score_operacional,
    score_consistencia_referencias = excluded.score_consistencia_referencias,
    score_entrevista = excluded.score_entrevista,
    entrevista_pendente = excluded.entrevista_pendente,
    total = excluded.total,
    faixa = excluded.faixa,
    calculado_em = excluded.calculado_em;
end;
$$;

grant execute on function public.fn_calcular_rodascore(uuid) to anon, authenticated;

-- RPC autenticada pra staff forçar recálculo manual (ex.: depois de editar a triagem à mão).
create or replace function public.recalcular_rodascore(p_motorista_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from motoristas m join usuarios u on u.id = auth.uid()
    where m.id = p_motorista_id and m.empresa_id = u.empresa_id
  ) then
    raise exception 'Sem permissão para recalcular o RodaScore deste candidato.';
  end if;
  perform public.fn_calcular_rodascore(p_motorista_id);
end;
$$;

revoke all on function public.recalcular_rodascore(uuid) from public;
grant execute on function public.recalcular_rodascore(uuid) to authenticated;

-- Chama o motor automaticamente ao final do cadastro público (mesma transação de
-- criar_lead_publico) — o candidato nunca vê nem envia um score, só os fatos brutos.
create or replace function public.fn_criar_lead_publico_calcula_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fn_calcular_rodascore(new.motorista_id);
  return new;
end;
$$;

drop trigger if exists trg_motoristas_triagem_calcula_rodascore on motoristas_triagem;
create trigger trg_motoristas_triagem_calcula_rodascore
  after insert or update on motoristas_triagem
  for each row execute function public.fn_criar_lead_publico_calcula_score();

-- Recalcula sozinho em dois momentos: (1) quando o documento é ENVIADO — o upload acontece
-- numa chamada separada, DEPOIS de criar_lead_publico já ter rodado o primeiro cálculo (ver
-- api/leadPublico.ts), então sem isso a categoria "Documentação" ficaria presa em 0 com flag
-- crítica falsa até um humano tocar no cadastro; e (2) quando o staff aprova/reprova o
-- documento depois (categoria muda sem ninguém pedir recálculo explicitamente).
create or replace function public.fn_arquivo_revisado_recalcula_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.entidade_tipo = 'motorista'
     and (TG_OP = 'INSERT' or old.status_revisao is distinct from new.status_revisao) then
    if exists (select 1 from motoristas_triagem where motorista_id = new.entidade_id) then
      perform public.fn_calcular_rodascore(new.entidade_id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_arquivos_revisado_recalcula_rodascore on arquivos;
create trigger trg_arquivos_revisado_recalcula_rodascore
  after insert or update on arquivos
  for each row execute function public.fn_arquivo_revisado_recalcula_score();

-- ============================================================
-- 6. motorista_decisoes — toda decisão humana sobre o candidato. Nunca UPDATE, só INSERT
-- (histórico completo, imutável — é o registro de auditoria de verdade).
-- ============================================================

create table if not exists motorista_decisoes (
  id uuid primary key default gen_random_uuid(),
  motorista_id uuid not null references motoristas(id) on delete cascade,
  empresa_id uuid not null references empresas(id) on delete cascade,
  tipo_decisao text not null check (tipo_decisao in ('aprovar','reprovar','solicitar_mais_informacao','manter_em_analise')),
  justificativa text not null,
  usuario_id uuid not null references usuarios(id) on delete restrict,
  criado_em timestamptz not null default now()
);

create index if not exists idx_motorista_decisoes_motorista on motorista_decisoes(motorista_id, criado_em desc);

alter table motorista_decisoes enable row level security;

drop policy if exists "motorista_decisoes: select por empresa" on motorista_decisoes;
create policy "motorista_decisoes: select por empresa" on motorista_decisoes
  for select using (empresa_id = public.current_empresa_id());

-- Sem policy de INSERT direta: só via RPC `registrar_decisao_motorista` abaixo, porque
-- "aprovar" precisa ser bloqueado a nível de banco quando existe flag crítica em aberto — se a
-- policy permitisse INSERT direto, esse bloqueio ficaria só na UI (contornável).

create or replace function public.registrar_decisao_motorista(p_motorista_id uuid, p_tipo_decisao text, p_justificativa text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_usuario_id uuid;
  v_flag_critica_aberta boolean;
  v_id uuid;
begin
  select u.id, u.empresa_id into v_usuario_id, v_empresa_id
    from usuarios u where u.id = auth.uid();

  if v_usuario_id is null then
    raise exception 'Usuário não identificado.';
  end if;

  if not public.pode('motoristas', 'editar') then
    raise exception 'Sem permissão para registrar decisão.';
  end if;

  if not exists (select 1 from motoristas where id = p_motorista_id and empresa_id = v_empresa_id) then
    raise exception 'Candidato não encontrado nesta empresa.';
  end if;

  if trim(coalesce(p_justificativa, '')) = '' then
    raise exception 'Justificativa é obrigatória para registrar uma decisão.';
  end if;

  -- Trava de verdade, não só de tela: aprovar com flag crítica em aberto é bloqueado no banco.
  if p_tipo_decisao = 'aprovar' then
    select exists (
      select 1 from rodascore_flags
      where motorista_id = p_motorista_id and severidade = 'critica' and resolvida = false
    ) into v_flag_critica_aberta;

    if v_flag_critica_aberta then
      raise exception 'Não é possível aprovar: existe(m) flag(s) crítica(s) em aberto para este candidato. Resolva-as (ou registre outra decisão) antes de aprovar.';
    end if;
  end if;

  insert into motorista_decisoes (motorista_id, empresa_id, tipo_decisao, justificativa, usuario_id)
  values (p_motorista_id, v_empresa_id, p_tipo_decisao, trim(p_justificativa), v_usuario_id)
  returning id into v_id;

  insert into timeline_eventos (empresa_id, entidade_tipo, entidade_id, tipo, descricao, usuario_id, criado_em)
  values (v_empresa_id, 'motorista', p_motorista_id, 'decisao_registrada',
    'Decisão registrada: ' || p_tipo_decisao || ' — ' || trim(p_justificativa), v_usuario_id, now());

  return v_id;
end;
$$;

revoke all on function public.registrar_decisao_motorista(uuid, text, text) from public;
grant execute on function public.registrar_decisao_motorista(uuid, text, text) to authenticated;

-- ============================================================
-- 7. motorista_entrevista — único sinal do RodaScore que não vem do wizard. 1:1, upsert (a
-- entrevista pode ser refeita/atualizada, ao contrário da decisão que é histórico imutável).
-- ============================================================

create table if not exists motorista_entrevista (
  motorista_id uuid primary key references motoristas(id) on delete cascade,
  empresa_id uuid not null references empresas(id) on delete cascade,
  nota numeric(4,1) not null check (nota >= 0 and nota <= 10),
  observacoes text,
  entrevistado_por uuid references usuarios(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table motorista_entrevista enable row level security;

drop policy if exists "motorista_entrevista: select por empresa" on motorista_entrevista;
create policy "motorista_entrevista: select por empresa" on motorista_entrevista
  for select using (empresa_id = public.current_empresa_id());

-- Sem policy de insert/update direta — só via RPC abaixo, que já dispara o recálculo do score
-- na mesma operação (evitar tela mostrando nota de entrevista sem o total refletir ainda).

create or replace function public.registrar_entrevista_rodascore(p_motorista_id uuid, p_nota numeric, p_observacoes text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_usuario_id uuid;
begin
  select u.id, u.empresa_id into v_usuario_id, v_empresa_id from usuarios u where u.id = auth.uid();

  if v_usuario_id is null or not public.pode('motoristas', 'editar') then
    raise exception 'Sem permissão para registrar entrevista.';
  end if;

  if not exists (select 1 from motoristas where id = p_motorista_id and empresa_id = v_empresa_id) then
    raise exception 'Candidato não encontrado nesta empresa.';
  end if;

  if p_nota is null or p_nota < 0 or p_nota > 10 then
    raise exception 'Nota da entrevista deve estar entre 0 e 10.';
  end if;

  insert into motorista_entrevista (motorista_id, empresa_id, nota, observacoes, entrevistado_por, atualizado_em)
  values (p_motorista_id, v_empresa_id, p_nota, nullif(trim(coalesce(p_observacoes, '')), ''), v_usuario_id, now())
  on conflict (motorista_id) do update set
    nota = excluded.nota,
    observacoes = excluded.observacoes,
    entrevistado_por = excluded.entrevistado_por,
    atualizado_em = now();

  perform public.fn_calcular_rodascore(p_motorista_id);
end;
$$;

revoke all on function public.registrar_entrevista_rodascore(uuid, numeric, text) from public;
grant execute on function public.registrar_entrevista_rodascore(uuid, numeric, text) to authenticated;

-- ============================================================
-- 8. Recalcula o RodaScore de todo lead já existente (ex.: o que restar depois da limpeza do
-- lead de teste) — idempotente, seguro rodar mesmo com zero linhas em motoristas_triagem.
-- ============================================================

do $$
declare
  v_motorista_id uuid;
begin
  for v_motorista_id in select motorista_id from motoristas_triagem loop
    perform public.fn_calcular_rodascore(v_motorista_id);
  end loop;
end $$;
