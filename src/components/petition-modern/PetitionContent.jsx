import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Lightbulb, Users, Building2, Eye, CheckCircle2, AlertCircle, Heart, FileText } from "lucide-react";

const ICON_MAP = {
  Users,
  Building2,
  Eye,
  CheckCircle2,
  AlertCircle,
  Heart
};

const defaultImportanceItems = [
  { icon: "Users", text: "Mostra força coletiva para mudança" },
  { icon: "Building2", text: "Pressiona autoridades competentes" },
  { icon: "Eye", text: "Cria visibilidade para o problema" },
];

const cleanHtmlContent = (html) => {
  if (!html) return '';
  return html
    // Remove empty paragraphs
    .replace(/<p>\s*<br\s*\/?>\s*<\/p>/gi, '')
    .replace(/<p>\s*&nbsp;\s*<\/p>/gi, '')
    .replace(/<p>\s*<\/p>/gi, '')
    // Remove empty list items
    .replace(/<li>\s*<br\s*\/?>\s*<\/li>/gi, '')
    .replace(/<li>\s*&nbsp;\s*<\/li>/gi, '')
    .replace(/<li>\s*<\/li>/gi, '');
};

const PetitionContent = ({ content, description, children, importanceList, hero }) => {
  const itemsToRender = importanceList && importanceList.length > 0 ? importanceList : defaultImportanceItems;
  const finalContent = cleanHtmlContent(content || description);

  return (
    <Card className="border-0 shadow-md">
      <CardContent className="space-y-6 md:space-y-8 p-4 md:p-6 sm:p-8 min-w-0">
        {hero && (
            <div className="hidden lg:block">
                {hero}
            </div>
        )}

        {/* Problem Section (Dynamic Content) */}
        <section className="min-w-0 max-w-full overflow-hidden">
          <div className="mb-4 md:mb-6 flex items-center gap-2 md:gap-3">
            <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-lg bg-red-100 text-red-600">
                <FileText className="h-5 w-5 md:h-6 md:w-6" />
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-foreground">Entenda a Campanha</h2>
          </div>
          
          <div className="space-y-4 md:space-y-6 min-w-0">
            {finalContent && (
              <div 
                className="text-sm md:text-base text-muted-foreground leading-relaxed break-words max-w-full overflow-hidden [&_p]:mb-3 md:[&_p]:mb-4 [&_h1]:text-xl md:[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-3 md:[&_h1]:mb-4 [&_h2]:text-lg md:[&_h2]:text-xl [&_h2]:font-bold [&_h2]:mb-2 md:[&_h2]:mb-3 [&_h3]:text-base md:[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mb-1 md:[&_h3]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 md:[&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 md:[&_ol]:mb-4"
                dangerouslySetInnerHTML={{ __html: finalContent }}
              />
            )}
            
            {children && (
              <div className="space-y-3 md:space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed break-words overflow-hidden">
                {children}
              </div>
            )}
          </div>
        </section>

        {/* Why It Matters (Dynamic) */}
        <section className="rounded-xl bg-secondary/50 p-4 md:p-6">
          <div className="mb-3 md:mb-4 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 md:h-5 md:w-5 text-primary" />
            <h3 className="text-sm md:text-base font-semibold text-foreground">Por que isso importa?</h3>
          </div>
          <ul className="space-y-2 md:space-y-3">
            {itemsToRender.map((item, index) => {
              const IconComponent = ICON_MAP[item.icon] || Lightbulb;
              return (
                <li key={index} className="flex items-center gap-3 text-xs md:text-sm text-muted-foreground break-words overflow-hidden">
                  <IconComponent className="h-3.5 w-3.5 md:h-4 md:w-4 shrink-0 text-primary" />
                  {item.text}
                </li>
              );
            })}
          </ul>
        </section>
      </CardContent>
    </Card>
  );
};

export default PetitionContent;
