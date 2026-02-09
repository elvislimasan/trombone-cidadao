import React from 'react';
import PropTypes from 'prop-types';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  Carousel, 
  CarouselContent, 
  CarouselItem, 
  CarouselNext, 
  CarouselPrevious 
} from '@/components/ui/carousel';
import PetitionCard from '@/components/PetitionCard';

/**
 * Component to display a carousel of related petitions.
 * Used to keep users engaged by showing other causes they might support.
 *
 * @component
 * @param {Object} props - Component props
 * @param {Array} props.otherPetitions - List of related petition objects
 * @param {Function} props.onPetitionClick - Handler for clicking on a petition card (navigation)
 * @param {Function} props.onDonateClick - Handler for clicking the donate button on a card
 * @returns {JSX.Element|null} The rendered carousel or null if no petitions exist
 */
const PetitionRelated = ({ 
  otherPetitions, 
  onPetitionClick, 
  onDonateClick 
}) => {
  if (!otherPetitions || otherPetitions.length === 0) return null;

  return (
    <div className="bg-muted/30 border-t border-border mt-12 py-16" data-testid="petition-related">
        <div className="container mx-auto px-4 max-w-6xl">
            <div className="flex flex-col md:flex-row justify-between items-end mb-10 gap-4">
                <div className="space-y-2">
                    <h2 className="text-3xl font-bold tracking-tight text-foreground">Outras causas que precisam de você</h2>
                    <p className="text-muted-foreground text-lg">Junte-se a milhares de pessoas que estão fazendo a diferença hoje.</p>
                </div>
                <Button variant="ghost" className="group font-semibold text-primary hover:text-primary hover:bg-primary/10">
                    Ver todas as petições <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                </Button>
            </div>

            <Carousel
                opts={{
                    align: "start",
                    loop: true,
                }}
                className="w-full"
            >
                <CarouselContent className="-ml-4 pb-4">
                    {otherPetitions.map((other) => (
                        <CarouselItem key={other.id} className="pl-4 md:basis-1/2 lg:basis-1/3 h-full">
                            <div className="h-full">
                                <PetitionCard 
                                    petition={other}
                                    onClick={() => onPetitionClick(other.id)}
                                    onDonate={() => onDonateClick(other)}
                                />
                            </div>
                        </CarouselItem>
                    ))}
                </CarouselContent>
                <div className="flex justify-end gap-2 mt-4">
                    <CarouselPrevious className="relative static translate-y-0 translate-x-0" />
                    <CarouselNext className="relative static translate-y-0 translate-x-0" />
                </div>
            </Carousel>
        </div>
    </div>
  );
};

PetitionRelated.propTypes = {
  otherPetitions: PropTypes.array.isRequired,
  onPetitionClick: PropTypes.func.isRequired,
  onDonateClick: PropTypes.func.isRequired,
};

export default PetitionRelated;
