# Publicar iOS na App Store com Mac físico (Xcode) — Trombone Cidadão

Este projeto é um app web (Vite/React) empacotado com **Capacitor**. No seu código, o app está identificado como:

- `appId`: `com.trombonecidadao.app`
- `appName`: `Trombone Cidadão`
- `webDir`: `dist`

em [capacitor.config.ts](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/capacitor.config.ts#L5-L19).

O fluxo padrão para App Store é:

1) build web (`dist/`)  
2) sync do Capacitor (`ios/`)  
3) Xcode Archive  
4) upload para TestFlight  
5) submissão para App Store

## 1) Custos

- **Apple Developer Program**: **US$ 99/ano** (obrigatório para TestFlight e App Store). Fonte: https://developer.apple.com/programs/
- **Mac físico**: custo varia (você já tem). Sem CI, não há custo extra recorrente de build.

## 2) Pré-requisitos

- Apple Developer Program ativo (com 2FA no Apple Account).
- Acesso ao App Store Connect (permissões de criar app/versões/builds).
- Xcode instalado no Mac (pela App Store) e aberto ao menos 1 vez para aceitar termos.

## 3) Preparar o App Store Connect (uma vez)

### 3.1 Criar o app no App Store Connect

1) App Store Connect → My Apps → “+” → New App  
2) Preencha:
   - Name
   - Primary language
   - SKU (ex.: `TROMBONECIDADAO001`)
   - Bundle ID: **`com.trombonecidadao.app`**

### 3.2 Conferir o Bundle ID no Apple Developer

No Apple Developer (Certificates, Identifiers & Profiles):

- Identifiers → App IDs → confirme que existe um App ID para `com.trombonecidadao.app`
- Habilite capabilities somente se você for usar (ex.: Push Notifications)

## 4) Preparar o Mac (uma vez)

### 4.1 Xcode e Command Line Tools

```bash
xcode-select --install
sudo xcodebuild -license accept
```

### 4.2 Node e dependências do projeto

O projeto é orientado a npm (`package-lock.json`). No diretório do repo:

```bash
npm ci
```

## 5) Garantir Capacitor iOS no mesmo major (v7)

Seu projeto usa **Capacitor v7** (por exemplo `@capacitor/core@^7.4.4` em [package.json](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/package.json#L38-L56)).

Instale o iOS no mesmo major:

```bash
npm i @capacitor/ios@^7.4.4
```

## 6) Gerar `ios/` e sincronizar o web bundle

No root do projeto:

```bash
npm run build
npx cap add ios
npx cap sync ios
npx cap open ios
```

Isso cria a pasta `ios/` e abre o projeto no Xcode.

## 7) Configurar no Xcode (assinatura + versões)

No Xcode, abra:

- `ios/App/App.xcworkspace`

Em Targets → App → Signing & Capabilities:

- Marque “Automatically manage signing”
- Selecione o “Team” (sua conta Apple Developer)
- Confirme:
  - Bundle Identifier: `com.trombonecidadao.app`
  - Version (Marketing Version): ex.: `1.0.3`
  - Build: ex.: `1` (incrementar a cada upload)

## 8) Permissões e capabilities (iOS)

Seu app usa plugins como câmera/mídia/notificações. No iOS isso normalmente implica:

### 8.1 Info.plist (mensagens de privacidade)

Garanta que existam descrições claras no `Info.plist` quando aplicável:

- `NSCameraUsageDescription`
- `NSPhotoLibraryUsageDescription` / `NSPhotoLibraryAddUsageDescription`
- `NSMicrophoneUsageDescription` (se gravar áudio)
- `NSLocationWhenInUseUsageDescription` (se usar localização)

### 8.2 Push Notifications (se for usar no iOS)

- Habilite capability “Push Notifications” no Xcode
- Confirme APNs habilitado no App ID no Apple Developer
- Verifique entitlements (`aps-environment`) gerado pelo Xcode

## 9) Archive e Upload para TestFlight

1) No Xcode, selecione destino “Any iOS Device (arm64)” (não simulador)  
2) Product → Archive  
3) Organizer → Distribute App  
4) App Store Connect → Upload

Depois, no App Store Connect:

- TestFlight → aguarde “Processing”
- Teste com testers internos

## 10) Submeter para App Store

No App Store Connect → App Store:

- Preencha metadados da versão:
  - descrição
  - screenshots (tamanhos exigidos)
  - classificação indicativa
  - URL de política de privacidade
  - “App Privacy” (questionário de dados)
- Selecione o build enviado no TestFlight para a versão
- Submit for Review

## 11) Checklist rápido (erros mais comuns)

- Tela branca no app:
  - rode `npm run build` antes do `npx cap sync ios`
  - confirme `webDir: dist` no Capacitor
- Erro de assinatura:
  - Team não selecionado no Xcode
  - Bundle ID do Xcode diferente do App Store Connect
- Upload falha:
  - Build number repetido (incrementar “Build” no Xcode)
  - App ainda não criado no App Store Connect

## 12) Recomendações finais (segurança e manutenção)

- Segredos ficam apenas no `.env` local e nunca no código (o bundle web só deve receber variáveis públicas).
- Se você for automatizar depois (CI/TestFlight), use App Store Connect API Key e GitHub Secrets.

