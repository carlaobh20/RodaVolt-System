import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, ArrowLeft, ShieldCheck } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { cn } from '@/shared/lib/utils';
import { supabase } from '@/shared/lib/supabase';
import { useAuth } from '@/app/providers/AuthProvider';
import rodavoltLogo from '../assets/rodavolt-logo.svg';
import rodavoltLogoPreto from '../assets/rodavolt-logo-preto.svg';
import motoristaPhoto from '../assets/motorista-login.jpg';

// Redesign visual da tela de login (pedido do Carlos, com mockup de referência),
// mantendo 100% da lógica de autenticação original abaixo intacta: handleSubmit,
// signInWithPassword, mensagem de erro, redirecionamento pós-login (useAuth +
// <Navigate>) e o link de recuperação de senha. O único estado novo é
// `showPassword`, puramente visual (mostrar/ocultar senha), sem nenhum efeito
// sobre Supabase/sessão.
//
// Esta tela é compartilhada por motorista E staff (rota única /login — ver
// ProtectedRoute.tsx), por isso o texto evita "Portal do Motorista" ou algo
// que só faça sentido pra um dos dois perfis; segue exatamente a copy que o
// Carlos pediu.
//
// Logo: o arquivo oficial (rodavolt-logo.svg) só existe em ícone azul #2389FF +
// wordmark branco, pensado pra fundo escuro — é o que fica direto sobre a foto.
// A pedido do Carlos, o painel branco do formulário usa uma segunda versão
// (rodavolt-logo-preto.svg) idêntica em traço/proporção/tipografia, só com o
// preenchimento do wordmark trocado de branco pra preto (o ícone continua o
// mesmo azul da marca) — pensada especificamente pra fundo claro, sem chip
// escuro por trás.
//
// Selo "Acesso administrativo" (pedido do Carlos): quando essa mesma tela é
// aberta via /admin (ver router.tsx — é só um alias de rota, não uma tela
// nova), mostramos um selinho acima do título deixando claro que aquele
// endereço é pra quem administra a empresa. Puramente visual — detectado
// pelo pathname da URL, sem nenhuma mudança na autenticação/Supabase.
export function LoginPage() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const isAdminRoute = location.pathname === '/admin';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (!loading && session) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (signInError) {
      setError('E-mail ou senha inválidos.');
    }
  }

  // Força aparência clara mesmo com o navegador/SO em modo escuro: o Input
  // compartilhado tem um variant dark: (fundo quase preto) que ficava ativando
  // sozinho e deixando os campos ilegíveis — aqui a tela é sempre clara.
  const inputClassName =
    'h-11 border-neutral-300 bg-white text-[15px] text-neutral-900 placeholder:text-neutral-400 dark:border-neutral-300 dark:bg-white dark:text-neutral-900 dark:placeholder:text-neutral-400 focus-visible:ring-[#2389FF] focus-visible:ring-offset-0';

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Coluna da foto — banner compacto no mobile, painel de ~55% no desktop */}
      <div className="relative h-44 w-full overflow-hidden bg-[#05070B] sm:h-56 lg:h-auto lg:w-[55%]">
        <img
          src={motoristaPhoto}
          alt="Motorista sorridente mostrando o app RodaVolt no celular, dentro do carro"
          className="absolute inset-0 h-full w-full object-cover object-[30%_38%]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#05070B]/85 via-[#05070B]/10 to-[#05070B]/40 lg:bg-gradient-to-t lg:from-[#05070B]/90 lg:via-[#05070B]/5 lg:to-[#05070B]/50" />

        <div className="relative flex h-full flex-col justify-between p-5 sm:p-7 lg:p-12">
          <img src={rodavoltLogo} alt="Rodavolt" className="h-6 w-auto sm:h-7 lg:h-8" />

          <div className="hidden max-w-md lg:block">
            <h2 className="text-3xl font-black leading-tight text-white xl:text-4xl">
              Sua próxima jornada
              <br />
              começa aqui.
            </h2>
            <p className="mt-3 text-sm text-zinc-300">Seu carro, sua rotina e seu Copiloto em um só lugar.</p>
          </div>
        </div>
      </div>

      {/* Coluna do formulário */}
      <div className="flex flex-1 items-center justify-center bg-white px-6 py-10 sm:px-10">
        <div className="w-full max-w-[400px]">
          <img src={rodavoltLogoPreto} alt="Rodavolt" className="mb-8 h-10 w-auto sm:h-11" />

          {isAdminRoute && (
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#2389FF]/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#2389FF]">
              <ShieldCheck className="h-3.5 w-3.5" />
              Acesso administrativo
            </div>
          )}

          <h1 className="text-2xl font-bold text-neutral-900 sm:text-[28px]">Bom ter você de volta.</h1>
          <p className="mt-2 text-sm text-neutral-500">
            {isAdminRoute
              ? 'Área restrita à administração da RodaVolt.'
              : 'Acesse sua conta e acompanhe sua rotina.'}
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                placeholder="Seu e-mail"
                className={inputClassName}
              />
            </div>

            <div>
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Sua senha"
                  className={cn(inputClassName, 'pr-10')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-neutral-400 hover:text-neutral-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Link to="/recuperar-senha" className="mt-2 inline-block text-sm text-[#2389FF] hover:underline">
                Esqueci minha senha
              </Link>
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={submitting}
              className="h-11 w-full bg-[#2389FF] text-[15px] font-semibold text-white hover:bg-[#1B6FDB] focus-visible:ring-[#2389FF] focus-visible:ring-offset-0"
            >
              {submitting ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>

          <Link
            to="/"
            className="mt-8 inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar ao site
          </Link>
        </div>
      </div>
    </div>
  );
}
