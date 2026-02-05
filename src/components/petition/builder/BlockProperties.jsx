
import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
                 <Select 
                    value={content.level} 
                    onValueChange={(val) => handleContentChange('level', val)}
                 >
                   <SelectTrigger>
                     <SelectValue />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="h1">H1 (Título Principal)</SelectItem>
                     <SelectItem value="h2">H2 (Subtítulo)</SelectItem>
                     <SelectItem value="h3">H3 (Seção)</SelectItem>
                   </SelectContent>
                 </Select>
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
               <Select 
                  value={content.style} 
                  onValueChange={(val) => handleContentChange('style', val)}
               >
                 <SelectTrigger>
                   <SelectValue />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="solid">Sólido</SelectItem>
                   <SelectItem value="dotted">Pontilhado</SelectItem>
                 </SelectContent>
               </Select>
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
                <Select 
                    value={styles?.padding} 
                    onValueChange={(val) => handleStyleChange('padding', val)}
                >
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="0px">Nenhum</SelectItem>
                        <SelectItem value="10px">Pequeno (10px)</SelectItem>
                        <SelectItem value="20px">Médio (20px)</SelectItem>
                        <SelectItem value="40px">Grande (40px)</SelectItem>
                        <SelectItem value="60px">Extra Grande (60px)</SelectItem>
                    </SelectContent>
                </Select>
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
