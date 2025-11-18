# Como Criar o Bucket `new-images` no Supabase

## 📦 Passo a Passo

### 1. Acessar o Supabase Dashboard
1. Acesse https://app.supabase.com
2. Selecione seu projeto
3. No menu lateral, clique em **Storage**

### 2. Criar o Bucket
1. Clique no botão **New bucket** (ou "Criar novo bucket")
2. Preencha os dados:
   - **Name**: `new-images` (exatamente assim, com hífen)
   - **Public bucket**: ✅ **Marcar como SIM** (importante para acesso público)
   - **File size limit**: 10MB (ou o valor que preferir)
   - **Allowed MIME types**: `image/*,video/*` (opcional, mas recomendado)

3. Clique em **Create bucket**

### 3. Configurar Políticas de Acesso (RLS)

Após criar o bucket, execute este SQL no **SQL Editor** do Supabase:

```sql
-- Política para upload (apenas autenticados)
CREATE POLICY "new_images_upload_authenticated" ON storage.objects
    FOR INSERT
    WITH CHECK (
        bucket_id = 'new-images' 
        AND auth.role() = 'authenticated'
    );

-- Política para leitura pública
CREATE POLICY "new_images_read_public" ON storage.objects
    FOR SELECT
    USING (bucket_id = 'new-images');

-- Política para atualização (apenas autenticados)
CREATE POLICY "new_images_update_authenticated" ON storage.objects
    FOR UPDATE
    USING (
        bucket_id = 'new-images' 
        AND auth.role() = 'authenticated'
    );

-- Política para exclusão (apenas autenticados)
CREATE POLICY "new_images_delete_authenticated" ON storage.objects
    FOR DELETE
    USING (
        bucket_id = 'new-images' 
        AND auth.role() = 'authenticated'
    );
```

## ✅ Verificação

Após criar o bucket e configurar as políticas, teste fazendo upload de uma imagem na página de gerenciar notícias.

## ⚠️ Importante

- O nome do bucket **DEVE** ser exatamente `new-images` (com hífen, minúsculas)
- O bucket **DEVE** ser público para que as imagens sejam acessíveis
- As políticas RLS são necessárias para controlar quem pode fazer upload/delete


