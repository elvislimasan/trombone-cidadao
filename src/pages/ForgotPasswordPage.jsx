import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Mail } from 'lucide-react';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    toast({
      title: "Instruções enviadas!",
      description: `Se houver uma conta associada a ${email}, você receberá um e-mail com as instruções para redefinir sua senha.`,
    });
    navigate('/login');
  };

  return (
    <>
      <Helmet>
        <title>Recuperar Senha - Trombone Cidadão</title>
        <meta name="description" content="Recupere o acesso à sua conta na plataforma Trombone Cidadão." />
      </Helmet>
      <div className="container mx-auto flex items-center justify-center min-h-[calc(100vh-4rem)] px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="w-full max-w-md shadow-2xl bg-card border-border">
            <CardHeader className="text-center">
              <CardTitle className="text-3xl font-bold text-tc-red">Recuperar Senha</CardTitle>
              <CardDescription>Insira seu e-mail para receber o link de redefinição.</CardDescription>
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
              </CardContent>
              <CardFooter className="flex flex-col gap-4">
                <Button type="submit" className="w-full bg-tc-red hover:bg-tc-red/90 text-white gap-2">
                  <Mail className="w-4 h-4" /> Enviar Link
                </Button>
                <p className="text-sm text-muted-foreground">
                  Lembrou a senha?{' '}
                  <Link to="/login" className="font-semibold text-tc-red hover:underline">
                    Faça login
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

export default ForgotPasswordPage;