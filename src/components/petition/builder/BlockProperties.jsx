
import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import RichTextEditor from '../RichTextEditor';

const BlockProperties = ({ block, onChange }) => {
  const { type, content, styles } = block;

  const handleContentChange = (key, value) => {
    onChange({ content: { ...content, [key]: value } });
  };

  const handleStyleChange = (key, value) => {
    onChange({ styles: { ...styles, [key]: value } });
  };

  return (
    <div className="space-y-6">
       <div>
         <h4 className="font-bold text-lg capitalize mb-1">{type}</h4>
         <p className="text-xs text-muted-foreground">ID: {block.id}</p>
       </div>

       <Tabs defaultValue="content">
         <TabsList className="w-full">
           <TabsTrigger value="content" className="flex-1">Conteúdo</TabsTrigger>
           <TabsTrigger value="style" className="flex-1">Estilo</TabsTrigger>
         </TabsList>
         
         <TabsContent value="content" className="space-y-4 pt-4">
           {/* Header Properties */}
           {type === 'header' && (
             <>
               <div className="space-y-2">
                 <Label>Texto</Label>
                 <Input 
                    value={content.text} 
                    onChange={(e) => handleContentChange('text', e.target.value)} 
                 />
               </div>
               <div className="space-y-2">
                <Label>Nível</Label>
                <Combobox 
                   value={content.level} 
                   onChange={(val) => handleContentChange('level', val)}
                   options={[
                     { value: "h1", label: "H1 (Título Principal)" },
                     { value: "h2", label: "H2 (Subtítulo)" },
                     { value: "h3", label: "H3 (Seção)" }
                   ]}
                   placeholder="Selecione o nível..."
                   searchPlaceholder="Buscar nível..."
                />
              </div>
             </>
           )}

           {/* Text Properties */}
           {type === 'text' && (
             <div className="space-y-2">
               <Label>Conteúdo</Label>
               <RichTextEditor 
                 value={content.html} 
                 onChange={(val) => handleContentChange('html', val)} 
               />
             </div>
           )}

           {/* Image Properties */}
           {type === 'image' && (
             <>
                <div className="space-y-2">
                 <Label>URL da Imagem</Label>
                 <Input 
                    value={content.url} 
                    onChange={(e) => handleContentChange('url', e.target.value)} 
                    placeholder="https://..."
                 />
               </div>
               <div className="space-y-2">
                 <Label>Legenda (Opcional)</Label>
                 <Input 
                    value={content.caption} 
                    onChange={(e) => handleContentChange('caption', e.target.value)} 
                 />
               </div>
             </>
           )}

           {/* Video Properties */}
           {type === 'video' && (
             <div className="space-y-2">
               <Label>URL do YouTube</Label>
               <Input 
                  value={content.url} 
                  onChange={(e) => handleContentChange('url', e.target.value)} 
                  placeholder="https://youtube.com/watch?v=..."
               />
             </div>
           )}

           {/* Button Properties */}
           {type === 'button' && (
             <>
               <div className="space-y-2">
                 <Label>Texto do Botão</Label>
                 <Input 
                    value={content.text} 
                    onChange={(e) => handleContentChange('text', e.target.value)} 
                 />
               </div>
               <div className="space-y-2">
                 <Label>Link de Destino</Label>
                 <Input 
                    value={content.url} 
                    onChange={(e) => handleContentChange('url', e.target.value)} 
                 />
               </div>
             </>
           )}

            {/* Signature Properties */}
            {type === 'signature' && (
             <div className="space-y-2">
               <Label>Título do Formulário</Label>
               <Input 
                  value={content.label} 
                  onChange={(e) => handleContentChange('label', e.target.value)} 
               />
             </div>
           )}
           
           {/* Separator Properties */}
            {type === 'separator' && (
              <div className="space-y-2">
                <Label>Estilo</Label>
                <Combobox 
                   value={content.style} 
                   onChange={(val) => handleContentChange('style', val)}
                   options={[
                     { value: "solid", label: "Sólido" },
                     { value: "dotted", label: "Pontilhado" }
                   ]}
                   placeholder="Selecione o estilo..."
                   searchPlaceholder="Buscar estilo..."
                />
              </div>
            )}
         </TabsContent>

         <TabsContent value="style" className="space-y-4 pt-4">
            <div className="space-y-2">
                <Label>Alinhamento</Label>
                <div className="flex gap-2">
                    {['left', 'center', 'right'].map(align => (
                        <button
                            key={align}
                            className={`p-2 border rounded ${styles?.textAlign === align ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}
                            onClick={() => handleStyleChange('textAlign', align)}
                        >
                            {align === 'left' ? 'Esquerda' : align === 'center' ? 'Centro' : 'Direita'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-2">
                <Label>Padding (Espaçamento Interno)</Label>
                <Combobox 
                    value={styles?.padding} 
                    onChange={(val) => handleStyleChange('padding', val)}
                    options={[
                        { value: "0px", label: "Nenhum" },
                        { value: "10px", label: "Pequeno (10px)" },
                        { value: "20px", label: "Médio (20px)" },
                        { value: "40px", label: "Grande (40px)" },
                        { value: "60px", label: "Extra Grande (60px)" }
                    ]}
                    placeholder="Selecione o padding..."
                    searchPlaceholder="Buscar padding..."
                />
            </div>

            <div className="space-y-2">
                <Label>Cor de Fundo</Label>
                <div className="flex gap-2 flex-wrap">
                    {['transparent', '#ffffff', '#f3f4f6', '#000000', '#eff6ff', '#fef2f2'].map(color => (
                        <button
                            key={color}
                            className={`w-8 h-8 rounded-full border shadow-sm ${styles?.backgroundColor === color ? 'ring-2 ring-primary' : ''}`}
                            style={{ backgroundColor: color }}
                            onClick={() => handleStyleChange('backgroundColor', color)}
                            title={color}
                        />
                    ))}
                </div>
            </div>

            <div className="space-y-2">
                <Label>Cor do Texto</Label>
                <div className="flex gap-2 flex-wrap">
                    {['inherit', '#000000', '#ffffff', '#374151', '#ef4444', '#3b82f6'].map(color => (
                        <button
                            key={color}
                            className={`w-8 h-8 rounded-full border shadow-sm flex items-center justify-center ${styles?.color === color ? 'ring-2 ring-primary' : ''}`}
                            style={{ backgroundColor: color === 'inherit' ? 'transparent' : color }}
                            onClick={() => handleStyleChange('color', color)}
                            title={color}
                        >
                            {color === 'inherit' && 'A'}
                        </button>
                    ))}
                </div>
            </div>
         </TabsContent>
       </Tabs>
    </div>
  );
};

export default BlockProperties;
