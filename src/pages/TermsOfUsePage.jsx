import React from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { FileText, Shield, UserCheck, Gavel } from 'lucide-react';

const TermsOfUsePage = () => {
  const Section = ({ title, icon: Icon, children }) => (
    <motion.div
      className="mb-8"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.5 }}
    >
      <h2 className="text-2xl font-bold text-foreground mb-4 flex items-center">
        <Icon className="w-6 h-6 mr-3 text-primary" />
        {title}
      </h2>
      <div className="space-y-3 text-muted-foreground leading-relaxed">{children}</div>
    </motion.div>
  );

  return (
    <>
      <Helmet>
        <title>Termos de Uso - Trombone Cidadão</title>
        <meta name="description" content="Leia os termos e condições de uso da plataforma Trombone Cidadão, em conformidade com a LGPD." />
      </Helmet>
      <div className="bg-background">
        <div className="container mx-auto px-4 py-16">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-4xl md:text-5xl font-extrabold gradient-text mb-4">
              Termos de Uso e Política de Privacidade
            </h1>
            <p className="text-lg text-muted-foreground">Última atualização: 22 de setembro de 2025</p>
          </motion.div>

          <div className="max-w-4xl mx-auto">
            <Section title="1. Aceitação dos Termos" icon={FileText}>
              <p>
                Bem-vindo ao Trombone Cidadão ("Plataforma"). Ao se cadastrar e utilizar nossos serviços, você ("Usuário") concorda em cumprir e estar legalmente vinculado a estes Termos de Uso e nossa Política de Privacidade. Se você não concorda com estes termos, não deve acessar ou usar a Plataforma.
              </p>
            </Section>

            <Section title="2. Descrição do Serviço" icon={UserCheck}>
              <p>
                A Plataforma é um canal de comunicação que permite aos cidadãos ("Usuários Cidadãos") reportar problemas urbanos ("Broncas") e à gestão pública ("Usuários Agentes Públicos") receber, gerenciar e responder a essas demandas, promovendo a transparência e a participação cívica.
              </p>
            </Section>

            <Section title="3. Cadastro e Responsabilidades do Usuário" icon={UserCheck}>
              <p><strong>Para todos os Usuários:</strong> Você concorda em fornecer informações verdadeiras, precisas e completas durante o cadastro e em mantê-las atualizadas. A segurança da sua senha é de sua responsabilidade.</p>
              <p><strong>Usuários Cidadãos:</strong> Vocês são responsáveis pelo conteúdo que publicam, incluindo textos, fotos e vídeos. As publicações devem ser respeitosas, objetivas e não conter informações falsas, caluniosas, difamatórias ou que violem direitos de terceiros.</p>
              <p><strong>Usuários Agentes Públicos:</strong> Vocês representam uma entidade governamental e devem utilizar a plataforma de forma profissional, fornecendo informações claras e precisas sobre o andamento e a resolução das demandas.</p>
            </Section>

            <Section title="4. Política de Conteúdo e Moderação" icon={Gavel}>
              <p>Não é permitido publicar conteúdo que seja ilegal, odioso, ameaçador, pornográfico, que incite à violência ou que contenha nudez ou violência gratuita.</p>
              <p>Reservamo-nos o direito de moderar, editar ou remover qualquer conteúdo que viole estes termos, sem aviso prévio. Contas que violarem repetidamente nossas políticas poderão ser suspensas ou encerradas.</p>
            </Section>

            <Section title="5. Política de Privacidade e LGPD" icon={Shield}>
              <p>Nós levamos sua privacidade a sério. Esta seção detalha como coletamos, usamos e protegemos seus dados, em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018).</p>
              <h3 className="text-xl font-semibold text-foreground mt-4 mb-2">5.1. Dados Coletados</h3>
              <p>Coletamos dados que você nos fornece no cadastro (nome, e-mail, telefone, cidade, estado) e dados gerados pelo uso da plataforma (localização de reportes, fotos, textos, interações).</p>
              <h3 className="text-xl font-semibold text-foreground mt-4 mb-2">5.2. Finalidade do Tratamento de Dados</h3>
              <p>Seus dados são utilizados para: (a) operar e manter a Plataforma; (b) identificar você e suas contribuições; (c) permitir a comunicação entre cidadãos e o poder público; (d) gerar estatísticas anônimas para análise de gestão urbana; (e) enviar comunicações importantes sobre sua conta ou reportes.</p>
              <h3 className="text-xl font-semibold text-foreground mt-4 mb-2">5.3. Compartilhamento de Dados</h3>
              <p>Seu nome de usuário e o conteúdo de suas publicações (fotos, descrições, localização) são públicos. Informações de contato como e-mail e telefone não são compartilhados publicamente. Os dados podem ser acessados por Usuários Agentes Públicos para a gestão das demandas. Não vendemos seus dados a terceiros.</p>
              <h3 className="text-xl font-semibold text-foreground mt-4 mb-2">5.4. Seus Direitos como Titular dos Dados</h3>
              <p>De acordo com a LGPD, você tem o direito de: (a) confirmar a existência de tratamento; (b) acessar seus dados; (c) corrigir dados incompletos, inexatos ou desatualizados; (d) solicitar a anonimização, bloqueio ou eliminação de dados desnecessários; (e) solicitar a portabilidade dos dados; (f) eliminar dados tratados com seu consentimento; (g) obter informação sobre o compartilhamento de seus dados. Para exercer seus direitos, entre em contato conosco através do seu painel de usuário ou canais de suporte.</p>
              <p className="mt-3"><strong>Exclusão de Conta:</strong> Você pode solicitar a exclusão da sua conta a qualquer momento através da <a href="/excluir-conta" className="text-primary hover:underline font-semibold">página de exclusão de conta</a> ou entrando em contato conosco.</p>
              <h3 className="text-xl font-semibold text-foreground mt-4 mb-2">5.5. Segurança dos Dados</h3>
              <p>Implementamos medidas técnicas e organizacionais para proteger seus dados contra acesso não autorizado, alteração, divulgação ou destruição.</p>
            </Section>

            <Section title="6. Propriedade Intelectual" icon={Gavel}>
              <p>Ao publicar conteúdo na Plataforma, você nos concede uma licença mundial, não exclusiva, isenta de royalties, para usar, reproduzir, distribuir e exibir esse conteúdo em conexão com os serviços da Plataforma. Você retém todos os outros direitos sobre seu conteúdo.</p>
            </Section>

            <Section title="7. Limitação de Responsabilidade" icon={Gavel}>
              <p>A Plataforma é fornecida "como está". Não garantimos que o serviço será ininterrupto ou livre de erros. Não nos responsabilizamos pelo conteúdo gerado pelos usuários nem pela execução ou qualidade dos serviços realizados pela gestão pública.</p>
            </Section>

            <Section title="8. Alterações nos Termos" icon={FileText}>
              <p>Podemos modificar estes Termos a qualquer momento. Notificaremos você sobre alterações significativas. O uso continuado da Plataforma após as alterações constitui sua aceitação dos novos termos.</p>
            </Section>
          </div>
        </div>
      </div>
    </>
  );
};

export default TermsOfUsePage;