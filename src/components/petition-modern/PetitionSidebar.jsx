import React from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import { 
  FileSignature, Share2, ShieldCheck, Sparkles, 
  Users, Target, AlertTriangle, Heart 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import Counter from './Counter';
import PetitionDonationCard from './PetitionDonationCard';

/**
 * Sidebar component containing the signature form, progress bar, and donation call-to-action.
 * Handles both authenticated and guest user signature flows.
 *
 * @component
 * @param {Object} props - Component props
 * @param {Object} props.petition - The petition object containing goals, counts, etc.
 * @param {Object} [props.user] - The current logged-in user (null if guest)
 * @param {boolean} props.hasSigned - Whether the current user (or guest session) has already signed
 * @param {boolean} props.signing - Loading state for the signature action
 * @param {Object} props.guestForm - State object for guest form fields (name, email, etc.)
 * @param {Function} props.setGuestForm - State setter for guest form
 * @param {Object} props.signForm - State object for authenticated user form fields
 * @param {Function} props.setSignForm - State setter for authenticated user form
 * @param {Function} props.onSign - Handler for authenticated signature submission
 * @param {Function} props.onGuestSign - Handler for guest signature submission (opens modal or submits)
 * @param {Function} props.onShare - Handler for share button click
 * @param {Function} props.onDonate - Handler for donation action
 * @param {boolean} [props.donationEnabled=true] - Feature flag to enable/disable donations
 * @param {Array} [props.recentDonations] - List of recent donations to display
 * @returns {JSX.Element} The rendered sidebar component
 */
const PetitionSidebar = ({
  petition,
  user,
  hasSigned,
  signing,
  guestForm,
  setGuestForm,
  signForm,
  setSignForm,
  onSign,
  onGuestSign,
  onShare,
  onDonate,
  donationEnabled,
  recentDonations,
  totalDonations = 0
}) => {
  const progress = Math.min((petition.signatureCount / petition.goal) * 100, 100);
  const progressColor = progress >= 80 ? "bg-red-500" : progress >= 50 ? "bg-yellow-500" : "bg-primary";
  const isExpired = petition.deadline && new Date(petition.deadline) < new Date();

  return (
    <div className="space-y-8" data-testid="petition-sidebar">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="shadow-xl border-primary/20 ring-1 ring-black/5 overflow-hidden relative">
          {/* Decorative background element */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full -z-0 pointer-events-none" />
          
          <CardContent className="pt-6 space-y-6 relative z-10">
            <div>
              <div className="flex items-end gap-2 mb-2">
                <span className="text-5xl font-bold text-primary tracking-tight">
                  <Counter value={petition.signatureCount} />
                </span>
              </div>
              <p className="text-muted-foreground font-medium mb-4">
                pessoas já assinaram. Ajude a chegar em <span className="text-foreground font-bold">{petition.goal.toLocaleString('pt-BR')}</span>!
              </p>
              
              <div className="relative">
                <Progress value={progress} className="h-3 mb-2 bg-primary/20" indicatorClassName={progressColor} />
                {/* Shimmer effect on progress bar */}
                <motion.div 
                  className="absolute top-0 left-0 bottom-0 w-full h-full bg-gradient-to-r from-transparent via-white/30 to-transparent z-20 pointer-events-none"
                  initial={{ x: '-100%' }}
                  animate={{ x: '100%' }}
                  transition={{ repeat: Infinity, duration: 2, ease: "linear", repeatDelay: 1 }}
                  style={{ width: `${progress}%` }}
                />
              </div>
              
              <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                <span>{Math.round(progress)}% da meta</span>
                <span>{petition.goal.toLocaleString('pt-BR')} assinaturas</span>
              </div>
            </div>

            <div className="space-y-4">
              {!hasSigned ? (
                <div className="space-y-4 bg-card rounded-xl">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        <FileSignature className="w-5 h-5 text-primary" />
                        Assine este abaixo-assinado
                    </h3>
                    
                    {user ? (
                         <div className="bg-muted/30 p-4 rounded-lg border border-border/50 space-y-3">
                            <div className="flex items-center gap-3">
                                 <Avatar className="w-10 h-10 border border-border">
                                    <AvatarFallback>{user.user_metadata?.name ? user.user_metadata.name.substring(0, 2).toUpperCase() : 'EU'}</AvatarFallback>
                                 </Avatar>
                                 <div className="overflow-hidden">
                                    <p className="font-semibold text-sm truncate">Logado como {user.user_metadata?.name || 'Usuário'}</p>
                                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                                 </div>
                            </div>
                            
                           
                         </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <Label htmlFor="sidebar-name" className="text-xs font-semibold">Nome Completo</Label>
                                <Input 
                                    id="sidebar-name" 
                                    placeholder="Seu nome completo" 
                                    value={guestForm.name}
                                    onChange={(e) => setGuestForm(prev => ({ ...prev, name: e.target.value }))}
                                    className="h-10 bg-background"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="sidebar-email" className="text-xs font-semibold">Email</Label>
                                <Input 
                                    id="sidebar-email" 
                                    type="email"
                                    placeholder="seu@email.com" 
                                    value={guestForm.email}
                                    onChange={(e) => setGuestForm(prev => ({ ...prev, email: e.target.value }))}
                                    className="h-10 bg-background"
                                />
                            </div>
                             <div className="space-y-1">
                                <Label htmlFor="sidebar-guest-city" className="text-xs font-semibold">Cidade</Label>
                                 <Input 
                                    id="sidebar-guest-city" 
                                    value={guestForm.city}
                                    onChange={(e) => setGuestForm(prev => ({ ...prev, city: e.target.value }))}
                                    className="h-10 bg-background"
                                />
                            </div>
                        </div>
                    )}

                    <div className="space-y-3 pt-1">
                         <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="sidebar-public" 
                            checked={user ? !signForm.isPublic : !guestForm.isPublic}
                            onCheckedChange={(checked) => user ? setSignForm(prev => ({ ...prev, isPublic: !checked })) : setGuestForm(prev => ({ ...prev, isPublic: !checked }))}
                          />
                          <label htmlFor="sidebar-public" className="text-xs font-medium leading-none cursor-pointer text-muted-foreground">
                              Não exibir minha assinatura publicamente
                          </label>
                        </div>
                         <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="sidebar-notifications" 
                             checked={user ? signForm.allowNotifications : guestForm.allowNotifications}
                            onCheckedChange={(checked) => user ? setSignForm(prev => ({ ...prev, allowNotifications: checked })) : setGuestForm(prev => ({ ...prev, allowNotifications: checked }))}
                          />
                          <label htmlFor="sidebar-notifications" className="text-xs font-medium leading-none cursor-pointer text-muted-foreground">
                              Quero receber novidades sobre esta causa
                          </label>
                        </div>
                    </div>

                    <Button 
                        size="lg" 
                        className="w-full text-lg font-bold shadow-md transition-all relative overflow-hidden"
                        onClick={user ? onSign : onGuestSign}
                        disabled={signing || petition.status !== 'open' || isExpired}
                    >
                        {signing ? 'Assinando...' : (isExpired ? 'Prazo Encerrado' : 'Assinar Agora')}
                    </Button>
                     <p className="text-[10px] text-center text-muted-foreground px-2">
                        Ao assinar, você concorda com nossos Termos de Uso e Política de Privacidade.
                     </p>
                </div>
              ) : (
                <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/30 rounded-xl p-6 text-center space-y-4">
                     <div className="w-16 h-16 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center mx-auto">
                         <FileSignature className="w-8 h-8 text-green-600 dark:text-green-400" />
                     </div>
                     <div>
                         <h3 className="font-bold text-xl text-green-800 dark:text-green-300">Obrigado!</h3>
                         <p className="text-green-700 dark:text-green-400 text-sm">Você já assinou esta petição.</p>
                     </div>
                     <Button variant="outline" className="w-full border-green-200 text-green-700 hover:bg-green-100" onClick={onShare}>
                         Compartilhar agora
                     </Button>
                </div>
              )}
              
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button variant="outline" size="lg" className="w-full border-primary/20 hover:bg-primary/5 hover:text-primary transition-colors" onClick={onShare}>
                  <Share2 className="w-4 h-4 mr-2" />
                  Compartilhar
                </Button>
              </motion.div>

              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-2">
                <ShieldCheck className="w-4 h-4 text-green-600" />
                <span>Assinatura segura e verificada</span>
              </div>
            </div>
            
            <div className="hidden 2xl:block pt-4 border-t border-border bg-muted/30 -mx-6 px-6 pb-6 -mb-6 mt-4">
              <h4 className="font-semibold mb-3 flex items-center gap-2 text-sm pt-4">
                <Sparkles className="w-4 h-4 text-primary" />
                Por que isso importa?
              </h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-3">
                  <div className="p-1 bg-primary/10 rounded-full shrink-0">
                    <Users className="w-3 h-3 text-primary" />
                  </div>
                  <span>Mostra força coletiva para mudança</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="p-1 bg-primary/10 rounded-full shrink-0">
                    <Target className="w-3 h-3 text-primary" />
                  </div>
                  <span>Pressiona autoridades competentes</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="p-1 bg-primary/10 rounded-full shrink-0">
                    <AlertTriangle className="w-3 h-3 text-primary" />
                  </div>
                  <span>Cria visibilidade para o problema</span>
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {donationEnabled && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
        >
          <PetitionDonationCard 
            currentAmount={totalDonations} 
            goalAmount={petition.donation_goal} 
            progressValue={petition.donation_goal ? Math.min((totalDonations / petition.donation_goal) * 100, 100) : 0}
            onDonate={onDonate} 
          />
        </motion.div>
      )}

      {recentDonations.length > 0 && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          <Card className="shadow-sm border-border/50">
            <div className="p-4 pb-2 border-b border-border/50 bg-muted/20">
              <h3 className="font-bold flex items-center gap-2 text-foreground text-sm">
                 <Heart className="w-4 h-4 text-primary" />
                 Últimos Apoiadores
              </h3>
            </div>
            <div className="p-4 space-y-4">
              {recentDonations.slice(0, 5).map((donation, i) => (
                <motion.div 
                  key={i} 
                  className="flex items-center gap-3"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + (i * 0.1) }}
                >
                   <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Heart className="w-4 h-4 text-primary fill-current" />
                   </div>
                   <div className="flex-1 min-w-0 overflow-hidden">
                     <p className="text-sm font-medium truncate text-foreground">
                       {donation.profiles?.name || 'Apoiador Anônimo'}
                     </p>
                     <p className="text-xs text-muted-foreground">
                       Contribuiu com a causa
                     </p>
                   </div>
                </motion.div>
              ))}
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
};

PetitionSidebar.propTypes = {
  petition: PropTypes.object.isRequired,
  user: PropTypes.object,
  hasSigned: PropTypes.bool.isRequired,
  signing: PropTypes.bool.isRequired,
  guestForm: PropTypes.object.isRequired,
  setGuestForm: PropTypes.func.isRequired,
  signForm: PropTypes.object.isRequired,
  setSignForm: PropTypes.func.isRequired,
  onSign: PropTypes.func.isRequired,
  onGuestSign: PropTypes.func.isRequired,
  onShare: PropTypes.func.isRequired,
  onDonate: PropTypes.func.isRequired,
  donationEnabled: PropTypes.bool,
  recentDonations: PropTypes.array,
  totalDonations: PropTypes.number,
};

export default PetitionSidebar;
