# Configuração de Ambientes (Dev e Produção)

O app está configurado para detectar automaticamente o ambiente e usar a URL correta.

## Ambientes Configurados

### 1. **Desenvolvimento (Vercel)**
- URL: `https://trombone-cidadao.vercel.app`
- Uso: Ambiente de desenvolvimento/testes
- App Links: Configurado no AndroidManifest.xml

### 2. **Produção**
- URL: `https://trombonecidadao.com.br`
- Uso: Ambiente de produção
- App Links: Configurado no AndroidManifest.xml

### 3. **Localhost**
- URL: `http://localhost:3000` (ou porta configurada)
- Uso: Desenvolvimento local

## Como Funciona a Detecção Automática

O código detecta automaticamente o ambiente através de:

1. **Variável de Ambiente** (`VITE_APP_URL`):
   - Se configurada, usa essa URL (prioridade máxima)
   - Configurar no Vercel: Settings → Environment Variables

2. **Detecção pelo Domínio**:
   - Se a URL contém `trombone-cidadao.vercel.app` → usa Vercel
   - Se a URL contém `trombonecidadao.com.br` → usa produção
   - Se a URL contém `localhost` → usa localhost

3. **App Nativo (Capacitor)**:
   - Sempre usa `https://trombonecidadao.com.br` (produção)
   - Isso garante que links compartilhados do app sempre apontem para produção

## Configurar Variável de Ambiente no Vercel

### Para Ambiente de Desenvolvimento:

1. Acesse: [Vercel Dashboard](https://vercel.com/dashboard)
2. Selecione o projeto
3. Vá em **Settings** → **Environment Variables**
4. Adicione:
   - **Name**: `VITE_APP_URL`
   - **Value**: `https://trombone-cidadao.vercel.app`
   - **Environment**: Development, Preview, Production (ou apenas Development)

### Para Ambiente de Produção:

1. No mesmo local (Environment Variables)
2. Adicione:
   - **Name**: `VITE_APP_URL`
   - **Value**: `https://trombonecidadao.com.br`
   - **Environment**: Production

## App Links (Deep Links)

O AndroidManifest.xml está configurado para aceitar links de **ambos os ambientes**:

```xml
<!-- Vercel (Dev) -->
<data 
    android:scheme="https"
    android:host="trombone-cidadao.vercel.app"
    android:pathPrefix="/bronca" />

<!-- Produção -->
<data 
    android:scheme="https"
    android:host="trombonecidadao.com.br"
    android:pathPrefix="/bronca" />
```

## assetlinks.json

O arquivo `assetlinks.json` precisa estar acessível em **ambos os domínios**:

1. **Vercel (Dev)**: `https://trombone-cidadao.vercel.app/.well-known/assetlinks.json`
2. **Produção**: `https://trombonecidadao.com.br/.well-known/assetlinks.json`

### Como Garantir que Funciona em Ambos:

1. O arquivo está em `public/.well-known/assetlinks.json`
2. No deploy da Vercel, ele será servido automaticamente
3. No servidor de produção, certifique-se de que a pasta `.well-known` está acessível

### Verificar se está Acessível:

**Vercel:**
```bash
curl https://trombone-cidadao.vercel.app/.well-known/assetlinks.json
```

**Produção:**
```bash
curl https://trombonecidadao.com.br/.well-known/assetlinks.json
```

Ambos devem retornar o JSON com o SHA256 fingerprint.

## Arquivos que Usam Detecção de Ambiente

- `src/components/DynamicSeo.jsx`
- `src/components/ReportDetails.jsx`
- `src/pages/ReportPage.jsx`
- `src/App.jsx`

Todos usam a mesma lógica de detecção automática.

## Testar Detecção de Ambiente

### No Navegador:

1. Acesse `https://trombone-cidadao.vercel.app` → deve usar Vercel
2. Acesse `https://trombonecidadao.com.br` → deve usar produção
3. Acesse `http://localhost:3000` → deve usar localhost

### No App Nativo:

- Sempre usa `https://trombonecidadao.com.br` (produção)
- Isso garante consistência nos links compartilhados

## Notas Importantes

1. **App Nativo**: Sempre usa produção para garantir que links compartilhados funcionem corretamente
2. **Variável de Ambiente**: Tem prioridade sobre detecção automática
3. **App Links**: Funcionam em ambos os ambientes (Vercel e produção)
4. **assetlinks.json**: Deve estar acessível em ambos os domínios

