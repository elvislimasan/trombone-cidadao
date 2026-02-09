import React from 'react';
import PropTypes from 'prop-types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useNavigate } from 'react-router-dom';

/**
 * Modal component for guest users to sign the petition.
 * Provides fields for name, email, city, and privacy preferences.
 * Also offers a link to login for existing users.
 *
 * @component
 * @param {Object} props - Component props
 * @param {boolean} props.open - Whether the modal is currently open
 * @param {Function} props.onOpenChange - Handler for modal open state changes
 * @param {Object} props.guestForm - State object containing form field values
 * @param {string} props.guestForm.name - Guest's full name
 * @param {string} props.guestForm.email - Guest's email address
 * @param {string} props.guestForm.city - Guest's city
 * @param {boolean} props.guestForm.isPublic - Whether signature should be public
 * @param {boolean} props.guestForm.allowNotifications - Opt-in for updates
 * @param {Function} props.setGuestForm - State setter for the guest form object
 * @param {Function} props.onGuestSign - Handler to submit the guest signature
 * @param {boolean} props.signing - Loading state during submission
 * @returns {JSX.Element} The rendered modal component
 */
const GuestSignModal = ({ 
  open, 
  onOpenChange, 
  guestForm, 
  setGuestForm, 
  onGuestSign, 
  signing 
}) => {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assinar como convidado</DialogTitle>
          <DialogDescription>
            Você pode assinar rapidamente sem criar uma conta, ou fazer login para uma experiência completa.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
           <div className="space-y-2">
              <Label htmlFor="name">Nome Completo</Label>
              <Input 
                id="name" 
                placeholder="Seu nome completo" 
                value={guestForm.name}
                onChange={(e) => setGuestForm(prev => ({ ...prev, name: e.target.value }))}
              />
           </div>
           <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email" 
                type="email"
                placeholder="seu@email.com" 
                value={guestForm.email}
                onChange={(e) => setGuestForm(prev => ({ ...prev, email: e.target.value }))}
              />
           </div>
           <div className="space-y-2">
              <Label htmlFor="city">Cidade</Label>
               <Input 
                id="city" 
                value={guestForm.city}
                onChange={(e) => setGuestForm(prev => ({ ...prev, city: e.target.value }))}
              />
           </div>
           
           <div className="flex items-center space-x-2 pt-2">
              <Checkbox 
                id="modal-public" 
                checked={!guestForm.isPublic}
                onCheckedChange={(checked) => setGuestForm(prev => ({ ...prev, isPublic: !checked }))}
              />
              <label htmlFor="modal-public" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-muted-foreground">
                  Não exibir minha assinatura publicamente
              </label>
           </div>
           <div className="flex items-center space-x-2">
              <Checkbox 
                id="modal-notifications" 
                checked={guestForm.allowNotifications}
                onCheckedChange={(checked) => setGuestForm(prev => ({ ...prev, allowNotifications: checked }))}
              />
              <label htmlFor="modal-notifications" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-muted-foreground">
                  Quero receber novidades sobre esta causa
              </label>
           </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:gap-0">
          <Button type="button" onClick={onGuestSign} disabled={signing} className="w-full sm:w-auto font-bold">
             {signing ? 'Assinando...' : 'Assinar Agora'}
          </Button>
          <div className="relative py-2">
             <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
             <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Ou</span></div>
          </div>
          <Button variant="outline" onClick={() => navigate('/login')} className="w-full sm:w-auto">
             Fazer Login
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

GuestSignModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onOpenChange: PropTypes.func.isRequired,
  guestForm: PropTypes.object.isRequired,
  setGuestForm: PropTypes.func.isRequired,
  onGuestSign: PropTypes.func.isRequired,
  signing: PropTypes.bool.isRequired,
};

export default GuestSignModal;
