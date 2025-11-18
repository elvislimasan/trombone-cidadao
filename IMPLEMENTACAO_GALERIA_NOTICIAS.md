# Implementação de Galeria de Imagens para Notícias

## 📋 O que é necessário

Para implementar a galeria de imagens nas notícias, você precisa seguir o mesmo padrão usado para obras públicas (`public_work_media`) e relatórios (`report_media`).

---

## 1. 🗄️ Banco de Dados - Criar Tabela

Execute este SQL no Supabase para criar a tabela `news_image`:

```sql
-- Criar tabela para armazenar mídias das notícias
CREATE TABLE IF NOT EXISTS public.news_image (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    news_id UUID NOT NULL REFERENCES public.news(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('image', 'video')),
    name TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Criar índice para melhor performance
CREATE INDEX IF NOT EXISTS idx_news_image_news_id ON public.news_image(news_id);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.news_image ENABLE ROW LEVEL SECURITY;

-- Política para leitura pública
CREATE POLICY "news_image_select_public" ON public.news_image
    FOR SELECT
    USING (true);

-- Política para inserção (apenas autenticados)
CREATE POLICY "news_image_insert_authenticated" ON public.news_image
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- Política para atualização (apenas admins)
CREATE POLICY "news_image_update_admin" ON public.news_image
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.is_admin = true
        )
    );

-- Política para exclusão (apenas admins)
CREATE POLICY "news_image_delete_admin" ON public.news_image
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.is_admin = true
        )
    );
```

---

## 2. 📦 Supabase Storage - Criar Bucket

1. Acesse o Supabase Dashboard
2. Vá em **Storage**
3. Clique em **New bucket**
4. Nome: `news-images`
5. Configurações:
   - **Public bucket**: ✅ Sim (para acesso público às imagens)
   - **File size limit**: 10MB (ou conforme necessário)
   - **Allowed MIME types**: `image/*,video/*`

### Políticas de Storage (RLS)

Execute no SQL Editor do Supabase:

```sql
-- Primeiro, remover políticas antigas se existirem (para news-media ou outras versões)
DROP POLICY IF EXISTS "news_image_upload_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "news_image_read_public" ON storage.objects;
DROP POLICY IF EXISTS "news_image_update_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "news_image_delete_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "news_media_upload_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "news_media_read_public" ON storage.objects;
DROP POLICY IF EXISTS "news_media_update_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "news_media_delete_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "new_images_upload_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "new_images_read_public" ON storage.objects;
DROP POLICY IF EXISTS "new_images_update_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "new_images_delete_authenticated" ON storage.objects;

-- Política para upload (apenas autenticados)
CREATE POLICY "news_image_upload_authenticated" ON storage.objects
    FOR INSERT
    WITH CHECK (
        bucket_id = 'news-images' 
        AND auth.role() = 'authenticated'
    );

-- Política para leitura pública
CREATE POLICY "news_image_read_public" ON storage.objects
    FOR SELECT
    USING (bucket_id = 'news-images');

-- Política para atualização (apenas autenticados)
CREATE POLICY "news_image_update_authenticated" ON storage.objects
    FOR UPDATE
    USING (
        bucket_id = 'news-images' 
        AND auth.role() = 'authenticated'
    );

-- Política para exclusão (apenas autenticados)
CREATE POLICY "news_image_delete_authenticated" ON storage.objects
    FOR DELETE
    USING (
        bucket_id = 'news-images' 
        AND auth.role() = 'authenticated'
    );
```

---

## 3. 💻 Implementação no Código

### 3.1. Atualizar `ManageNewsPage.jsx`

Adicione a funcionalidade de upload de múltiplas imagens:

```javascript
// Adicionar estado para galeria
const [galleryFiles, setGalleryFiles] = useState([]);
const galleryInputRef = useRef(null);

// Função para adicionar imagens à galeria
const handleGalleryChange = (e) => {
  const files = Array.from(e.target.files);
  setGalleryFiles(prev => [...prev, ...files.map(file => ({
    file,
    preview: URL.createObjectURL(file),
    name: file.name
  }))]);
};

// Função para remover imagem da galeria
const removeGalleryImage = (index) => {
  setGalleryFiles(prev => {
    const removed = prev[index];
    if (removed?.preview) {
      URL.revokeObjectURL(removed.preview);
    }
    return prev.filter((_, i) => i !== index);
  });
};

// Função para fazer upload das imagens
const uploadGalleryImages = async (newsId) => {
  if (galleryFiles.length === 0) return;

  const uploadPromises = galleryFiles.map(async ({ file }) => {
    const filePath = `news/${newsId}/${Date.now()}-${file.name}`;
    
    // Upload para storage
    const { error: uploadError } = await supabase.storage
      .from('news-images')
      .upload(filePath, file);

    if (uploadError) {ss
      throw new Error(`Erro no upload de ${file.name}: ${uploadError.message}`);
    }

    // Obter URL pública
    const { data: { publicUrl } } = supabase.storage
      .from('news-images')
      .getPublicUrl(filePath);

    // Salvar no banco
    const { error: dbError } = await supabase
      .from('news_image')
      .insert({
        news_id: newsId,
        url: publicUrl,
        type: 'image',
        name: file.name
      });

    if (dbError) {
      throw new Error(`Erro ao salvar ${file.name}: ${dbError.message}`);
    }
  });

  await Promise.all(uploadPromises);
};

// Atualizar handleSaveNews para incluir upload de galeria
const handleSaveNews = async (newsToSave) => {
  const { id, comments, ...dataToSave } = newsToSave;
  
  const validFields = ['title', 'source', 'date', 'description', 'body', 'image_url', 'link', 'video_url'];
  const filteredData = Object.keys(dataToSave)
    .filter(key => validFields.includes(key))
    .reduce((obj, key) => {
      obj[key] = dataToSave[key];
      return obj;
    }, {});

  let error;
  let savedNewsId;

  if (id) {
    ({ error } = await supabase.from('news').update(filteredData).eq('id', id));
    savedNewsId = id;
  } else {
    const { data, error: insertError } = await supabase.from('news').insert(filteredData).select().single();
    error = insertError;
    savedNewsId = data?.id;
  }

  if (error) {
    toast({ title: "Erro ao salvar notícia", description: error.message, variant: "destructive" });
    return;
  }

  // Upload da galeria após salvar a notícia
  if (savedNewsId && galleryFiles.length > 0) {
    try {
      await uploadGalleryImages(savedNewsId);
      setGalleryFiles([]); // Limpar após upload
    } catch (uploadError) {
      toast({ 
        title: "Notícia salva, mas houve erro no upload da galeria", 
        description: uploadError.message, 
        variant: "destructive" 
      });
    }
  }

  toast({ title: `Notícia ${id ? 'atualizada' : 'adicionada'} com sucesso!` });
  fetchNewsAndComments();
  setEditingNews(null);
};
```

