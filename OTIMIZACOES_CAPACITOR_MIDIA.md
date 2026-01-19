# Otimizações de Performance para Mídia com Capacitor

## 🚀 Melhorias Recomendadas

### 1. **Usar URI ao invés de Base64 para Fotos**

**Problema Atual:**
- Base64 usa ~33% mais memória que o arquivo original
- Carrega arquivo inteiro na memória de uma vez
- Lento para arquivos grandes

**Solução:**
```javascript
// ❌ ATUAL (ineficiente)
resultType: CameraResultType.Base64

// ✅ OTIMIZADO (eficiente)
resultType: CameraResultType.Uri
```

**Benefícios:**
- Usa menos memória
- Mais rápido
- Pode processar em chunks

### 2. **Usar Filesystem API para Ler Arquivos**

**Código Otimizado:**
```javascript
import { Filesystem, Directory } from '@capacitor/filesystem';

const processPhotoFromUri = async (imageUri, fileName) => {
  // Ler arquivo usando Filesystem (mais eficiente)
  const readResult = await Filesystem.readFile({
    path: imageUri,
    directory: Directory.Data
  });
  
  // Converter para Blob (mais eficiente que Base64 string)
  const base64Data = readResult.data;
  const byteCharacters = atob(base64Data);
  const byteArray = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteArray[i] = byteCharacters.charCodeAt(i);
  }
  const blob = new Blob([byteArray], { type: 'image/jpeg' });
  const photoFile = new File([blob], fileName, { type: 'image/jpeg' });
  
  return photoFile;
};
```

### 3. **Processar Vídeos em Chunks**

**Para vídeos grandes (300MB):**
```javascript
// Ler vídeo em chunks usando Filesystem
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB por vez

const readVideoInChunks = async (filePath, fileSize) => {
  const chunks = [];
  let offset = 0;
  
  while (offset < fileSize) {
    const chunkSize = Math.min(CHUNK_SIZE, fileSize - offset);
    const chunk = await Filesystem.readFile({
      path: filePath,
      directory: Directory.Data,
      offset: offset,
      length: chunkSize
    });
    chunks.push(chunk.data);
    offset += chunkSize;
  }
  
  return chunks;
};
```

### 4. **Usar Web Workers para Processamento Pesado**

**Criar worker para processamento:**
```javascript
// worker.js
self.onmessage = function(e) {
  const { imageData, width, height } = e.data;
  
  // Processar imagem em background
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  // ... processamento ...
  
  self.postMessage({ processedData: canvas });
};
```

### 5. **Usar @capacitor-community/media para Vídeos**

**Já instalado no projeto!** Pode ser usado:
```javascript
import { Media } from '@capacitor-community/media';

// Capturar vídeo
const video = await Media.getVideo({
  quality: 'high',
  duration: 60
});
```

### 6. **Otimizar Upload com Streaming**

**Upload em chunks para Supabase:**
```javascript
const uploadLargeFile = async (file, path, bucket) => {
  const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);
    
    await supabase.storage
      .from(bucket)
      .upload(`${path}.part${i}`, chunk);
  }
  
  // Combinar chunks no servidor
};
```

## 📊 Comparação de Performance

| Método | Memória | Velocidade | Recomendado |
|--------|---------|------------|-------------|
| Base64 | ❌ Alta | ❌ Lenta | Não |
| URI + Filesystem | ✅ Baixa | ✅ Rápida | ✅ Sim |
| Chunks | ✅ Muito Baixa | ✅ Muito Rápida | ✅ Sim (arquivos grandes) |
| Web Workers | ✅ Baixa | ✅ Rápida | ✅ Sim (processamento pesado) |

## 🎯 Implementação Recomendada

1. **Fotos pequenas (<5MB):** Usar URI + Filesystem
2. **Fotos grandes (>5MB):** Usar URI + Filesystem + Web Worker
3. **Vídeos:** Usar input file + processar em chunks
4. **Upload:** Usar streaming/chunks para arquivos >50MB

## ⚠️ Considerações

- URI requer permissões de Filesystem
- Chunks requerem mais código mas melhor performance
- Web Workers não podem acessar DOM
- Streaming requer suporte do servidor

