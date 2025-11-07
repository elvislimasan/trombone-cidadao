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
import { LogIn } from 'lucide-react';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { toast } = useToast();
  const navigate = useNavigate();
  const { signIn } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { error } = await signIn(email, password);
    if (error && error.message === "Email not confirmed") {
      toast({
        title: "E-mail não confirmado",
        description: "Seu cadastro foi feito, mas o login falhou. Por favor, tente novamente.",
        variant: "destructive",
      });
      // Try again silently for the user
      const { error: secondError } = await signIn(email, password);
      if (!secondError) {
        toast({
          title: `Bem-vindo(a) de volta!`,
          description: "Login realizado com sucesso. 🎉",
        });
        navigate('/'); // Redirect to HomePage
      } else {
        toast({
          title: "Erro no login",
          description: secondError.message || "Não foi possível fazer login. Verifique suas credenciais.",
          variant: "destructive",
        });
      }
    } else if (error) {
      toast({
        title: "Erro no login",
        description: error.message || "Não foi possível fazer login. Verifique suas credenciais.",
        variant: "destructive",
      });
    } else {
      toast({
        title: `Bem-vindo(a) de volta!`,
        description: "Login realizado com sucesso. 🎉",
      });
      navigate('/'); // Redirect to HomePage
    }
  };

  return (
    <>
      <Helmet>
        <title>Login - Trombone Cidadão</title>
        <meta name="description" content="Acesse sua conta na plataforma Trombone Cidadão." />
      </Helmet>
      <div className="container mx-auto flex items-center justify-center min-h-[calc(100vh-4rem)] px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="w-full max-w-md shadow-2xl bg-card border-border">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4">
                <img src="https://horizons-cdn.hostinger.com/eff1a4c5-4884-43cf-92e9-e90f584b8f04/1274cc605ab732520a8934d0187a7a17.png" alt="Trombone Cidadão Logo" className="w-20 h-20" />
              </div>
              <CardTitle className="text-3xl font-bold text-tc-red">Acessar Conta</CardTitle>
              <CardDescription>Use seu e-mail e senha para entrar.</CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Senha</Label>
                    <Link to="/recuperar-senha" className="text-sm text-tc-red hover:underline">
                      Esqueceu a senha?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-4">
                <Button type="submit" className="w-full bg-tc-red hover:bg-tc-red/90 text-white gap-2">
                  <LogIn className="w-4 h-4" /> Entrar
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