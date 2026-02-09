import React from 'react';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import PropTypes from 'prop-types';

/**
 * Card component displaying donation progress and options.
 * Encourages users to financially support the petition to boost its visibility.
 *
 * @component
 * @param {Object} props - Component props
 * @param {number} [props.currentAmount=450] - Total amount raised so far
 * @param {number} [props.goalAmount=1000] - Fundraising goal
 * @param {number} [props.progressValue=45] - Percentage of goal reached (0-100)
 * @param {Function} props.onDonate - Handler for donation button clicks. Optionally receives an amount.
 * @returns {JSX.Element} The rendered donation card
 */
const PetitionDonationCard = ({ 
  currentAmount = 0, 
  goalAmount = null, 
  progressValue = 0, 
  onDonate 
}) => {
  const goal = Number(goalAmount);
  const hasGoal = !isNaN(goal) && goal > 0;

  return (
    <Card className="shadow-lg border-primary/20 bg-card overflow-hidden relative">
      <div className="absolute top-0 left-0 w-1.5 bg-primary h-full" />
      <CardContent className="pt-6 space-y-6">
        <div className="space-y-2">
          <h3 className="font-bold text-xl flex items-center gap-2 text-foreground">
            <Heart className="w-5 h-5 text-primary fill-current" />
            Apoie esta causa
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Abaixo-assinados promovidos têm 10x mais chances de sucesso. Contribua para impulsionar esta causa.
          </p>
        </div>

        {hasGoal && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold text-muted-foreground">
              <span>R$ {currentAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} arrecadados</span>
              <span>Meta: R$ {goalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <Progress value={progressValue} className="h-2.5 bg-muted" indicatorClassName="bg-primary" />
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          {[10, 25, 50].map((amount) => (
            <Button 
              key={amount} 
              variant="outline" 
              className="border-primary/20 hover:bg-primary/5 hover:text-primary font-bold h-10 hover:border-primary"
              onClick={() => onDonate(amount)}
            >
              R$ {amount}
            </Button>
          ))}
        </div>

        <Button 
          className="w-full font-bold shadow-md text-base h-11"
          onClick={() => onDonate()}
        >
          Contribuir agora
        </Button>
      </CardContent>
    </Card>
  );
};

PetitionDonationCard.propTypes = {
  currentAmount: PropTypes.number,
  goalAmount: PropTypes.number,
  progressValue: PropTypes.number,
  onDonate: PropTypes.func.isRequired,
};

export default PetitionDonationCard;
