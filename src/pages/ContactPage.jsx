import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Send, MessageSquare, Mail, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';

const ContactPage = () => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });

  const handleInputChange = (e) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Since there's no backend to send email, we'll just show a toast.
    toast({
      title: '🚧 Funcionalidade em construção!',
      description: 'O envio de e-mail ainda não foi implementado. Por favor, use o botão do WhatsApp para entrar em contato. 🚀',
    });
  };

  const handleWhatsAppClick = () => {
    const phoneNumber = '5587999999999'; // Substitua pelo número de telefone real
    const message = encodeURIComponent('Olá! Gostaria de entrar em contato através do site Trombone Cidadão.');
    window.open(`https://wa.me/${phoneNumber}?text=${message}`, '_blank');
  };

  return (
    <>
      <Helmet>
        <title>Contato - Trombone Cidadão</title>
        <meta name="description" content="Entre em contato com a equipe do Trombone Cidadão." />
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="container mx-auto px-4 py-12"
      >
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-extrabold gradient-text mb-4">
            Fale Conosco
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            Tem alguma dúvida, sugestão ou precisa de ajuda? Preencha o formulário abaixo ou fale conosco diretamente pelo WhatsApp.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="w-6 h-6 text-primary" />
                  Envie uma Mensagem
                </CardTitle>
                <CardDescription>
                  Responderemos o mais breve possível.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Seu Nome</Label>
                      <Input id="name" placeholder="João da Silva" value={formData.name} onChange={handleInputChange} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Seu E-mail</Label>
                      <Input id="email" type="email" placeholder="joao@example.com" value={formData.email} onChange={handleInputChange} required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subject">Assunto</Label>
                    <Input id="subject" placeholder="Sugestão para o app" value={formData.subject} onChange={handleInputChange} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="message">Sua Mensagem</Label>
                    <Textarea id="message" placeholder="Digite sua mensagem aqui..." value={formData.message} onChange={handleInputChange} required rows={5} />
                  </div>
                  <Button type="submit" className="w-full gap-2">
                    <Send className="w-4 h-4" />
                    Enviar Mensagem
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="space-y-8"
          >
            <Card className="bg-green-500/10 border-green-500/30 text-center">
              <CardHeader>
                <CardTitle className="flex items-center justify-center gap-3 text-green-600">
                  <MessageSquare className="w-8 h-8" />
                  Contato Rápido via WhatsApp
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-6">
                  Prefere uma resposta mais rápida? Clique no botão abaixo para iniciar uma conversa conosco no WhatsApp.
                </p>
                <Button
                  onClick={handleWhatsAppClick}
                  className="w-full bg-green-500 hover:bg-green-600 text-white gap-2 text-lg py-6"
                >
                  <Phone className="w-5 h-5" />
                  Falar no WhatsApp
                </Button>
              </CardContent>
            </Card>
            
            <Card>
                <CardHeader>
                    <CardTitle>
                        Outros canais
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">
                        E-mail: <a href="mailto:contato@trombonecidadao.com.br" className="text-primary hover:underline">contato@trombonecidadao.com.br</a>
                    </p>
                    <p className="text-muted-foreground mt-2">
                        Telefone: <span className="text-primary">(87) 99999-9999</span>
                    </p>
                </CardContent>
            </Card>

          </motion.div>
        </div>
      </motion.div>
    </>
  );
};

export default ContactPage;