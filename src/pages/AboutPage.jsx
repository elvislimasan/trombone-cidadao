import React from 'react';
import { motion } from 'framer-motion';
import { Users, Target, Lightbulb, MapPin, Youtube, Instagram, Phone } from 'lucide-react';
import { Helmet } from 'react-helmet';

const AboutPage = () => {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: 'spring',
        stiffness: 100,
      },
    },
  };

  return (
    <motion.div
      className="container mx-auto px-4 py-12"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <Helmet>
        <title>Sobre o Trombone Cidadão</title>
        <meta name="description" content="Saiba mais sobre o projeto Trombone Cidadão, nossa missão, visão e como você pode colaborar para uma cidade melhor." />
      </Helmet>

      <motion.div className="text-center mb-12" variants={itemVariants}>
        <h1 className="text-4xl md:text-5xl font-extrabold gradient-text mb-4">
          Sobre o Trombone Cidadão
        </h1>
        <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
          Uma plataforma colaborativa para transformar a gestão de serviços públicos em Floresta-PE, conectando cidadãos e a prefeitura de forma transparente e eficiente.
        </p>
      </motion.div>

      <div className="grid md:grid-cols-2 gap-10 items-center mb-16">
        <motion.div variants={itemVariants}>
          {/* Replaced img-replace with static image URL for consistent display */}
          <img
            src="https://horizons-cdn.hostinger.com/eff1a4c5-4884-43cf-92e9-e90f584b8f04/1274cc605ab732520a8934d0187a7a17.png"
            alt="Trombone Cidadão Logo"
            className="w-64 h-64 mx-auto object-contain"
          />
        </motion.div>
        <motion.div className="space-y-6" variants={itemVariants}>
          <h2 className="text-3xl font-bold text-foreground">Nossa Missão</h2>
          <p className="text-muted-foreground">
            Empoderar os cidadãos de Floresta, dando-lhes uma voz ativa na identificação e solução de problemas urbanos. Acreditamos que a colaboração é a chave para uma cidade melhor, mais justa e bem cuidada para todos.
          </p>
          <p className="text-muted-foreground">
            O Trombone Cidadão serve como uma ponte digital, agilizando a comunicação de demandas como buracos nas ruas, problemas de iluminação e esgoto, e permitindo que a gestão municipal responda de forma mais ágil e organizada.
          </p>
        </motion.div>
      </div>

      <motion.div variants={containerVariants}>
        <h2 className="text-3xl font-bold text-center mb-10 text-foreground">Como Funciona?</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <motion.div className="bg-card p-6 rounded-lg border border-border text-center" variants={itemVariants}>
            <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
              <MapPin className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-foreground">1. Registre a Bronca</h3>
            <p className="text-muted-foreground">Viu um problema? Abra o app, tire uma foto, descreva a situação e marque a localização no mapa. Simples e rápido.</p>
          </motion.div>
          <motion.div className="bg-card p-6 rounded-lg border border-border text-center" variants={itemVariants}>
            <div className="w-16 h-16 bg-secondary/10 text-secondary rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-foreground">2. Acompanhe e Apoie</h3>
            <p className="text-muted-foreground">Acompanhe o status da sua solicitação e de outras em tempo real. Apoie as broncas mais urgentes para dar-lhes prioridade.</p>
          </motion.div>
          <motion.div className="bg-card p-6 rounded-lg border border-border text-center" variants={itemVariants}>
            <div className="w-16 h-16 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lightbulb className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-foreground">3. Avalie a Solução</h3>
            <p className="text-muted-foreground">O problema foi resolvido? Marque como solucionado e avalie o serviço. Seu feedback ajuda a melhorar a gestão pública.</p>
          </motion.div>
        </div>
      </motion.div>

      <motion.div className="text-center mt-16 mb-12" variants={itemVariants}>
        <h2 className="text-3xl font-bold text-foreground mb-6">Veja Nossa Apresentação!</h2>
        <div className="relative w-full max-w-[281px] h-[500px] sm:max-w-md sm:h-[600px] md:max-w-lg md:h-[700px] mx-auto rounded-lg overflow-hidden shadow-lg border-2 border-primary">
          <iframe
            className="absolute top-0 left-0 w-full h-full"
            src="https://www.youtube.com/embed/YunBHDp36po?modestbranding=1&rel=0"
            title="Trombone Cidadão - Vídeo de Apresentação"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          ></iframe>
        </div>
      </motion.div>

      <motion.div className="text-center mt-16" variants={itemVariants}>
        <h2 className="text-3xl font-bold text-foreground mb-6">Entre em Contato!</h2>
        <div className="flex justify-center items-center gap-6 flex-wrap">
          <a
            href="https://wa.me/5587999488360"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-lg text-primary hover:underline hover:text-primary-foreground transition-colors p-3 rounded-lg bg-card border border-border shadow-md"
          >
            <Phone className="w-6 h-6" /> WhatsApp: (87) 99948.8360
          </a>
          <a
            href="https://instagram.com/trombonecidadao"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-lg text-primary hover:underline hover:text-primary-foreground transition-colors p-3 rounded-lg bg-card border border-border shadow-md"
          >
            <Instagram className="w-6 h-6" /> Instagram: @trombonecidadao
          </a>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default AboutPage;