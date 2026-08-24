import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { LogIn, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

const isIOS = Capacitor.getPlatform() === 'ios' || !Capacitor.isNativePlatform();

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({ email: '', password: '', general: '' });
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, signInWithGoogle, signInWithApple, refreshUserProfile, user } = useAuth();

  // Reseta loading quando o browser OAuth fecha sem completar o login
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let listener;
    Browser.addListener('browserFinished', () => {
      setIsLoading(false);
    }).then(l => { listener = l; });
    return () => { listener?.remove(); };
  }, []);

  useEffect(() => {
    if (user) {
      let target = null;
      try {
        target = sessionStorage.getItem('tc_post_login_redirect');
        if (target) sessionStorage.removeItem('tc_post_login_redirect');
      } catch {}
      const from = location.state?.from;
      if (!target && from?.pathname) {
        target = `${from.pathname}${from.search || ''}`;
      }
      navigate(target || '/painel-usuario', { replace: true });
    }
  }, [user, navigate, location.state]);

  const handleAppleLogin = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await signInWithApple();
      if (error) throw error;
      // signInWithIdToken pode não disparar onAuthStateChange no Capacitor,
      // então força atualização do perfil e redireciona explicitamente
      await refreshUserProfile();
      let target = null;
      try {
        target = sessionStorage.getItem('tc_post_login_redirect');
        if (target) sessionStorage.removeItem('tc_post_login_redirect');
      } catch {}
      const from = location.state?.from;
      if (!target && from?.pathname) target = `${from.pathname}${from.search || ''}`;
      navigate(target || '/painel-usuario', { replace: true });
    } catch (error) {
      // Código 1001 = usuário cancelou o painel da Apple — ignorar silenciosamente
      const cancelled =
        error?.code === 1001 ||
        error?.message?.includes('1001') ||
        error?.message?.toLowerCase().includes('cancel') ||
        error?.message?.toLowerCase().includes('dismiss');

      if (!cancelled) {
        setErrors({
          email: '',
          password: '',
          general: error.message || 'Erro ao conectar com Apple.',
        });
      }
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) throw error;
    } catch (error) {
      setErrors({
        email: '',
        password: '',
        general: error.message || "Erro ao conectar com Google.",
      });
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Limpar erros anteriores
    setErrors({ email: '', password: '', general: '' });
    
    // Validação básica
    let hasErrors = false;
    const newErrors = { email: '', password: '', general: '' };
    
    if (!email.trim()) {
      newErrors.email = 'E-mail é obrigatório';
      hasErrors = true;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'E-mail inválido';
      hasErrors = true;
    }
    
    if (!password) {
      newErrors.password = 'Senha é obrigatória';
      hasErrors = true;
    }
    
    if (hasErrors) {
      setErrors(newErrors);
      return;
    }
    
    setIsLoading(true);
    
    try {
    const { error } = await signIn(email, password);
      
    if (error && error.message === "Email not confirmed") {
      // Try again silently for the user
      const { error: secondError } = await signIn(email, password);
      if (!secondError) {
          // Sem toast de boas-vindas: o login termina navegando para o feed,
          // e a tela que troca já diz que entrou. O toast chegava POR CIMA do
          // destino, anunciando o que a pessoa estava vendo.
          let target = null;
          try {
            target = sessionStorage.getItem('tc_post_login_redirect');
            if (target) sessionStorage.removeItem('tc_post_login_redirect');
          } catch {}
          const from = location.state?.from;
          if (!target && from?.pathname) target = `${from.pathname}${from.search || ''}`;
          navigate(target || '/', { replace: true });
      } else {
          setErrors({
            email: '',
            password: '',
            general: secondError.message || "Não foi possível fazer login. Verifique suas credenciais.",
        });
      }
    } else if (error) {
        // Verificar tipo de erro
        const errorMessage = error.message || "Não foi possível fazer login. Verifique suas credenciais.";
        
        // Erros relacionados a credenciais inválidas
        // Supabase retorna "Invalid login credentials" para credenciais inválidas
        const errorMsgLower = errorMessage.toLowerCase();
        const isCredentialError = 
          errorMsgLower.includes('invalid login credentials') ||
          errorMsgLower.includes('invalid credentials') ||
          errorMsgLower.includes('email') && errorMsgLower.includes('password') ||
          errorMsgLower.includes('credenciais inválidas') ||
          errorMsgLower.includes('wrong') && (errorMsgLower.includes('password') || errorMsgLower.includes('email'));
        
        if (isCredentialError) {
          // Erro de credenciais: mostrar abaixo do campo de senha
          setErrors({
            email: '',
            password: 'E-mail ou senha incorretos',
            general: '',
      });
        } else {
          // Outros erros (conexão, servidor, etc.): mostrar no campo geral
          setErrors({
            email: '',
            password: '',
            general: errorMessage,
          });
        }
    } else {
        // Ver acima: navegar já é o retorno visual do login.
        let target = null;
        try {
          target = sessionStorage.getItem('tc_post_login_redirect');
          if (target) sessionStorage.removeItem('tc_post_login_redirect');
        } catch {}
        const from = location.state?.from;
        if (!target && from?.pathname) target = `${from.pathname}${from.search || ''}`;
        navigate(target || '/', { replace: true });
      }
    } catch (error) {
      setErrors({
        email: '',
        password: '',
        general: error.message || "Ocorreu um erro inesperado. Tente novamente.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Login - Trombone Cidadão</title>
        <meta name="description" content="Acesse sua conta na plataforma Trombone Cidadão." />
      </Helmet>
      {/* Fundo liso. A camada decorativa antiga (mapa em marca d'agua, blobs
          desfocados e icones gigantes) saiu: eram tres camadas empilhadas para
          entregar textura que quase nao se via, e nada disso sobrevive ao tema
          escuro sem virar sujeira sobre o fundo. */}
      <div className="relative h-full overflow-hidden bg-surface-base">
        <div className="relative mx-auto max-w-[1200px] h-full px-3 sm:px-6 lg:px-8 py-6 sm:py-10 flex items-center">
          <div className="grid grid-cols-1 w-full place-items-center">
            <div className="w-full max-w-[36rem] lg:max-w-[40rem] mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="rounded-3xl p-5 sm:p-6 lg:p-7 space-y-4 sm:space-y-5 border border-edge-subtle bg-surface-raised shadow-elevation-2"
              >
                <div className="space-y-1 sm:space-y-2">
                  <p className="text-[11px] font-semibold tracking-[0.18em] text-content-tertiary uppercase flex items-center gap-2">
                    <span className="inline-block w-1 h-3 rounded-full bg-brand" />
                    Acesso
                  </p>
                  <h2 className="text-2xl sm:text-3xl lg:text-2xl font-bold tracking-tight text-content-primary font-display">
                    Bem-vindo(a) de volta
                  </h2>
                  <p className="text-sm sm:text-base lg:text-sm xl:text-base text-content-secondary">
                    Entre para continuar acompanhando sua cidade em tempo real.
                  </p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
                  {errors.general && (
                    <div className="p-2.5 sm:p-3 rounded-md bg-destructive/10 border border-destructive/20">
                      <p className="text-sm text-destructive">{errors.general}</p>
                    </div>
                  )}
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
                      required
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (errors.email) {
                          setErrors({ ...errors, email: '' });
                        }
                      }}
                      className={`${errors.email ? 'border-destructive' : ''} text-content-primary placeholder:text-content-tertiary focus-visible:ring-brand`}
                    />
                    {errors.email && (
                      <p className="text-sm text-destructive">{errors.email}</p>
                    )}
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Senha</Label>
                      <Link to="/recuperar-senha" className="text-sm text-brand hover:underline">
                        Esqueceu a senha?
                      </Link>
                    </div>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Digite sua senha"
                        required
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (errors.password) {
                            setErrors({ ...errors, password: '' });
                          }
                        }}
                        className={`${errors.password ? 'border-destructive' : ''} pr-10 text-content-primary placeholder:text-content-tertiary focus-visible:ring-brand`}
                        style={{ paddingRight: '2.5rem' }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 hover:bg-transparent text-content-tertiary hover:text-content-primary"
                        onClick={(e) => {
                          e.preventDefault();
                          setShowPassword(!showPassword);
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                        }}
                        aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                        tabIndex={-1}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {errors.password && (
                      <p className="text-sm text-destructive">{errors.password}</p>
                    )}
                  </div>
                  <div className="pt-1 space-y-3.5 sm:space-y-4">
                    <Button
                      type="submit"
                      className="w-full h-10 bg-cta-bg hover:bg-cta-bg/90 text-cta-fg gap-2 shadow-elevation-1 hover:shadow-elevation-2 rounded-full transition-all hover:-translate-y-0.5 active:translate-y-0"
                      disabled={isLoading}
                    >
                      <LogIn className="w-4 h-4" />
                      {isLoading ? 'Entrando...' : 'Entrar'}
                    </Button>

                    <div className="relative flex items-center gap-2 my-2">
                      <div className="h-px bg-edge-subtle flex-1" />
                      <span className="text-[10px] uppercase text-content-tertiary font-medium tracking-wider">ou</span>
                      <div className="h-px bg-edge-subtle flex-1" />
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-10 gap-2 rounded-full border-edge-default text-content-primary hover:bg-surface-subtleHover transition-colors"
                      onClick={handleGoogleLogin}
                      disabled={isLoading}
                    >
                      <svg className="h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
                        <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path>
                      </svg>
                      Google
                    </Button>

                    {isIOS && (
                      <Button
                        type="button"
                        /* Preto no claro, branco no escuro: e a regra de marca
                           da Apple para o botao de login, e preto sobre fundo
                           escuro sumiria. Por isso nao usa token de superficie. */
                        className="w-full h-10 gap-2 rounded-full bg-neutral-950 text-white hover:bg-neutral-800 dark:bg-surface-raised dark:text-neutral-950 dark:hover:bg-neutral-200 transition-colors"
                        onClick={handleAppleLogin}
                        disabled={isLoading}
                      >
                        <svg className="h-4 w-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 814 1000" fill="currentColor">
                          <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 405.8 15.6 285.4 15.6 267.3c0-5.8.6-11.6.6-17.4v-.6c0-55.4 20.7-119.4 62.9-168.8C121.8 36.5 185.9 8.4 247.8 8.4c65.9 0 120.3 41.4 160.8 41.4 38.7 0 98.8-43.6 173.1-43.6 27.9 0 108.2 2.6 166.6 77.9zm-85.5-170.5c-31.5 37.9-79.5 67.7-130.9 67.7-3.2 0-6.5-.3-9.7-.6-1.9-41.9 14.8-85.5 43.6-115.9C640.8 90.9 695.8 62.3 750 60.6c1.6 42.5-13 83.5-47.4 109.8z"/>
                        </svg>
                        Continuar com Apple
                      </Button>
                    )}

                    <p className="text-sm text-content-secondary">
                      Não tem uma conta?{' '}
                      <Link to="/cadastro" className="font-semibold text-brand hover:underline">
                        Cadastre-se
                      </Link>
                    </p>
                    <div className="flex items-start gap-2 rounded-xl border border-edge-subtle bg-surface-subtle px-2.5 py-2 sm:px-3 sm:py-2.5">
                      <div className="mt-0.5 rounded-full bg-success-bg p-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-success-fg" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-content-primary">Plataforma segura</p>
                        <p className="text-[11px] text-content-secondary">
                          Seus dados são protegidos com criptografia e seguem boas práticas de segurança.
                        </p>
                      </div>
                    </div>
                  </div>
                </form>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default LoginPage;
