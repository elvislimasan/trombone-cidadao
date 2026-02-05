import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { LogIn, Eye, EyeOff } from 'lucide-react';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({ email: '', password: '', general: '' });
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { signIn } = useAuth();

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
      <div className="flex items-center justify-center px-4 py-2 sm:min-h-[calc(100vh-4rem)] sm:py-12" style={{ minHeight: 0, height: '100%' }}>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full"
        >
          <Card className="w-full max-w-md mx-auto shadow-2xl bg-card border-border">
            <CardHeader className="text-center pb-4 sm:pb-6">
              <div className="mx-auto mb-2 sm:mb-4">
                <img src="/logo.png" alt="Trombone Cidadão Logo" className="w-16 h-16 sm:w-20 sm:h-20" />
              </div>
              <CardTitle className="text-2xl sm:text-3xl font-bold text-tc-red">Acessar Conta</CardTitle>
              <CardDescription className="text-sm sm:text-base">Use seu e-mail e senha para entrar.</CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4 sm:space-y-6 px-4 sm:px-6">
                {errors.general && (
                  <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
                    <p className="text-sm text-destructive">{errors.general}</p>
                  </div>
                )}
                <div className="space-y-2">
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
                    className={errors.email ? 'border-destructive' : ''}
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive">{errors.email}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Senha</Label>
                    <Link to="/recuperar-senha" className="text-sm text-tc-red hover:underline">
                      Esqueceu a senha?
                    </Link>
                  </div>
                  <div className="relative">
                  <Input
                    id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Digite sua senha"
                    required
                    value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errors.password) {
                          setErrors({ ...errors, password: '' });
                        }
                      }}
                      className={`${errors.password ? 'border-destructive' : ''} pr-10`}
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
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
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
              </CardContent>
              <CardFooter className="flex flex-col gap-3 sm:gap-4 px-4 sm:px-6 pb-4 sm:pb-6">
                <Button 
                  type="submit" 
                  className="w-full bg-tc-red hover:bg-tc-red/90 text-white gap-2"
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
              </CardFooter>
            </form>
          </Card>
        </motion.div>
      </div>
    </>
  );
};

export default LoginPage;