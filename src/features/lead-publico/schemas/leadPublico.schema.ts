import { z } from 'zod';

// Cadastro público do funil ("Quero alugar" / "Quero meu Carro Elétrico" na landing).
// Ficha de triagem completa (Carlos: "não podemos errar na contratação") — bem maior que o
// motoristaSchema interno (features/motoristas), porque aqui é a ÚNICA chance de coletar
// esse dado: não tem um staff editando o cadastro depois, é o próprio candidato preenchendo.
//
// Campos que vão para `motoristas` (schema/API já existente) ficam misturados com campos que
// só existem em `motoristas_triagem` (migration 0053/0054) — a separação por tabela é escondida
// do formulário; api/leadPublico.ts é quem sabe qual campo vai para qual lugar.
//
// A partir da migration 0054 (RodaScore v1.0), este formulário virou um wizard de 9 etapas
// (CadastroLeadPage.tsx) e ganhou 2 categorias novas — Histórico de locações e Capacidade
// financeira — porque o RodaScore pontua exatamente essas 8 categorias objetivas
// (Documentação/CNH/Apps/Locações/Financeiro/Operacional/Consistência-Referências/Entrevista).
// Nenhum campo de dado pessoal sensível (estado civil, endereço, RG) entra na conta — só
// informa a análise humana. Ver comentário completo em fn_calcular_rodascore (migration 0054).
// Bug real encontrado por Carlos ao rodar `npm run build` (7 erros TS2538/TS2322 em
// CadastroLeadPage.tsx, na etapa de Revisão): `z.preprocess(fn, schema)` sempre infere o TIPO
// DE ENTRADA (z.input<>) como não-indexável — o "unknown" que o preprocess aceita antes de
// normalizar não é o tipo do schema interno, é sempre um tipo genérico de entrada bruta. Como
// `LeadPublicoFormInput` (usado por watch()/register() no formulário) é justamente
// `z.input<typeof leadPublicoSchema>`, todo campo que passava por `optionalString`/
// `optionalNumber` ficava com um tipo de entrada não utilizável — só não quebrava a compilação
// nos campos onde eu não indexava um Record nem passava direto como filho de JSX. Corrigido
// trocando `preprocess` por `.optional().transform(...)`, que preserva o tipo de entrada do
// schema interno (string|undefined / string|number|undefined) e ainda faz a mesma normalização
// no output — testado localmente contra o zod de verdade (não só lido), reproduzindo o erro
// original e confirmando que a correção resolve, antes de mandar de novo pro Carlos.
const optionalString = () => z.string().optional().transform((val) => (val === '' ? undefined : val));

const optionalNumber = () =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val === '' || val === undefined || val === null ? undefined : Number(val)))
    .refine((val) => val === undefined || val >= 0, 'Não pode ser negativo');

const cpf = z
  .string()
  .min(1, 'CPF obrigatório')
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length === 11, 'CPF deve ter 11 dígitos');

const telefone = z
  .string()
  .min(1, 'Telefone obrigatório')
  .refine((v) => v.replace(/\D/g, '').length >= 10, 'Telefone inválido');

export const APPS_MOTORISTA = ['Uber', '99', 'inDrive', 'Outro'] as const;

// RodaScore v1.0 (migration 0054) — estes três campos eram texto livre ("Ex.: 1 ano, 6
// meses…", "Ex.: 800 km") na primeira versão do formulário. Viraram conjunto fechado / número
// porque o motor de score precisa de critério objetivo e auditável (pedido explícito do
// Carlos) — texto livre não dá pra pontuar com confiança nem repetibilidade. Os valores abaixo
// são EXATAMENTE os que `fn_calcular_rodascore` espera — mudar aqui sem mudar lá (ou
// vice-versa) quebra o cálculo silenciosamente.
export const TEMPO_EXPERIENCIA_OPCOES = [
  { value: 'nenhuma', label: 'Nunca dirigi para aplicativo' },
  { value: 'menos_6_meses', label: 'Menos de 6 meses' },
  { value: '6_a_12_meses', label: '6 a 12 meses' },
  { value: '1_a_2_anos', label: '1 a 2 anos' },
  { value: '2_a_5_anos', label: '2 a 5 anos' },
  { value: 'mais_5_anos', label: 'Mais de 5 anos' },
] as const;

export const DISPONIBILIDADE_OPCOES = [
  { value: 'periodo_integral', label: 'Período integral' },
  { value: 'meio_periodo', label: 'Meio período' },
  { value: 'fins_de_semana', label: 'Só fins de semana' },
  { value: 'flexivel', label: 'Flexível' },
] as const;

