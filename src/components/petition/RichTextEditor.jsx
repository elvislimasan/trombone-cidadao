import React, { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Bold, 
  Italic, 
  List, 
  Link as LinkIcon, 
  Heading1, 
  Heading2, 
  Quote, 
  Type, 
  ChevronDown 
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

  return (
    <div className={`border rounded-lg overflow-hidden transition-colors ${isFocused ? 'border-primary ring-1 ring-primary' : 'border-border'}`}>
      <div className="bg-muted/50 border-b p-2 flex flex-wrap gap-1 items-center">
        
        {/* Font Selector */}
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 mr-1" title="Alterar Fonte">
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

        <div className="w-px h-6 bg-border mx-1 my-auto" />

        <Button 
          variant="ghost" size="sm" className="h-8 w-8 p-0" 
          onClick={() => execCommand('bold')} title="Negrito"
        >
          <Bold className="w-4 h-4" />
        </Button>
        <Button 
          variant="ghost" size="sm" className="h-8 w-8 p-0" 
          onClick={() => execCommand('italic')} title="Itálico"
        >
          <Italic className="w-4 h-4" />
        </Button>
        <div className="w-px h-6 bg-border mx-1 my-auto" />
        <Button 
          variant="ghost" size="sm" className="h-8 w-8 p-0" 
          onClick={() => execCommand('formatBlock', '<h2>')} title="Título"
        >
          <Heading1 className="w-4 h-4" />
        </Button>
        <Button 
          variant="ghost" size="sm" className="h-8 w-8 p-0" 
          onClick={() => execCommand('formatBlock', '<h3>')} title="Subtítulo"
        >
          <Heading2 className="w-4 h-4" />
        </Button>
        <div className="w-px h-6 bg-border mx-1 my-auto" />
        <Button 
          variant="ghost" size="sm" className="h-8 w-8 p-0" 
          onClick={() => execCommand('insertUnorderedList')} title="Lista"
        >
          <List className="w-4 h-4" />
        </Button>
        <Button 
          variant="ghost" size="sm" className="h-8 w-8 p-0" 
          onClick={() => execCommand('formatBlock', '<blockquote>')} title="Citação"
        >
          <Quote className="w-4 h-4" />
        </Button>
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
      {/* 
          Removed dangerouslySetInnerHTML to prevent cursor jumping on re-renders.
          Initial content is handled by the useEffect above.
      */}
    </div>
  );
};

export default RichTextEditor;
