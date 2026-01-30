import React, { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Bold, 
  Italic, 
  Underline,
  Strikethrough,
  List, 
  ListOrdered,
  Link as LinkIcon, 
  Unlink,
  Heading1, 
  Heading2, 
  Quote, 
  Type, 
  ChevronDown,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo,
  Redo,
  Palette,
  Highlighter,
  Eraser,
  Minus,
  Plus
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const RichTextEditor = ({ value, onChange, placeholder }) => {
  const contentRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);

  // Sync with external value changes only when not focused to prevent cursor jumping
  useEffect(() => {
    if (contentRef.current && value !== contentRef.current.innerHTML && !isFocused) {
      contentRef.current.innerHTML = value || '';
    }
  }, [value, isFocused]);

  const handleInput = () => {
    if (contentRef.current) {
      onChange(contentRef.current.innerHTML);
    }
  };

  const handlePaste = (e) => {
    // Prevent default paste behavior
    e.preventDefault();
    // Get plain text
    const text = e.clipboardData.getData('text/plain');
    // Insert text at cursor position
    document.execCommand("insertText", false, text);
  };

  const execCommand = (command, arg = null) => {
    document.execCommand(command, false, arg);
    if (contentRef.current) {
      contentRef.current.focus();
    }
  };

  const addLink = () => {
    const url = prompt('Insira a URL do link:');
    if (url) {
      execCommand('createLink', url);
    }
  };

  const fonts = [
    { name: 'Padrão (Sans Serif)', value: 'sans-serif' },
    { name: 'Serif', value: 'serif' },
    { name: 'Monospace', value: 'monospace' },
    { name: 'Arial', value: 'Arial' },
    { name: 'Times New Roman', value: 'Times New Roman' },
    { name: 'Courier New', value: 'Courier New' },
    { name: 'Georgia', value: 'Georgia' },
    { name: 'Verdana', value: 'Verdana' },
  ];

  const fontSizes = [
    { name: 'Muito Pequeno', value: '1' },
    { name: 'Pequeno', value: '2' },
    { name: 'Normal', value: '3' },
    { name: 'Médio', value: '4' },
    { name: 'Grande', value: '5' },
    { name: 'Muito Grande', value: '6' },
    { name: 'Enorme', value: '7' },
  ];

  const colors = [
    '#000000', '#444444', '#666666', '#999999', '#cccccc', '#eeeeee', '#f3f4f6', '#ffffff',
    '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#9900ff', '#ff00ff',
    '#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4',
    '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722',
  ];

  return (
    <div className={`border rounded-lg overflow-hidden transition-colors ${isFocused ? 'border-primary ring-1 ring-primary' : 'border-border'}`}>
      <div className="bg-muted/50 border-b p-1 flex flex-wrap gap-1 items-center">
        
        {/* Group: History */}
        <div className="flex items-center gap-0.5 mr-1">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => execCommand('undo')} title="Desfazer">
            <Undo className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => execCommand('redo')} title="Refazer">
            <Redo className="w-4 h-4" />
          </Button>
        </div>

        <div className="w-px h-6 bg-border mx-1 my-auto hidden sm:block" />

        {/* Group: Typography */}
        <div className="flex items-center gap-1 mr-1">
          <DropdownMenu>
              <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 gap-1 px-2" title="Fonte">
                      <Type className="w-4 h-4" />
                      <ChevronDown className="w-3 h-3" />
                  </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                  {fonts.map((font) => (
                      <DropdownMenuItem 
                          key={font.value} 
                          onClick={() => execCommand('fontName', font.value)}
                          style={{ fontFamily: font.value }}
                      >
                          {font.name}
                      </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
              <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 gap-1 px-2" title="Tamanho da Fonte">
                      <span className="text-xs font-bold">T</span>
                      <ChevronDown className="w-3 h-3" />
                  </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                  {fontSizes.map((size) => (
                      <DropdownMenuItem 
                          key={size.value} 
                          onClick={() => execCommand('fontSize', size.value)}
                      >
                          {size.name}
                      </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="w-px h-6 bg-border mx-1 my-auto hidden sm:block" />

        {/* Group: Basic Formatting */}
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => execCommand('bold')} title="Negrito">
            <Bold className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => execCommand('italic')} title="Itálico">
            <Italic className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => execCommand('underline')} title="Sublinhado">
            <Underline className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => execCommand('strikeThrough')} title="Tachado">
            <Strikethrough className="w-4 h-4" />
          </Button>
        </div>

        <div className="w-px h-6 bg-border mx-1 my-auto hidden sm:block" />

        {/* Group: Colors & Clear */}
        <div className="flex items-center gap-0.5">
           <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Cor do Texto">
                <Palette className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2">
              <div className="grid grid-cols-8 gap-1">
                {colors.map((color) => (
                  <button
                    key={color}
                    className="w-6 h-6 rounded-sm border border-gray-200 hover:scale-110 transition-transform"
                    style={{ backgroundColor: color }}
                    onClick={() => execCommand('foreColor', color)}
                    title={color}
                  />
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Cor de Fundo">
                <Highlighter className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2">
              <div className="grid grid-cols-8 gap-1">
                {colors.map((color) => (
                  <button
                    key={color}
                    className="w-6 h-6 rounded-sm border border-gray-200 hover:scale-110 transition-transform"
                    style={{ backgroundColor: color }}
                    onClick={() => execCommand('hiliteColor', color)}
                    title={color}
                  />
                ))}
              </div>
            </PopoverContent>
          </Popover>
          
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => execCommand('removeFormat')} title="Limpar Formatação">
            <Eraser className="w-4 h-4" />
          </Button>
        </div>

        <div className="w-px h-6 bg-border mx-1 my-auto hidden sm:block" />

        {/* Group: Alignment */}
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => execCommand('justifyLeft')} title="Alinhar à Esquerda">
            <AlignLeft className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => execCommand('justifyCenter')} title="Centralizar">
            <AlignCenter className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => execCommand('justifyRight')} title="Alinhar à Direita">
            <AlignRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="w-px h-6 bg-border mx-1 my-auto hidden sm:block" />

        {/* Group: Lists & Structure */}
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => execCommand('insertUnorderedList')} title="Lista com Marcadores">
            <List className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => execCommand('insertOrderedList')} title="Lista Numerada">
            <ListOrdered className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => execCommand('formatBlock', '<blockquote>')} title="Citação">
            <Quote className="w-4 h-4" />
          </Button>
        </div>

        <div className="w-px h-6 bg-border mx-1 my-auto hidden sm:block" />

        {/* Group: Insert */}
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={addLink} title="Inserir Link">
            <LinkIcon className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => execCommand('unlink')} title="Remover Link">
            <Unlink className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div
        ref={contentRef}
        className="p-4 min-h-[200px] max-h-[500px] overflow-y-auto focus:outline-none prose max-w-none dark:prose-invert"
        contentEditable
        suppressContentEditableWarning={true}
        onInput={handleInput}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onPaste={handlePaste}
      />
    </div>
  );
};

export default RichTextEditor;