export const leadPublicoSchema = z.object({
  // honeypot: campo escondido via CSS na tela — humano nunca preenche, bot geralmente sim.
  // Sem validação aqui de propósito (ver CadastroLeadPage: checado dentro do onSubmit, não
  // pelo resolver — senão o zodResolver travaria o submit ANTES do bot cair na armadilha).
  website: z.string().optional(),

  // --- Etapa 1: Dados pessoais (inclui endereço) ---
  nome_completo: z.string().min(3, 'Informe seu nome completo').max(200),
  cpf,
  rg: optionalString(),
  data_nascimento: z.string().min(1, 'Data de nascimento obrigatória'),
  estado_civil: optionalString(),
  email: z.string().min(1, 'E-mail obrigatório').email('E-mail inválido'),
  telefone,
  cep: optionalString(),
  endereco: z.string().min(1, 'Endereço obrigatório'),
  numero: optionalString(),
  complemento: optionalString(),
  bairro: optionalString(),
  cidade: z.string().min(1, 'Cidade obrigatória'),
  estado: z.string().min(2, 'UF obrigatória').max(2),

  // --- Etapa 2: CNH ---
  cnh_numero: z.string().min(1, 'Número da CNH obrigatório'),
  cnh_categoria: z.string().min(1, 'Categoria da CNH obrigatória'),
  cnh_validade: z.string().min(1, 'Validade da CNH obrigatória'),
  cnh_ear: optionalString(),

  // --- Etapa 3: Experiência em apps ---
  ja_dirige_app: optionalString(),
  tempo_experiencia: optionalString(),
  apps_utilizados: z.array(z.enum(APPS_MOTORISTA)).default([]),
  km_semanal_km: optionalNumber(),

  // --- Etapa 4: Histórico de locações (novo, RodaScore) ---
  ja_alugou_veiculo_antes: optionalString(),
  locacao_anterior_sem_pendencias: optionalString(),
  locacao_anterior_motivo_saida: optionalString(),

  // --- Etapa 5: Capacidade financeira (novo, RodaScore) ---
  renda_mensal_declarada: optionalNumber(),
  possui_outra_fonte_renda: optionalString(),
  possui_conta_bancaria: optionalString(),

  // --- Etapa 6: Perfil operacional ---
  possui_veiculo_proprio: optionalString(),
  disponibilidade_horas: optionalString(),
  quando_pretende_comecar: optionalString(),
  melhor_horario_contato: optionalString(),
  veiculoInteresse: optionalString(),
  observacoes: optionalString(),

  // --- Etapa 7: Referências e contato de emergência ---
  referencia_nome: optionalString(),
  referencia_telefone: optionalString(),
  contato_emergencia_nome: optionalString(),
  contato_emergencia_telefone: optionalString(),

  // --- Etapa 8: Documentos e consentimento ---
  aceitou_politica_privacidade: z.boolean().refine((v) => v === true, 'É necessário aceitar a Política de Privacidade'),

  // Etapa 9 (Revisão) não tem campo próprio — só relê os valores acima.
});

export type LeadPublicoFormInput = z.input<typeof leadPublicoSchema>;
export type LeadPublicoFormValues = z.output<typeof leadPublicoSchema>;

// Agrupamento dos campos por etapa do wizard — usado por CadastroLeadPage.tsx pra validar só a
// etapa atual (trigger()) antes de liberar "Avançar", sem forçar o candidato a ver erro de
// etapa 8 enquanto ainda preenche a etapa 2.
export const WIZARD_ETAPAS = [
  {
    numero: 1,
    titulo: 'Dados pessoais',
    campos: ['nome_completo', 'cpf', 'rg', 'data_nascimento', 'estado_civil', 'email', 'telefone', 'cep', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'estado'],
  },
  { numero: 2, titulo: 'CNH', campos: ['cnh_numero', 'cnh_categoria', 'cnh_validade', 'cnh_ear'] },
  { numero: 3, titulo: 'Experiência em apps', campos: ['ja_dirige_app', 'tempo_experiencia', 'apps_utilizados', 'km_semanal_km'] },
  { numero: 4, titulo: 'Histórico de locações', campos: ['ja_alugou_veiculo_antes', 'locacao_anterior_sem_pendencias', 'locacao_anterior_motivo_saida'] },
  { numero: 5, titulo: 'Capacidade financeira', campos: ['renda_mensal_declarada', 'possui_outra_fonte_renda', 'possui_conta_bancaria'] },
  {
    numero: 6,
    titulo: 'Perfil operacional',
    campos: ['possui_veiculo_proprio', 'disponibilidade_horas', 'quando_pretende_comecar', 'melhor_horario_contato', 'veiculoInteresse', 'observacoes'],
  },
  { numero: 7, titulo: 'Referências', campos: ['referencia_nome', 'referencia_telefone', 'contato_emergencia_nome', 'contato_emergencia_telefone'] },
  { numero: 8, titulo: 'Documentos e consentimento', campos: ['aceitou_politica_privacidade'] },
  { numero: 9, titulo: 'Revisão', campos: [] },
] as const satisfies ReadonlyArray<{ numero: number; titulo: string; campos: (keyof LeadPublicoFormInput)[] }>;

// Documentos exigidos no upload — mesmas categorias já usadas em
// motorista-app/pages/MeusDocumentosPage.tsx (CATEGORIAS), pra ficar idêntico ao que o staff
// já vê quando revisa documento de motorista ativo.
export const DOCUMENTOS_OBRIGATORIOS = [
  { categoria: 'CNH', label: 'CNH (frente e verso, uma foto ou PDF)' },
  { categoria: 'Comprovante de residência', label: 'Comprovante de residência (até 3 meses)' },
] as const;

export const MAX_DOC_BYTES = 8 * 1024 * 1024; // 8 MB — mesmo limite de motorista-app/api/uploads.ts
export const MIME_DOC_OK = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
