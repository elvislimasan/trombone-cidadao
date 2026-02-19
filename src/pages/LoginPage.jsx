import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { LogIn, Eye, EyeOff, ShieldCheck, Megaphone, MapPin, Heart, Sparkles, Newspaper } from 'lucide-react';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({ email: '', password: '', general: '' });
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { signIn, user } = useAuth();
  const bgHero = '/Login-Trombone-Cidadão-02-17-2026_01_24_PM.png';

  useEffect(() => {
    if (user) {
      navigate('/painel-usuario', { replace: true });
    }
  }, [user, navigate]);

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
        toast({
          title: `Bem-vindo(a) de volta!`,
          description: "Login realizado com sucesso. 🎉",
        });
          // Redirecionar para a página anterior se houver, ou para a home
          const from = location.state?.from?.pathname || '/';
          navigate(from, { replace: true });
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
      toast({
        title: `Bem-vindo(a) de volta!`,
        description: "Login realizado com sucesso. 🎉",
      });
        navigate('/');
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
      <div
        className="relative md:max-h-[90vh] max-h-[calc(100vh-8rem)] overflow-hidden"
        style={{
          background:
            'radial-gradient(circle at top left, rgba(248,113,113,0.08), transparent 55%), #F9FAFB',
        }}
      >
        <div className="absolute inset-0 overflow-hidden">
          <img 
            src="/image.png" 
            alt="Mapa da cidade com marcações" 
            className="absolute inset-0 w-full h-full object-cover object-center opacity-[0.06] md:opacity-10 grayscale"
            loading="eager"
            aria-hidden="true"
          />
          <div 
            className="absolute -top-16 -right-12 w-40 h-40 md:w-64 md:h-64 rounded-full blur-2xl pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(239,68,68,0.14), rgba(239,68,68,0.0) 60%)' }}
          />
          <div 
            className="absolute bottom-10 -left-10 w-36 h-36 md:w-56 md:h-56 rounded-full blur-2xl pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.10), rgba(37,99,235,0.0) 60%)' }}
          />
          <div className="absolute inset-0 bg-gradient-to-br from-white/92 via-white/75 to-white/40" />
          <div className="absolute inset-0 pointer-events-none select-none opacity-[0.02] md:opacity-[0.04] overflow-hidden">
            <Megaphone className="absolute -top-6 right-16 w-44 h-44 rotate-6 text-[#EF4444]" />
            <Sparkles className="absolute top-1/3 left-6 w-24 h-24 -rotate-12 text-[#2563EB]" />
            <Newspaper className="absolute -bottom-12 left-1/3 w-48 h-48 rotate-3 text-[#F97316]" />
          </div>
        </div>
        <div className="relative mx-auto max-w-[1200px] px-3 sm:px-6 lg:px-8 py-6 sm:py-10 min-h-[calc(100vh-4rem)] flex items-center">
          <div className="grid grid-cols-1 w-full place-items-center">
            {/* <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="hidden lg:flex lg:col-span-4 flex-col justify-start rounded-3xl border border-[#F3F4F6] bg-white/80 backdrop-blur-sm overflow-hidden"
            >
              <div className="relative p-6 md:p-7">
                <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF] uppercase flex items-center gap-2">
                  <span className="inline-block w-1 h-3 rounded-full bg-tc-red" />
                  Plataforma
                </p>
                <h2 className="mt-2 text-xl font-bold text-[#111827]">
                  Acompanhe sua cidade
                </h2>
                <p className="mt-1 text-sm text-[#6B7280]">
                  Mapa em tempo real, petições da comunidade e apoios que geram impacto.
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-3 text-center">
                    <Megaphone className="w-5 h-5 mx-auto text-[#F97316]" />
                    <p className="mt-1 text-[11px] text-[#374151]">Petições</p>
                  </div>
                  <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-3 text-center">
                    <MapPin className="w-5 h-5 mx-auto text-[#2563EB]" />
                    <p className="mt-1 text-[11px] text-[#374151]">Mapa</p>
                  </div>
                  <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-3 text-center">
                    <Heart className="w-5 h-5 mx-auto text-[#EF4444]" />
                    <p className="mt-1 text-[11px] text-[#374151]">Apoios</p>
                  </div>
                </div>
              </div>
            </motion.div> */}

            <div className="w-full max-w-[36rem] lg:max-w-[40rem] mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="glass-effect rounded-3xl p-5 sm:p-6 lg:p-7 space-y-4 sm:space-y-5 border border-[#E5E7EB] bg-white/90 shadow-sm"
              >
                <div className="space-y-1 sm:space-y-2">
                  <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF] uppercase flex items-center gap-2">
                    <span className="inline-block w-1 h-3 rounded-full bg-tc-red" />
                    Acesso
                  </p>
                  <h2 className="text-2xl sm:text-3xl lg:text-2xl font-bold tracking-tight text-[#111827]">
                    Bem-vindo(a) de volta
                  </h2>
                  <p className="text-sm sm:text-base lg:text-sm xl:text-base text-[#4B5563]">
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
                      className={`${errors.email ? 'border-destructive' : ''} text-[#111827] placeholder:text-[#6B7280] focus-visible:ring-[#ef4444]`}
                    />
                    {errors.email && (
                      <p className="text-sm text-destructive">{errors.email}</p>
                    )}
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Senha</Label>
                      <Link to="/recuperar-senha" className="text-sm text-tc-red hover:underline">
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
                        className={`${errors.password ? 'border-destructive' : ''} pr-10 text-[#111827] placeholder:text-[#6B7280] focus-visible:ring-[#ef4444]`}
                        style={{ paddingRight: '2.5rem' }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 hover:bg-transparent text-muted-foreground hover:text-foreground"
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
                      className="w-full h-10 bg-[#EF4444] hover:bg-[#ef4444]/90 text-white gap-2 shadow-sm hover:shadow-md rounded-full transition-all hover:-translate-y-0.5 active:translate-y-0"
                      disabled={isLoading}
                    >
                      <LogIn className="w-4 h-4" />
                      {isLoading ? 'Entrando...' : 'Entrar'}
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      Não tem uma conta?{' '}
                      <Link to="/cadastro" className="font-semibold text-tc-red hover:underline">
                        Cadastre-se
                      </Link>
                    </p>
                    <div className="flex items-start gap-2 rounded-xl border border-[#E5E7EB] bg-white/80 px-2.5 py-2 sm:px-3 sm:py-2.5">
                      <div className="mt-0.5 rounded-full bg-[#ECFDF3] p-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-[#16A34A]" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[#111827]">Plataforma segura</p>
                        <p className="text-[11px] text-[#6B7280]">
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
