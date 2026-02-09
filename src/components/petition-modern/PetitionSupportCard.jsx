import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Heart, TrendingUp } from "lucide-react";
import DonationForm from "@/components/DonationForm";

const PetitionSupportCard = ({ onDonate, onShare, petitionId, petitionTitle, donationGoal = null, totalDonations = 0 }) => {
  const raised = totalDonations || 0;
  const goal = Number(donationGoal);
  const progress = (goal && goal > 0) ? Math.min((raised / goal) * 100, 100) : 0;
  const hasGoal = !isNaN(goal) && goal > 0;

  return (
    <>
      {/* Mobile Teaser Card - Opens Modal */}
      <div className="lg:hidden">
        <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Heart className="h-5 w-5 text-primary" fill="currentColor" />
              Apoie esta causa
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Abaixo-assinados promovidos têm 10x mais chances de sucesso. Contribua para impulsionar esta causa.
            </p>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Progress */}
            {hasGoal && (
                <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 font-medium text-primary">
                    <TrendingUp className="h-4 w-4" />
                    R$ {raised.toFixed(2).replace('.', ',')} arrecadados
                    </span>
                    <span className="text-muted-foreground">Meta: R$ {goal.toFixed(2).replace('.', ',')}</span>
                </div>
                <Progress value={progress} className="h-2" />
                </div>
            )}

            {/* Contribute Button */}
            <Button 
                className="h-12 w-full text-base font-semibold shadow-md transition-all hover:shadow-lg"
                onClick={() => onDonate && onDonate()}
            >
              Contribuir agora
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Desktop Inline Form */}
      <div className="hidden lg:block">
        <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 shadow-md overflow-hidden">
           <CardHeader className="pb-0">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Heart className="h-5 w-5 text-primary" fill="currentColor" />
              Apoie esta causa
            </CardTitle>
            <p className="text-sm text-muted-foreground mb-2">
              Abaixo-assinados promovidos têm 10x mais chances de sucesso.
            </p>
          </CardHeader>
          <CardContent className="pt-2">
            <DonationForm 
                petitionId={petitionId}
                reportTitle={petitionTitle}
                className="bg-transparent"
                showHeader={true}
                donationGoal={donationGoal}
                totalDonations={totalDonations}
                onSuccess={() => {
                    // Could add logic here to refresh stats or show confetti
                }}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default PetitionSupportCard;