### 3.2. Adicionar campo de galeria no formulário

No componente `NewsEditModal`, adicione após o campo de imagem de destaque:

```jsx
<div className="grid grid-cols-4 items-start gap-4">
  <Label className="text-right pt-2">Galeria de Imagens</Label>
  <div className="col-span-3">
    <input 
      type="file" 
      accept="image/*" 
      multiple 
      ref={galleryInputRef} 
      onChange={handleGalleryChange} 
      className="hidden" 
    />
    <Button 
      type="button" 
      variant="outline" 
      onClick={() => galleryInputRef.current.click()}
    >
      <ImageIcon className="w-4 h-4 mr-2" /> Adicionar Imagens à Galeria
    </Button>
    <div className="mt-2 flex flex-wrap gap-2">
      {galleryFiles.map((item, index) => (
        <div key={index} className="relative">
          <img 
            src={item.preview} 
            alt={`Preview ${index}`} 
            className="h-24 w-24 object-cover rounded-md" 
          />
          <Button 
            type="button" 
            variant="destructive" 
            size="icon" 
            className="absolute -top-2 -right-2 h-6 w-6 rounded-full" 
            onClick={() => removeGalleryImage(index)}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      ))}
    </div>
  </div>
</div>
```

### 3.3. Atualizar `NewsDetailsPage.jsx` para exibir galeria

```javascript
// Buscar mídias da notícia
const fetchNewsDetails = useCallback(async () => {
  // ... código existente para buscar notícia ...

  // Buscar galeria de imagens
  const { data: mediaData, error: mediaError } = await supabase
    .from('news_image')
    .select('*')
    .eq('news_id', newsId)
    .order('created_at', { ascending: false });

  if (mediaError) {
    toast({ title: "Erro ao buscar galeria", description: mediaError.message, variant: "destructive" });
  }

  setGallery(mediaData || []);
}, [newsId, toast]);

// Exibir galeria na página
{gallery.length > 0 && (
  <div className="mb-8">
    <h3 className="text-xl font-semibold mb-4">Galeria de Imagens</h3>
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {gallery.map((item) => (
        <img 
          key={item.id} 
          src={item.url} 
          alt={item.name || 'Imagem da galeria'} 
          className="w-full aspect-square object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => openMediaViewer(gallery, gallery.findIndex(i => i.id === item.id))}
        />
      ))}
    </div>
  </div>
)}
```

---

## 4. ✅ Resumo dos Passos

1. ✅ **Criar tabela `news_image`** no banco de dados
2. ✅ **Criar bucket `news-images`** no Supabase Storage
3. ✅ **Configurar políticas RLS** para tabela e storage
4. ✅ **Atualizar `ManageNewsPage.jsx`** com upload de galeria
5. ✅ **Atualizar `NewsDetailsPage.jsx`** para exibir galeria
6. ✅ **Testar upload e exibição** de imagens

---

## 📝 Notas Importantes

- **Limite de tamanho**: Configure limites apropriados no bucket
- **Formato de arquivo**: Aceite apenas formatos de imagem válidos
- **Performance**: Considere compressão de imagens antes do upload
- **Cleanup**: Implemente remoção de imagens antigas ao deletar notícia
- **Validação**: Valide tamanho e tipo de arquivo antes do upload

---

## 🔄 Exemplo de Remoção de Imagens

Ao deletar uma notícia, remova também as imagens:

```javascript
const handleDeleteNews = async (newsId) => {
  // Buscar URLs das imagens
  const { data: media } = await supabase
    .from('news_image')
    .select('url')
    .eq('news_id', newsId);

  // Remover do storage
  if (media && media.length > 0) {
    const paths = media.map(m => {
      const url = new URL(m.url);
      return url.pathname.split('/news-images/')[1];
    }).filter(Boolean);

    if (paths.length > 0) {
      await supabase.storage.from('news-images').remove(paths);
    }
  }

  // Deletar notícia (cascade deleta registros em news_image)
  const { error } = await supabase.from('news').delete().eq('id', newsId);
  // ... resto do código
};
```

