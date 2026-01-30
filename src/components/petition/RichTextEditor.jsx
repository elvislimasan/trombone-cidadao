import React, { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Bold, Italic, List, Link as LinkIcon, Heading1, Heading2, Quote } from 'lucide-react';

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

  const execCommand = (command, arg = null) => {
    document.execCommand(command, false, arg);
    if (contentRef.current) {
      contentRef.current.focus();
    }
  };

  return (
    <div className={`border rounded-lg overflow-hidden transition-colors ${isFocused ? 'border-primary ring-1 ring-primary' : 'border-border'}`}>
      <div className="bg-muted/50 border-b p-2 flex flex-wrap gap-1">
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
        onInput={handleInput}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        dangerouslySetInnerHTML={{ __html: value }}
      />
      {/* Note: dangerouslySetInnerHTML is only used for initial render if we handled updates differently, 
          but here we use it to sync initial state. React warns if we change it while contentEditable.
          Ideally we shouldn't re-render this component on every keystroke if it causes cursor jump.
          We are relying on onInput to update parent, but we block re-rendering the innerHTML 
          from props if it's focused to avoid cursor jumping.
      */}
    </div>
  );
};

export default RichTextEditor;
