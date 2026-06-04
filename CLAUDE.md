# Diretrizes do projeto — Trombone Cidadão

## Stack
- React 18 + Vite + Tailwind CSS
- Capacitor (Android + iOS)
- Supabase (Postgres, Auth, Storage, Realtime, Edge Functions)
- Plugin nativo customizado: `VideoProcessor` (Android-only — `src/plugins/`)

---

## Regra obrigatória: suporte Android **e** iOS em todo código Capacitor

Qualquer funcionalidade que use plugins ou APIs nativas **deve funcionar nos dois sistemas operacionais**. Nunca escreva código nativo que funcione só em uma plataforma sem tratar o fallback da outra.

### Checklist obrigatório ao usar Capacitor

#### 1. Verificar disponibilidade antes de chamar plugin
```js
// CORRETO
if (Capacitor.isPluginAvailable('VideoProcessor')) {
  await VideoProcessor.capturePhoto(...)
} else {
  // fallback iOS / web
  await CapCamera.getPhoto(...)
}

// ERRADO — quebra no iOS onde VideoProcessor não existe
await VideoProcessor.capturePhoto(...)
```

#### 2. Câmera — fluxo correto por plataforma

| Plataforma | Plugin | Motivo |
|---|---|---|
| Android | `VideoProcessor.capturePhoto()` | Inicia `KeepAliveService` (Foreground Service) que impede o Android de matar o processo enquanto a câmera está aberta |
| iOS | `CapCamera.getPhoto({ source: CameraSource.Camera })` | Apresenta picker como sheet nativo; não pausa o processo JS |
| Web | `<input type="file" capture="environment">` | Fallback browser |

**Nunca use `<input capture="environment">` como solução principal no app nativo** — no Android, abre um Intent separado que pausa a Activity e pode perder o estado do modal.

#### 3. Recuperação de foto após OOM kill (Android)
O `App.addListener('appRestoredResult', ...)` global em `App.jsx` já trata o caso em que o Android mata e restaura o app. Componentes individuais devem também registrar o listener para tratar recuperação de estado local:

```js
useEffect(() => {
  if (!Capacitor.isNativePlatform()) return;
  let handle = null;
  App.addListener('appRestoredResult', async (data) => {
    const isCameraResult =
      (data.pluginId === 'VideoProcessor' && data.methodName === 'capturePhoto') ||
      (data.pluginId === 'Camera' && (data.methodName === 'getPhoto' || data.methodName === 'pickImages'));
    if (isCameraResult && data.success && data.data) {
      const rawPath = data.data.filePath || data.data.path || data.data.webPath;
      if (rawPath) { /* processar */ }
    }
  }).then(h => { handle = h; });
  return () => handle?.remove();
}, []);
```

#### 4. Caminhos de arquivo nativos — normalização correta

Paths retornados pelos plugins variam por plataforma:

| Origem | Formato | Como tratar |
|---|---|---|
| Android VideoProcessor | `/data/user/0/...` (absoluto) | `Capacitor.convertFileSrc(path)` |
| Android CapCamera `path` | `/data/user/0/...` | `Capacitor.convertFileSrc(path)` |
| Android CapCamera `webPath` | `capacitor://localhost/...` | Usar diretamente |
| iOS CapCamera `path` | `/var/mobile/...` | `Capacitor.convertFileSrc(path)` |
| iOS CapCamera `webPath` | `capacitor://localhost/...` | Usar diretamente |

Regra geral — nunca chame `convertFileSrc` em um path que já começa com `capacitor://`:
```js
const toWebUrl = (p) => {
  if (p.startsWith('capacitor://') || p.startsWith('blob:') || p.startsWith('http')) return p;
  return Capacitor.convertFileSrc(p.startsWith('file://') ? p.replace('file://', '') : p);
};
```

#### 5. Preview vs. Upload — não fazer fetch imediato após captura

O servidor HTTP do Capacitor pode não ter o arquivo disponível imediatamente após a câmera retornar.

```
// CORRETO — igual ao ReportModal
preview = toWebUrl(thumbnailPath)   // para <img src>, funciona sem fetch
// fetch para File acontece só no momento do upload (segundos depois)

// ERRADO — falha de timing
const blob = await fetch(toWebUrl(path)).then(r => r.blob())  // logo após capturePhoto
```

#### 6. Compressão de imagens

| Plataforma | Método | Motivo |
|---|---|---|
| Android | `VideoProcessor.compressImage({ filePath, maxWidth, maxSizeMB, format: 'jpeg' })` | Compressão nativa sem OOM, suporta fotos 50MP+ |
| iOS | Sem compressão nativa (VideoProcessor Android-only) | CapCamera já limita resolução via `quality` e `width`/`height` |
| Web | Canvas + `toBlob('image/jpeg', 0.75)` | Fallback browser |

#### 7. Galeria

- **Android e iOS**: `CapCamera.getPhoto({ source: CameraSource.Photos, resultType: CameraResultType.Uri })`
- Preferir `photo.path` sobre `photo.webPath` como entrada para `processNativePath` — path nativo é mais robusto para `convertFileSrc`
- **Web**: `<input type="file" accept="image/*" multiple>`

#### 8. Permissões

Sempre solicitar permissões explicitamente antes de abrir câmera/galeria no Capacitor:
```js
// Já tratado internamente pelo CapCamera plugin ao chamar getPhoto
// Para VideoProcessor.capturePhoto, a permissão de câmera é verificada no plugin Kotlin
```

---

## Plugin VideoProcessor (Android-only)

Localização: `src/plugins/` (JS) + `android/app/src/main/java/.../VideoProcessorPlugin.kt`

Métodos relevantes:
- `capturePhoto()` — abre câmera nativa, inicia `KeepAliveService` automaticamente
- `compressImage({ filePath, maxWidth, maxHeight, maxSizeMB, quality, format })` — compressão nativa segura para fotos grandes
- `recoverLostPhoto()` — recupera path de foto perdida via SharedPreferences
- `uploadFile()` — upload em background com progresso

**Não existe equivalente iOS** — sempre usar `Capacitor.isPluginAvailable('VideoProcessor')` antes de chamar.

---

## Estrutura de arquivos relevante

```
src/
  components/
    report/
      ReportUpdateModal.jsx   # Modal de atualização de bronca
    ReportModal.jsx           # Modal de criação de bronca (referência de padrões nativos)
    CameraCapture.jsx         # Componente de câmera in-app (Android)
  plugins/
    VideoProcessor.ts         # Registro do plugin nativo
    definitions.ts            # Interface TypeScript do plugin
  pages/
    ReportPage.jsx            # Página de detalhe da bronca
    admin/
      ModerationPage.jsx      # Moderação de conteúdo (broncas, atualizações, etc.)
  App.jsx                     # Listener global de appRestoredResult
android/
  app/src/main/java/.../
    VideoProcessorPlugin.kt   # Plugin nativo Android
    KeepAliveService.java     # Foreground Service para manter processo vivo durante câmera
```
