
import React from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const BlockRenderer = ({ block, readOnly = false, onAction }) => {
  const { type, content, styles } = block;

  const styleProps = {
    padding: styles?.padding,
    margin: styles?.margin,
    textAlign: styles?.textAlign,
    backgroundColor: styles?.backgroundColor,
    color: styles?.color,
    ...styles
  };

  switch (type) {
    case 'header':
      const Tag = content.level || 'h2';
      const fontSize = content.level === 'h1' ? '2.5rem' : content.level === 'h2' ? '2rem' : '1.5rem';
      return (
        <div style={styleProps}>
          <Tag style={{ fontSize, fontWeight: 'bold' }}>{content.text}</Tag>
        </div>
      );

    case 'text':
      return (
        <div style={styleProps} dangerouslySetInnerHTML={{ __html: content.html }} />
      );

    case 'image':
      return (
        <div style={styleProps}>
           {content.url ? (
             <figure>
               <img src={content.url} alt="Block" className="max-w-full h-auto rounded-lg" />
               {content.caption && <figcaption className="text-sm text-muted-foreground mt-2 text-center">{content.caption}</figcaption>}
             </figure>
           ) : (
             <div className="bg-muted h-48 flex items-center justify-center rounded-lg border-2 border-dashed">
               <p className="text-muted-foreground">Selecione uma imagem</p>
             </div>
           )}
        </div>
      );

    case 'video':
       return (
         <div style={styleProps}>
            {content.url ? (
              <div className="aspect-video bg-black rounded-lg overflow-hidden">
                <iframe 
                    src={content.url.replace('watch?v=', 'embed/')} 
                    title="Video" 
                    className="w-full h-full" 
                    frameBorder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowFullScreen
                />
              </div>
            ) : (
                <div className="bg-muted h-48 flex items-center justify-center rounded-lg border-2 border-dashed">
                    <p className="text-muted-foreground">Configure a URL do vídeo</p>
                </div>
            )}
         </div>
       );

    case 'signature':
       return (
           <div style={styleProps} className="p-6 bg-card border rounded-lg shadow-sm text-center">
               <h3 className="text-xl font-bold mb-4">{content.label || 'Assine agora'}</h3>
               <p className="text-muted-foreground mb-4">Junte-se à causa!</p>
               <Button 
                className="w-full md:w-auto" 
                size="lg" 
                onClick={() => !readOnly && onAction && onAction('sign')}
                disabled={readOnly}
               >
                   Assinar Petição
               </Button>
           </div>
       );

    case 'separator':
       return (
           <div style={styleProps}>
               <Separator className={content.style === 'dotted' ? 'border-dotted border-b-2 bg-transparent' : ''} />
           </div>
       );
    
    case 'button':
        return (
            <div style={styleProps}>
                <Button size="lg" className="w-full md:w-auto">
                    {content.text}
                </Button>
            </div>
        );

    default:
      return <div>Unknown block type: {type}</div>;
  }
};

export default BlockRenderer;
