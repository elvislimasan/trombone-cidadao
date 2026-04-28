# Xcode Cloud: primeiro acesso com Mac emprestado → depois só nuvem (sem Mac)

Este tutorial é para o seu projeto **Capacitor + Vite/React**, com:

- `appId`: `com.trombonecidadao.app`
- `webDir`: `dist`

em [capacitor.config.ts](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/capacitor.config.ts#L5-L19).

Objetivo:

1) Usar um **Mac emprestado** apenas para o “bootstrap” (Xcode + assinatura + Xcode Cloud)  
2) A partir daí, gerar builds e enviar para TestFlight/App Store **somente pelo Xcode Cloud**

## 1) O que você precisa saber (sem surpresas)

- Para publicar/TestFlight você precisa do **Apple Developer Program** (US$ 99/ano). https://developer.apple.com/programs/
- Para usar **Xcode Cloud**, você configura workflows **dentro do Xcode** (no Mac) pelo menos uma vez. https://developer.apple.com/xcode-cloud/get-started/
- O Apple Developer Program inclui **25 compute hours/mês** de Xcode Cloud e há planos pagos se passar disso. https://developer.apple.com/xcode-cloud/get-started/

## 2) Checklist antes de pegar o Mac emprestado

- Você já tem:
  - Apple Account com 2FA
  - Apple Developer Program ativo
  - Acesso ao App Store Connect (permissões de App Manager/Admin)
- Tenha em mãos:
  - Nome do app na loja
  - Bundle ID: `com.trombonecidadao.app`
  - SKU (ex.: `TROMBONECIDADAO001`)
  - URL da política de privacidade (mesmo que provisória, mas real)
- Recomendação de segurança (forte):
  - Use um **usuário separado** no macOS para esse trabalho (se o dono permitir)
  - Evite deixar seu Apple Account “logado” no navegador no final

## 3) Bootstrap no Mac emprestado (uma vez)

### 3.1 Instalar e preparar Xcode

1) Instale o Xcode (App Store)
2) Abra o Xcode uma vez e aceite termos
3) Rode:

```bash
xcode-select --install
sudo xcodebuild -license accept
```

### 3.2 Clonar o repo e instalar dependências

No diretório do projeto:

```bash
npm ci
```

Se aparecer erro de permissão/antivírus no Windows, ignore aqui — no Mac isso normalmente não ocorre.

### 3.3 Garantir que o iOS do Capacitor está no mesmo major do core (v7)

Seu projeto está em Capacitor v7. Instale o iOS no mesmo major:

```bash
npm i @capacitor/ios@^7.4.4
```

### 3.4 Gerar `ios/` e abrir no Xcode

```bash
npm run build
npx cap add ios
npx cap sync ios
npx cap open ios
```

Abra o workspace:

- `ios/App/App.xcworkspace`

### 3.5 Criar o app no App Store Connect (se ainda não existir)

App Store Connect → My Apps → “+” → New App:

- Bundle ID: `com.trombonecidadao.app`
- SKU: `TROMBONECIDADAO001` (ou similar)

### 3.6 Configurar assinatura no Xcode (uma vez)

No Xcode: Targets → App → Signing & Capabilities:

- Marque “Automatically manage signing”
- Selecione seu Team (Apple Developer)
- Confirme:
  - Bundle Identifier: `com.trombonecidadao.app`
  - Version (Marketing Version)
  - Build (incrementa a cada upload)

### 3.7 Capabilities e permissões (o mínimo para não travar)

Seu app tem plugins de câmera/mídia/notificações. No iOS, o review costuma exigir:

- `Info.plist` com textos de privacidade quando aplicável:
  - `NSCameraUsageDescription`
  - `NSPhotoLibraryUsageDescription` / `NSPhotoLibraryAddUsageDescription`
  - `NSMicrophoneUsageDescription` (se usar)
- Push Notifications (se você realmente for usar push no iOS):
  - Capability “Push Notifications”
  - Entitlements `aps-environment`

Recomendação: para o primeiro bootstrap, habilite apenas o que você vai usar imediatamente.

### 3.8 Primeiro Archive manual (smoke test)

Antes de configurar o Cloud, valide que o projeto arquiva localmente:

1) Selecione “Any iOS Device (arm64)”
2) Product → Archive

Se o Archive falhar, resolva agora. Isso economiza horas no Cloud.

## 4) Configurar Xcode Cloud (no Mac emprestado)

### 4.1 Conectar o repositório

No Xcode:

- Settings/Preferences → Accounts: confirme que seu Apple Account está adicionado
- No projeto: abra a área de Xcode Cloud e selecione o app do App Store Connect

O “Get started” oficial da Apple descreve que a configuração do workflow é feita no Xcode. https://developer.apple.com/xcode-cloud/get-started/

### 4.2 Criar um workflow para TestFlight

Crie um workflow com estas decisões:

- Trigger:
  - Manual (`workflow_dispatch` equivalente) e/ou
  - Push em branch `main` / tag `ios-v*` (como política de release)
- Actions do workflow:
  - Build + Archive
  - Upload para TestFlight (selecionar grupo de testers internos)

### 4.3 Script de CI (para Capacitor: build web + sync iOS)

No Xcode Cloud, o build precisa gerar `dist/` e sincronizar com o projeto iOS antes do Archive.

Crie este arquivo no repo:

- `ios/App/ci_scripts/ci_post_clone.sh`

Conteúdo sugerido:

```bash
#!/bin/sh
set -e

echo "Node:"
node -v || true

echo "Install JS deps"
npm ci

echo "Build web (dist)"
npm run build

echo "Sync Capacitor iOS"
npx cap sync ios

echo "Pods"
cd ios/App
pod install
```

Depois marque como executável:

```bash
chmod +x ios/App/ci_scripts/ci_post_clone.sh
```

Notas:

- Em alguns ambientes, `pod` pode não estar disponível por padrão; se acontecer, instale CocoaPods no Mac emprestado e rode novamente. Se o Xcode Cloud reclamar, você ajusta o script para instalar o CocoaPods conforme o ambiente permitir.
- O passo `npx cap sync ios` é o coração do Capacitor no CI: ele garante que o Archive use o conteúdo recém-buildado (`dist/`).

## 5) Depois do bootstrap: como usar só Xcode Cloud

Após tudo estar configurado, seu fluxo normal fica:

1) Você faz mudanças no projeto web (React/Vite)
2) Commit e push para a branch/tag definida no workflow
3) Xcode Cloud roda:
   - `npm ci`
   - `npm run build`
   - `npx cap sync ios`
   - Archive
   - Upload TestFlight
4) Você acompanha em App Store Connect → TestFlight

## 6) Submissão para App Store (sem Mac)

Depois que um build está em TestFlight e validado:

- App Store Connect → App Store → versão → selecione o build
- Metadados: descrição, screenshots, política de privacidade, “App Privacy”
- Submit for Review

## 7) “Deslogar e sair limpo” do Mac emprestado (recomendado)

Para não deixar rastros sensíveis:

- Remova o repo clonado (pasta do projeto)
- Xcode → Settings/Preferences → Accounts:
  - remova sua conta (se apropriado)
- Apague DerivedData (opcional):
  - `~/Library/Developer/Xcode/DerivedData`
- Não deixe arquivos `.p8`, `.mobileprovision` ou exports em Downloads/Desktop

## 8) Recomendações finais (segurança e manutenção)

- Variáveis de ambiente: só `VITE_*` devem ir para o bundle web; segredos ficam no servidor/Edge Functions e nunca no app.
- Capacitor config: evite manter múltiplos arquivos (`capacitor.config.ts/.js/.json`) para não gerar build divergente.

