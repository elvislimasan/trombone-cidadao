# 📱 Publicação na App Store — Trombone Cidadão

Tutorial completo para levar o app **Trombone Cidadão** (Capacitor 7 / React) que já está na **Play Store** para a **App Store** da Apple.

> **Cenário do autor**: Mac emprestado para a configuração inicial, e depois usar apenas o **Xcode Cloud** para builds futuros sem precisar do Mac toda vez.

---

## 📋 Sumário

1. [Visão geral e expectativas realistas](#1-visão-geral-e-expectativas-realistas)
2. [Pré-requisitos antes de pegar o Mac](#2-pré-requisitos-antes-de-pegar-o-mac)
3. [Conta Apple Developer (US$ 99/ano)](#3-conta-apple-developer-us-99ano)
4. [Configurar o projeto no Windows (antes de ir ao Mac)](#4-configurar-o-projeto-no-windows-antes-de-ir-ao-mac)
5. [No Mac: setup inicial do ambiente](#5-no-mac-setup-inicial-do-ambiente)
6. [Adicionar a plataforma iOS ao Capacitor](#6-adicionar-a-plataforma-ios-ao-capacitor)
7. [Configurar Info.plist (permissões obrigatórias)](#7-configurar-infoplist-permissões-obrigatórias)
8. [Ícones e Splash Screen](#8-ícones-e-splash-screen)
9. [Push Notifications (Firebase + APNs)](#9-push-notifications-firebase--apns)
10. [Sign in with Apple (obrigatório se usa login social)](#10-sign-in-with-apple-obrigatório-se-usa-login-social)
11. [Universal Links (deep links iOS)](#11-universal-links-deep-links-ios)
12. [Stripe e In-App Purchase: cuidado com a regra da Apple](#12-stripe-e-in-app-purchase-cuidado-com-a-regra-da-apple)
13. [Bundle ID, Capabilities e Signing no Xcode](#13-bundle-id-capabilities-e-signing-no-xcode)
14. [Primeiro build local e teste no simulador / iPhone físico](#14-primeiro-build-local-e-teste-no-simulador--iphone-físico)
15. [App Store Connect: criar o app e preencher metadados](#15-app-store-connect-criar-o-app-e-preencher-metadados)
16. [Privacy Nutrition Labels e App Privacy Report](#16-privacy-nutrition-labels-e-app-privacy-report)
17. [Subir o primeiro build via Xcode (Archive)](#17-subir-o-primeiro-build-via-xcode-archive)
18. [TestFlight: testes internos e externos](#18-testflight-testes-internos-e-externos)
19. [Submissão para revisão da App Store](#19-submissão-para-revisão-da-app-store)
20. [Configurar Xcode Cloud (libertando você do Mac)](#20-configurar-xcode-cloud-libertando-você-do-mac)
21. [Fluxo de release recorrente sem Mac](#21-fluxo-de-release-recorrente-sem-mac)
22. [O que ainda exige Mac (e como contornar)](#22-o-que-ainda-exige-mac-e-como-contornar)
23. [Troubleshooting comum](#23-troubleshooting-comum)
24. [Checklist final](#24-checklist-final)

---

## 1. Visão geral e expectativas realistas

**Realidade dura primeiro:**

- Para publicar **a primeira vez** na App Store, você **precisa de um Mac** (com Xcode). Não tem como pular.
- Depois do primeiro build subindo, você consegue **na maior parte do tempo** trabalhar só no Windows + Xcode Cloud. Mas **mudanças nativas** (novos plugins Capacitor, alterar `Info.plist`, capabilities, ícones) idealmente são feitas no Xcode — embora dê para editar manualmente os arquivos no Windows e testar via Xcode Cloud.
- O ciclo de aprovação da Apple é **mais rigoroso** que o do Google. A primeira submissão costuma ser rejeitada 1-2 vezes. **Isso é normal.**
- Custo: **US$ 99/ano** (Apple Developer Program). Não tem como fugir disso.

**Tempo estimado realista:**

| Etapa | Tempo |
|---|---|
| Criar conta Apple Developer | 1-3 dias (verificação de identidade) |
| Setup inicial no Mac (do zero ao primeiro build no TestFlight) | 4-8 horas |
| Preencher metadados no App Store Connect | 2-4 horas |
| Tirar screenshots e gravar prévia | 2-4 horas |
| Revisão da Apple (primeira vez) | 24-48h, podendo ser rejeitada |
| Total realista até estar publicado | **5-15 dias** |

**Bundle ID atual**: `com.trombonecidadao.app` (será o mesmo no iOS — coerência entre plataformas é boa prática).

---

## 2. Pré-requisitos antes de pegar o Mac

Adiantar isso te economiza horas de tempo emprestado do Mac.

### 2.1. Documentos pessoais
- [ ] CPF ativo (não inscrito em irregularidades)
- [ ] Documento com foto válido
- [ ] Cartão de crédito internacional (Visa/Master) com US$ 99 disponíveis
- [ ] Conta Apple ID (iCloud) já criada e com **autenticação de dois fatores ativa** (obrigatória)

### 2.2. Decisão: pessoa física ou jurídica?

| Opção | Como aparece na loja | Burocracia |
|---|---|---|
| **Individual** | Seu nome completo legal | Simples — só CPF e cartão |
| **Organization** | Nome da empresa | Precisa de **D-U-N-S Number** (gratuito, leva 5-14 dias) e CNPJ ativo |

**Recomendação para o Trombone Cidadão**: se já tem CNPJ e quer aparecer como "Trombone Cidadão" na loja, vá de **Organization**. Se for solo, **Individual** é muito mais rápido.

### 2.3. Solicitar D-U-N-S (somente se Organization)
- Site: https://developer.apple.com/enroll/duns-lookup/
- Use o CNPJ. Se não houver, a Apple solicita um — **gratuito**.
- Demora de 5 a 14 dias úteis. **Inicie isso ANTES de pegar o Mac.**

### 2.4. Materiais que você vai precisar produzir
- [ ] Política de Privacidade pública (URL acessível) — você já tem: `https://trombonecidadao.com.br/termos-de-uso`
- [ ] Termos de Uso (URL pública)
- [ ] Ícone do app em **1024×1024 px PNG sem transparência, sem cantos arredondados** (a Apple aplica o arredondamento)
- [ ] Screenshots para cada tamanho exigido (ver seção 15.2)
- [ ] Descrição curta (até 30 caracteres — "subtítulo")
- [ ] Descrição longa (até 4000 caracteres)
- [ ] Palavras-chave (até 100 caracteres separados por vírgula)
- [ ] Categoria principal e secundária da App Store
- [ ] E-mail de suporte e URL de marketing

---

## 3. Conta Apple Developer (US$ 99/ano)

### 3.1. Criar Apple ID (se ainda não tem)
1. Acesse https://appleid.apple.com
2. Use um e-mail **que você usará para sempre** para esse app — trocar depois é doloroso
3. **Ative autenticação de dois fatores** (obrigatório para Developer Program)

### 3.2. Inscrever no Apple Developer Program
1. Acesse https://developer.apple.com/programs/enroll/
2. Faça login com o Apple ID
3. Escolha Individual ou Organization
4. Pague US$ 99
5. Aguarde aprovação:
   - **Individual**: geralmente em horas (até 48h)
   - **Organization**: 1-7 dias após D-U-N-S aprovado

### 3.3. Aceitar contratos no App Store Connect
Depois de aprovado, acesse https://appstoreconnect.apple.com e:
- [ ] Aceite o **Apple Developer Program License Agreement**
- [ ] Vá em **Agreements, Tax, and Banking** e preencha **TODOS** os formulários:
  - Tax forms (W-8BEN para brasileiros — tem campos sobre tratado de bitributação Brasil-EUA)
  - Bank account (conta para receber pagamentos, mesmo que app seja gratuito)
  - Contact info

> ⚠️ **Sem esses formulários preenchidos, seu app NÃO pode ser publicado**, mesmo gratuito. Esse é um dos motivos #1 de bloqueio na hora de submeter.

---

## 4. Configurar o projeto no Windows (antes de ir ao Mac)

Tudo aqui você faz no seu PC normal. Quanto mais adiantado, menos tempo de Mac.

### 4.1. Validar `capacitor.config.ts`

Abra [capacitor.config.ts](../capacitor.config.ts) e confirme:

```ts
appId: 'com.trombonecidadao.app',  // ✅ mesmo bundle ID do Android
appName: 'Trombone Cidadão',
webDir: 'dist',
ios: {
  contentInset: 'automatic'
}
```

Tem dois arquivos `capacitor.config.*` no projeto: [capacitor.config.ts](../capacitor.config.ts) e [capacitor.config.json](../capacitor.config.json). O Capacitor prioriza o `.ts` quando existir. **Mantenha apenas um** para evitar drift de configuração — sugiro deletar o `.json` e o `.js` redundante.

### 4.2. Build de produção limpo

```bash
npm run clean
npm run build
```

Confirme que `dist/` é gerado corretamente.

### 4.3. Preparar ícone 1024×1024 e splash

Crie a pasta `resources/` na raiz com:

```
resources/
├── icon-only.png        (1024x1024, sem transparência, sem cantos arredondados)
├── icon-foreground.png  (1024x1024)
├── icon-background.png  (1024x1024)
├── splash.png           (2732x2732)
└── splash-dark.png      (2732x2732)
```

Você já tem `@capacitor/assets` no `devDependencies`. Quando estiver no Mac, vai rodar:

```bash
npx capacitor-assets generate --ios
```

Isso gera automaticamente todos os tamanhos de ícone e splash exigidos pela Apple.

### 4.4. Adicione `ios/` ao `.gitignore`? **NÃO.**

Diferente do Android, a pasta `ios/` (especialmente o `ios/App/App.xcodeproj`) **deve ser commitada** no Git. Isso é essencial para o **Xcode Cloud** funcionar — ele lê o projeto direto do GitHub.

Se houver `.gitignore` ignorando `ios/`, remova essa linha **antes** de criar a pasta no Mac.

---

## 5. No Mac: setup inicial do ambiente

### 5.1. Instalar Xcode
1. Abra a **App Store** no Mac
2. Procure por **Xcode** e instale (~15GB, demora bastante)
3. Após instalar, abra o Xcode uma vez para aceitar a licença
4. No terminal:
   ```bash
   sudo xcode-select --install
   sudo xcodebuild -license accept
   ```

### 5.2. Instalar dependências
```bash
# Homebrew (se não tem)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Node (a mesma versão que você usa no Windows — confira com `node -v`)
brew install node@20

# CocoaPods (gerenciador de dependências nativas iOS)
sudo gem install cocoapods
# OU
brew install cocoapods
```

### 5.3. Clonar o repositório
```bash
git clone <seu-repo>
cd horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04
npm install
```

### 5.4. Login no Xcode com Apple ID
1. Abra o Xcode → **Settings** (Cmd+,) → **Accounts**
2. Clique no `+` e adicione seu Apple ID (o do Developer Program)
3. Selecione a conta e clique em **Manage Certificates** para confirmar que aparece um certificado **Apple Development**

---

## 6. Adicionar a plataforma iOS ao Capacitor

### 6.1. Build + Add iOS

```bash
npm run build
npx cap add ios
```

Isso cria a pasta `ios/` com:
```
ios/
└── App/
    ├── App.xcodeproj/           ← projeto Xcode
    ├── App.xcworkspace/         ← workspace (sempre abra ESTE, não o .xcodeproj)
    ├── App/
    │   ├── Info.plist           ← permissões e config
    │   ├── AppDelegate.swift
    │   ├── Assets.xcassets/     ← ícones e splash
    │   └── public/              ← cópia do dist/
    ├── Podfile
    └── Pods/                    ← criado após pod install
```

### 6.2. Sync inicial

```bash
npx cap sync ios
```

Isso copia o `dist/` para `ios/App/App/public` e instala todos os pods (plugins nativos do Capacitor).

### 6.3. Abrir no Xcode

```bash
npx cap open ios
```

> ⚠️ **NUNCA abra `App.xcodeproj` direto** — sempre `App.xcworkspace`. O `cap open ios` já faz certo.

---

## 7. Configurar Info.plist (permissões obrigatórias)

A Apple **rejeita** o app se você usar uma capability sem string explicando o motivo. Como o Trombone Cidadão usa câmera, microfone, fotos, geolocalização e notificações, **todas essas chaves abaixo são obrigatórias.**

Edite [ios/App/App/Info.plist](../ios/App/App/Info.plist) (ou pelo Xcode, no editor visual de plist) e adicione:

```xml
<!-- CÂMERA (foto e vídeo de denúncias) -->
<key>NSCameraUsageDescription</key>
<string>O Trombone Cidadão usa a câmera para você fotografar e gravar vídeos de problemas urbanos a serem denunciados.</string>

<!-- MICROFONE (gravação de vídeo) -->
<key>NSMicrophoneUsageDescription</key>
<string>O microfone é usado para gravar áudio junto com vídeos de denúncias.</string>

<!-- FOTOS (anexar fotos da galeria) -->
<key>NSPhotoLibraryUsageDescription</key>
<string>Permita acesso para anexar fotos da galeria às suas denúncias.</string>

<!-- SALVAR FOTOS -->
<key>NSPhotoLibraryAddUsageDescription</key>
<string>O app salva imagens da denúncia em sua galeria após o registro.</string>

<!-- LOCALIZAÇÃO (localizar a denúncia) -->
<key>NSLocationWhenInUseUsageDescription</key>
<string>Sua localização é usada para identificar onde está o problema reportado.</string>

<!-- LOCALIZAÇÃO EM SEGUNDO PLANO (só se realmente usa — caso contrário REMOVA) -->
<!--
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>...</string>
-->

<!-- CONTATOS (só se usa) — REMOVA se não tiver -->

<!-- ATS: permitir HTTP em desenvolvimento (REMOVA antes de submeter à App Store) -->
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <false/>
</dict>
```

> ⚠️ **Linguagem das mensagens importa**. Mensagens genéricas tipo "Acesso à câmera" são causa comum de rejeição. Seja específico sobre o **motivo concreto** dentro do app. As mensagens acima estão prontas para o contexto do Trombone Cidadão.

### 7.1. Background Modes

Como o app tem `UploadService` e `KeepAliveService` no Android, no iOS você precisa habilitar **Background Modes**:

1. No Xcode → projeto **App** → target **App** → aba **Signing & Capabilities**
2. Clique em **+ Capability** → adicione:
   - **Background Modes**
     - ✅ **Remote notifications** (push em background)
     - ✅ **Background fetch** (apenas se você sincroniza periodicamente)
     - ❌ NÃO marque "Background processing" sem necessidade real — Apple revisa estritamente
   - **Push Notifications**
3. Isso vai adicionar automaticamente as chaves no `Info.plist` e criar/atualizar o `App.entitlements`.

---

## 8. Ícones e Splash Screen

### 8.1. Gerar automaticamente

Com `resources/icon-only.png` (1024×1024) e `resources/splash.png` (2732×2732) preparados:

```bash
npx capacitor-assets generate --ios
```

Isso atualiza:
- `ios/App/App/Assets.xcassets/AppIcon.appiconset/` — ícones em todos os tamanhos
- `ios/App/App/Assets.xcassets/Splash.imageset/` — splash universal

### 8.2. Validar

No Xcode, abra `Assets.xcassets` → `AppIcon` e confirme que **TODOS os slots estão preenchidos**, incluindo o **1024×1024 (App Store)**. Slot vazio = rejeição automática no upload.

---

## 9. Push Notifications (Firebase + APNs)

Como o app já usa **Firebase Cloud Messaging (FCM)** no Android, mantenha a mesma stack no iOS — é mais fácil que migrar pra Apple Push diretamente.

### 9.1. Adicionar app iOS ao Firebase Console

1. Acesse https://console.firebase.google.com
2. Selecione o projeto do Trombone Cidadão (mesmo do Android)
3. Adicionar app → **iOS**
4. Bundle ID: `com.trombonecidadao.app`
5. Baixe o `GoogleService-Info.plist`

### 9.2. Adicionar `GoogleService-Info.plist` ao Xcode

1. Arraste `GoogleService-Info.plist` para a pasta `ios/App/App/` **dentro do Xcode** (não no Finder)
2. Marque ✅ **Copy items if needed** e ✅ target **App**
3. Verifique no Xcode se aparece em **Project Navigator** dentro de `App/`

### 9.3. Gerar Chave de Autenticação APNs (recomendado vs certificado)

1. https://developer.apple.com/account → **Certificates, IDs & Profiles** → **Keys**
2. **+** → nome "FCM APNs Key" → marque **Apple Push Notifications service (APNs)**
3. Continue → Register → **Download .p8** (você só pode baixar UMA vez)
4. Anote o **Key ID** e seu **Team ID** (canto superior direito do Developer Portal)

### 9.4. Subir a chave APNs no Firebase

1. Firebase Console → ⚙ Project Settings → **Cloud Messaging**
2. Em **Apple app configuration** → upload do `.p8`, Key ID e Team ID
3. Salve

### 9.5. Configurar AppDelegate.swift

Edite `ios/App/App/AppDelegate.swift`. O Capacitor já gera quase tudo, mas confirme que tem:

```swift
import UIKit
import Capacitor
import Firebase

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        FirebaseApp.configure()
        return true
    }

    // ... resto que o Capacitor gerou (não mexer)
}
```

Adicione Firebase ao `Podfile`:

```ruby
target 'App' do
  capacitor_pods
  pod 'Firebase/Messaging'
end
```

E rode:
```bash
cd ios/App && pod install && cd ../..
```

### 9.6. Plugin Capacitor de Push Notifications

Você já tem `@capacitor/push-notifications` no [package.json](../package.json:53). O plugin já lida com o token APNs — não precisa código nativo extra.

---

## 10. Sign in with Apple (obrigatório se usa login social)

> ⚠️ **Regra da Apple (App Store Review Guideline 4.8)**: se seu app oferece login com Google, Facebook, ou outro provedor terceirizado, você é **obrigado a oferecer Sign in with Apple também**.

### 10.1. Verificar se aplica
Pelo [AndroidManifest.xml](../android/app/src/main/AndroidManifest.xml#L57), o app tem callback de login social. Confirme com `git grep` no projeto se há login Google/Facebook ativo.

### 10.2. Implementação
Use o plugin community: [`@capacitor-community/apple-sign-in`](https://github.com/capacitor-community/apple-sign-in).

```bash
npm install @capacitor-community/apple-sign-in
npx cap sync ios
```

No Xcode → **Signing & Capabilities** → **+ Capability** → **Sign in with Apple**.

No Supabase: Authentication → Providers → **Apple** → habilitar e preencher Service ID, Team ID, Key ID e a chave `.p8` (mesma que você gerou para APNs **NÃO**, é uma chave diferente — gere outra com escopo "Sign in with Apple").

> Se o app **não tem** login social terceiro, ignore esta seção inteira.

---

## 11. Universal Links (deep links iOS)

O app tem deep links no Android para `trombonecidadao.com.br/bronca/...`. Para funcionar igual no iOS, você precisa de **Universal Links**.

### 11.1. Habilitar Associated Domains no Xcode

1. **Signing & Capabilities** → **+ Capability** → **Associated Domains**
2. Adicione:
   - `applinks:trombonecidadao.com.br`
   - `applinks:trombone-cidadao.vercel.app`

### 11.2. Servir `apple-app-site-association`

No servidor de produção, sirva o arquivo em **AMBAS** as URLs (sem extensão, content-type `application/json`):

- `https://trombonecidadao.com.br/.well-known/apple-app-site-association`
- `https://trombone-cidadao.vercel.app/.well-known/apple-app-site-association`

Conteúdo:
```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAMID.com.trombonecidadao.app",
        "paths": ["/bronca/*"]
      }
    ]
  }
}
```

Substitua `TEAMID` pelo seu Team ID (ex: `ABC1234XYZ`). **Sem extensão `.json`** no nome do arquivo, content-type `application/json`, sem redirect.

Validar com: https://branch.io/resources/aasa-validator/

### 11.3. URL scheme custom

O Android usa `trombonecidadao://bronca/[ID]`. No iOS, configure em **Info.plist**:

```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>trombonecidadao</string>
            <string>com.trombonecidadao.app</string>
        </array>
    </dict>
</array>
```

---

## 12. Stripe e In-App Purchase: cuidado com a regra da Apple

> ⚠️ **Regra crítica (Guideline 3.1.1)**: se seu app vende **conteúdo digital ou funcionalidades dentro do app** (ex: assinatura premium, conteúdo desbloqueável), a Apple **proíbe** Stripe e exige **In-App Purchase** com 30% de comissão (15% após o primeiro ano).

### 12.1. O que **PODE** usar Stripe no iOS
- ✅ Bens físicos (entrega de produtos)
- ✅ Serviços fora do mundo digital (consulta, assinatura de revista impressa)
- ✅ **Reader apps** específicos (após Reader App Entitlement)
- ✅ Doações para entidades sem fins lucrativos registradas

### 12.2. O que **NÃO PODE** usar Stripe e DEVE usar IAP
- ❌ Assinatura premium dentro do app
- ❌ Desbloqueio de features (relatórios PDF avançados, etc.)
- ❌ Compra de "selos", "badges", boost de denúncias

**Análise do seu caso**: o Trombone Cidadão tem `@stripe/stripe-js` e endpoint `create-payment-intent` (vide [package.json](../package.json:79)). **Você precisa decidir**:

| Você cobra por... | Solução |
|---|---|
| Doação para a ONG/causa | OK — pode usar Stripe **se for entidade certificada** ou Apple Pay para doações |
| Plano premium / assinatura no app | **OBRIGATÓRIO migrar para IAP** ou desabilitar pagamentos no iOS |
| Serviço externo (não digital) | OK — Stripe permitido |

> Se não tem certeza, **desabilite a tela de pagamento no build iOS** (via `Capacitor.getPlatform() === 'ios'`) e submeta a v1 sem essa feature. Estuda IAP depois com calma. **Tentar passar pagamento digital com Stripe é rejeição garantida na primeira revisão.**

---

## 13. Bundle ID, Capabilities e Signing no Xcode

### 13.1. No App Store Connect — criar App ID

1. https://developer.apple.com/account → **Identifiers** → **+**
2. **App IDs** → **App** → continue
3. Description: `Trombone Cidadão`
4. Bundle ID: **Explicit** → `com.trombonecidadao.app`
5. Capabilities a marcar:
   - ✅ Push Notifications
   - ✅ Sign in with Apple (se aplica)
   - ✅ Associated Domains
6. Continuar → Register

### 13.2. No Xcode — Signing automático

1. Selecione o projeto **App** → target **App** → aba **Signing & Capabilities**
2. ✅ **Automatically manage signing**
3. Team: selecione seu time do Developer Program
4. Bundle Identifier: `com.trombonecidadao.app`
5. O Xcode vai gerar:
   - Provisioning Profile (Development)
   - Certificado de assinatura

Se aparecer erro tipo "no profiles found", clique em **Try Again** ou vá em Settings → Accounts → Download Manual Profiles.

### 13.3. Aumentar Build Number e Version

Em **General** → **Identity**:
- Version: `1.0.3` (mesmo do Android, alinhado ao [package.json](../package.json:4))
- Build: `1` (este é o número que cresce a cada upload — TestFlight rejeita números repetidos)

---

## 14. Primeiro build local e teste no simulador / iPhone físico

### 14.1. Simulador

1. No Xcode, na barra superior, escolha um device → **iPhone 15 Pro** (ou qualquer recente)
2. Cmd+R (Run) — isso compila e abre o simulador
3. Teste:
   - [ ] App abre sem crash
   - [ ] Splash aparece e some
   - [ ] Login funciona
   - [ ] Câmera (no simulador, ela usa fotos fake — não há câmera real)
   - [ ] Geolocalização (use Debug → Location no simulador)

### 14.2. iPhone físico (RECOMENDADO antes de submeter)

1. Plugue o iPhone via USB
2. No iPhone: **Configurações** → **Privacidade e Segurança** → ativar **Modo Desenvolvedor**
3. Reinicie o iPhone, confirme o modo
4. No Xcode, selecione o iPhone como destino
5. Cmd+R
6. Na primeira execução, vai aparecer "Untrusted Developer" no iPhone → **Configurações** → **Geral** → **VPN e Gerenciamento** → confiar no perfil

Teste com TODAS as permissões reais: câmera real, fotos reais, GPS real, push real (envie um push do Firebase Console para validar).

### 14.3. Live reload (durante desenvolvimento futuro)

Você já tem `android:live` configurado. Para iOS:
```bash
npm run build && npx cap sync ios
npx cap run ios -l --external
```

---

## 15. App Store Connect: criar o app e preencher metadados

### 15.1. Criar registro do app
1. https://appstoreconnect.apple.com → **My Apps** → **+** → **New App**
2. Plataforma: iOS
3. Nome: **Trombone Cidadão** (até 30 caracteres, único na loja)
4. Idioma principal: **Portuguese (Brazil)**
5. Bundle ID: selecione o `com.trombonecidadao.app` que você criou na seção 13.1
6. SKU: qualquer string única — sugiro `trombonecidadao-ios-2026`
7. Acesso de usuário: Full Access

### 15.2. Screenshots obrigatórios

A Apple exige screenshots para **pelo menos** estas dimensões:

| Tamanho | Quando | Quantidade |
|---|---|---|
| **6.9"** (iPhone 16 Pro Max) — 1290×2796 | Obrigatório | 3-10 |
| **6.5"** (iPhone 11 Pro Max) — 1242×2688 ou 1284×2778 | Obrigatório se não tiver 6.9" | 3-10 |
| **iPad Pro 13"** — 2064×2752 | Apenas se app for universal/iPad | 3-10 |

**Truque**: gere screenshots no simulador do **maior** tamanho — a Apple aceita auto-scaling de cima pra baixo desde o iOS 17. No simulador, abra o iPhone 16 Pro Max → tire screenshot com Cmd+S → salva no Desktop.

Recomendado: 5-6 screenshots mostrando os fluxos principais (feed, criar bronca, mapa, perfil, conta).

### 15.3. App Preview (vídeo, opcional mas converte muito)
- Vídeo de 15-30s, formato MP4 ou MOV
- Mesmas dimensões dos screenshots
- Sem voz humana (use legendas)

### 15.4. Metadados textuais

| Campo | Limite | Exemplo |
|---|---|---|
| Nome | 30 chars | `Trombone Cidadão` |
| Subtítulo | 30 chars | `Denúncias urbanas que viram ação` |
| Descrição | 4000 chars | (descrição completa do app) |
| Palavras-chave | 100 chars (separados por vírgula, sem espaços) | `denúncia,prefeitura,urbano,buraco,iluminação,cidadania,trombone` |
| URL de suporte | URL pública | `https://trombonecidadao.com.br/suporte` |
| URL de marketing | opcional | `https://trombonecidadao.com.br` |

### 15.5. Categorias
- Primária: **News** ou **Utilities** (Trombone se encaixa em News/Utilities)
- Secundária: **Social Networking**

### 15.6. Classificação etária (Age Rating)
Responda o questionário com honestidade. Conteúdo gerado pelo usuário (denúncias com fotos) → marque **"User Generated Content: Frequent/Intense"** → classifica como **17+**. Existe uma exceção: se você **modera ativamente** e tem **denúncia/bloqueio** dentro do app, pode ser 12+. **A Apple verifica essa moderação no review.**

> 🚨 **Crítico**: Apps com UGC sem ferramentas de denúncia/bloqueio são **rejeitados imediatamente** (Guideline 1.2). Garanta que tem:
> - [ ] Botão "Denunciar conteúdo abusivo" em cada bronca
> - [ ] Botão "Bloquear usuário"
> - [ ] Termos de uso proibindo abuso (você já tem)
> - [ ] EULA aceito antes do primeiro post

---

## 16. Privacy Nutrition Labels e App Privacy Report

Em **App Privacy** no App Store Connect, declare cada tipo de dado coletado.

Para o Trombone Cidadão:

| Tipo de dado | Coletado? | Vinculado à identidade? | Usado para tracking? |
|---|---|---|---|
| Nome | ✅ | ✅ | ❌ |
| Email | ✅ | ✅ | ❌ |
| Telefone | ✅ se coleta | ✅ | ❌ |
| Localização (precisa) | ✅ | ✅ | ❌ |
| Fotos/Vídeos | ✅ | ✅ | ❌ |
| Identificadores de dispositivo | ✅ (FCM token) | ✅ | ❌ |
| Diagnóstico (crashes) | ✅ | ❌ | ❌ |

**Tracking** (se ativa o ATT prompt — App Tracking Transparency): só marque ✅ se você compartilha dados com terceiros para ads cross-app. Pelo que vi do Trombone, **não usa tracking** — então marque tudo como ❌ tracking. Se marcar tracking ✅, **DEVE** chamar `App Tracking Transparency` API antes de qualquer SDK de ad — e Apple revisa rigorosamente.

### 16.1. Privacy Manifest (PrivacyInfo.xcprivacy)

Desde iOS 17, a Apple exige um `PrivacyInfo.xcprivacy` declarando APIs sensíveis usadas. O Capacitor 7 já gera isso automaticamente para os plugins oficiais. Confirme que existe:

```
ios/App/App/PrivacyInfo.xcprivacy
```

Se não existir, crie via Xcode → File → New → File → **App Privacy File** → target App.

---

## 17. Subir o primeiro build via Xcode (Archive)

### 17.1. Garanta o build correto

1. No Xcode, selecione **Any iOS Device (arm64)** como destino (NÃO simulador)
2. Schema: **App** (Release)
3. Confirme version `1.0.3` build `1`

### 17.2. Limpar e rebuildar
- Product → **Clean Build Folder** (Shift+Cmd+K)
- Product → **Build** (Cmd+B) — confirme zero erros

### 17.3. Archive
- Product → **Archive**
- Demora 3-10 minutos
- Quando terminar, abre o **Organizer**

### 17.4. Distribuir para App Store Connect
1. No Organizer, selecione o archive recém-criado
2. **Distribute App** → **App Store Connect** → **Upload**
3. Mantenha **Automatically manage signing** marcado
4. **Upload**
5. Aguarde 5-15 minutos — o build aparece em **TestFlight** no App Store Connect

### 17.5. Lidar com Export Compliance
Apple pergunta se o app usa criptografia. Como você usa HTTPS (todos usam), responda:
- **Does your app use encryption?** → Yes
- **Does your app qualify for any of the exemptions?** → Yes (HTTPS é a exemption padrão)

Para evitar a pergunta a cada build, adicione no `Info.plist`:

```xml
<key>ITSAppUsesNonExemptEncryption</key>
<false/>
```

> Use `false` apenas se a sua única criptografia é HTTPS/TLS. Se usa criptografia própria de dados (AES local, etc.), consulte um advogado de export compliance.

---

## 18. TestFlight: testes internos e externos

### 18.1. Teste interno (instantâneo)
1. App Store Connect → seu app → **TestFlight**
2. **Internal Testing** → criar grupo → adicionar até 100 e-mails de membros do Developer Program
3. Selecionar build → testers recebem e-mail
4. Eles instalam o app **TestFlight** no iPhone e testam imediatamente

### 18.2. Teste externo (precisa revisão da Apple — 24-48h)
- Até 10.000 testers via link público ou e-mail
- A Apple **revisa** o primeiro build externo (depois é mais rápido)
- Use para testar com usuários reais antes da App Store

### 18.3. Buildar versão nova
Sempre que for subir um novo build:
1. Incremente o **Build** no Xcode (1 → 2 → 3...)
2. Archive → Upload
3. TestFlight processa automaticamente

---

## 19. Submissão para revisão da App Store

### 19.1. Selecionar build em "App Store"
1. App Store Connect → seu app → **iOS App** (na barra lateral) → **1.0** (versão pendente)
2. Em **Build**, clique em **+** e selecione o build do TestFlight
3. Preencha:
   - **What's New in This Version** (notas da versão — primeiro release: "Lançamento inicial")
   - **App Review Information**:
     - Contact First Name, Last Name
     - Phone, Email
     - **Demo account** (login + senha de teste — **OBRIGATÓRIO** se app exige login)
     - Notes: "App para denúncias urbanas. Usuário pode usar a conta demo: [email] / [senha] para testar todos os fluxos."

### 19.2. Submit for Review
- Clique **Add for Review** → **Submit to App Review**
- Status muda para **Waiting for Review**
- 24-48h depois passa para **In Review** → **Approved** ou **Rejected**

### 19.3. Se for rejeitado (provável na 1ª vez)
A Apple manda um e-mail com o motivo. Os 5 mais comuns:

1. **Guideline 5.1.1 (Privacy)**: faltou string em `Info.plist` → adicione e re-submeta
2. **Guideline 4.8 (Sign in with Apple)**: tem login Google/FB mas não Apple → implemente
3. **Guideline 1.2 (UGC)**: faltou ferramenta de denúncia/bloqueio → adicione no app
4. **Guideline 3.1.1 (IAP)**: tentando vender conteúdo digital com Stripe → migre pra IAP
5. **Metadata Rejection**: screenshot mostra feature que não está no app, ou descrição menciona Android

Responda no **Resolution Center** (chat com o reviewer) sendo específico, sem hostilidade. Eles costumam ser razoáveis se você corrigir e explicar.

---

## 20. Configurar Xcode Cloud (libertando você do Mac)

> **Quando fazer isso**: depois que o primeiro build subiu com sucesso pelo Xcode local. Tentar configurar Xcode Cloud antes do primeiro Archive funcionar costuma falhar por questões de signing.

### 20.1. Pré-requisitos
- ✅ Repositório do projeto no **GitHub** (ou GitLab/Bitbucket)
- ✅ Pasta `ios/` commitada no repo
- ✅ Apple Developer Program ativo (Xcode Cloud já incluso, 25h de build/mês grátis)

### 20.2. Conectar GitHub ao Xcode Cloud (no Mac, uma vez)

1. No Xcode → **Product** → **Xcode Cloud** → **Create Workflow**
2. Selecione o projeto **App**
3. Xcode pede pra autorizar o GitHub → autorize na sua conta
4. Confirme o repositório

### 20.3. Criar Workflow

Sugestão de workflow inicial:

| Item | Valor |
|---|---|
| **Name** | `Build iOS` |
| **Description** | Build automático do app iOS |
| **Start Conditions** | Branch Changes → branch `main` |
| **Environment** | Latest macOS, Latest Xcode |
| **Actions** | Archive — iOS, Configuration: Release |
| **Post-Actions** | Deploy → TestFlight (Internal Testing) |

### 20.4. Custom Build Script (essencial pro Capacitor)

Xcode Cloud roda em ambiente limpo — não tem `node_modules` nem `dist/`. Crie:

`ios/ci_scripts/ci_post_clone.sh`:

```bash
#!/bin/sh

# Falha imediatamente em qualquer erro
set -e

# Instalar Node via Homebrew (Xcode Cloud já tem brew)
brew install node@20

# Voltar pra raiz do repo
cd $CI_PRIMARY_REPOSITORY_PATH

# Instalar dependências do projeto
npm ci

# Build do projeto web
npm run build

# Sync do Capacitor pra atualizar o ios/App/App/public/
npx cap sync ios

# CocoaPods
cd ios/App
pod install
```

```bash
chmod +x ios/ci_scripts/ci_post_clone.sh
git add ios/ci_scripts/ci_post_clone.sh
git commit -m "ci: add Xcode Cloud post-clone script"
git push
```

### 20.5. Variáveis de ambiente

Se sua build precisa de chaves (Supabase URL, etc.), em **Xcode Cloud → seu workflow → Environment → Environment Variables**:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- etc.

Marque **Secret** nas chaves sensíveis.

### 20.6. Testar o workflow
1. Faça um commit qualquer e `git push origin main`
2. No Xcode Cloud, o build inicia automaticamente
3. Acompanhe em https://appstoreconnect.apple.com → **Xcode Cloud**
4. Build leva ~15-25 minutos (mais lento que local, normal)
5. Termina e sobe automaticamente pra TestFlight

---

## 21. Fluxo de release recorrente sem Mac

Depois de tudo configurado, seu fluxo padrão de release **sem precisar do Mac** será:

### 21.1. Para mudanças apenas web (React/JS)
```bash
# No Windows
git checkout main
# fazer mudanças
npm run build              # validar localmente
git add . && git commit -m "feat: nova feature"
git push origin main
```
- Xcode Cloud detecta o push
- Buildar sozinho
- Subir pro TestFlight automaticamente
- Você abre o App Store Connect, seleciona o novo build, e submete pra Review

### 21.2. Para mudanças nativas (raras)
- Adicionar plugin Capacitor: edite `package.json`, rode `npm install`, **NÃO precisa rodar `cap sync` no Windows** — o `ci_post_clone.sh` faz isso no Xcode Cloud
- Editar `Info.plist`: edite o arquivo XML direto no VS Code, commit, push — funciona
- Adicionar capability: aí sim, **idealmente** abrir Xcode pelo menos uma vez (mas dá pra editar `App.entitlements` e `project.pbxproj` na mão, com cuidado)

### 21.3. Bumping de versão

Edite manualmente no Windows:
- `package.json` → `version`
- `ios/App/App/Info.plist` → `CFBundleShortVersionString` e `CFBundleVersion`

Ou crie um script tipo o seu `tools/bump-android-version-code.js` para iOS:

`tools/bump-ios-build.js`:

```js
const fs = require('fs');
const path = require('path');
const plistPath = path.join(__dirname, '..', 'ios/App/App/Info.plist');
let plist = fs.readFileSync(plistPath, 'utf8');
const match = plist.match(/<key>CFBundleVersion<\/key>\s*<string>(\d+)<\/string>/);
if (!match) { console.error('CFBundleVersion not found'); process.exit(1); }
const next = parseInt(match[1], 10) + 1;
plist = plist.replace(match[0], `<key>CFBundleVersion</key>\n\t<string>${next}</string>`);
fs.writeFileSync(plistPath, plist);
console.log(`iOS build → ${next}`);
```

E adicione um script no `package.json`:
```json
"bump:ios": "node tools/bump-ios-build.js"
```

---

## 22. O que ainda exige Mac (e como contornar)

| Tarefa | Precisa Mac? | Contorno |
|---|---|---|
| Build de produção | ❌ — Xcode Cloud faz | — |
| Editar Info.plist, entitlements | ❌ | Edite XML no VS Code |
| Adicionar plugin Capacitor | ❌ | `npm install` + push, `cap sync` roda no Cloud |
| Mudar ícone | ❌ | Substitua arquivo em `Assets.xcassets/AppIcon.appiconset/` |
| Adicionar **Capability** novo (Sign in with Apple, etc.) | ⚠️ Mac é mais seguro | Editável manualmente em `App.entitlements` + `project.pbxproj` |
| Debugar crash nativo (LLDB) | ✅ Sim | Use logs do Sentry/Crashlytics em vez de debug nativo |
| Atualizar Xcode (Xcode Cloud sempre tem o latest) | ❌ | — |
| Submeter pra Review | ❌ | App Store Connect web faz |
| Responder Resolution Center | ❌ | App Store Connect web faz |
| TestFlight gerenciamento | ❌ | App Store Connect web faz |

**Resumo**: depois de configurado, **95% dos releases** são feitos sem Mac. O Mac volta a ser necessário apenas se:
- Adicionar capability novo
- Debugar crash nativo complexo
- Mudança grande de versão do Xcode quebrar build (raro)

---

## 23. Troubleshooting comum

### "No matching profiles found"
Xcode → Settings → Accounts → Download Manual Profiles. Ou desmarque/remarque "Automatically manage signing".

### "App is using non-public API"
Algum plugin Capacitor antigo. Atualize todos os plugins (`npm update @capacitor/*`) e rode `npx cap sync ios`.

### Build do Xcode Cloud falha em `pod install`
Falta `Podfile.lock` no repo, ou versão de CocoaPods diferente. Commit o `Podfile.lock`.

### Push notification não chega no iOS
1. Confirme `GoogleService-Info.plist` no Xcode (Project Navigator)
2. Confirme `.p8` APNs no Firebase Console
3. iPhone físico (push **NÃO funciona em simulador** antes de iOS 16)
4. Capability **Push Notifications** marcada
5. App pediu permissão e foi concedida

### "Invalid Bundle - The bundle does not contain an executable"
Geralmente o build foi para simulador, não dispositivo. Confirme **Any iOS Device (arm64)** antes do Archive.

### App rejected: "The app crashes on launch"
Falta de `GoogleService-Info.plist`, ou string vazia em `Info.plist`, ou erro no `AppDelegate.swift`. Teste em iPhone físico antes de submeter.

### Xcode Cloud falha: "npm: command not found"
Confirme que o `ci_post_clone.sh` instala Node antes de chamar `npm`.

---

## 24. Checklist final

Antes do primeiro upload pro TestFlight:

### App
- [ ] `ios/App/App/Info.plist` com TODAS as `*UsageDescription` strings em PT-BR
- [ ] `ITSAppUsesNonExemptEncryption = false` (se só HTTPS)
- [ ] Capabilities: Push Notifications, Background Modes (Remote notifications), Associated Domains, Sign in with Apple (se aplica)
- [ ] `GoogleService-Info.plist` no projeto
- [ ] `apple-app-site-association` servindo nas duas URLs (com Team ID correto)
- [ ] Ícones todos slots preenchidos no `AppIcon.appiconset`
- [ ] Splash screen sem texto (a Apple rejeita texto promocional em splash)
- [ ] App testado em **iPhone físico** com câmera real, GPS real, push real
- [ ] Sem `console.log` ou banners de debug visíveis
- [ ] Login demo criado em produção pra usar no Review da Apple

### App Store Connect
- [ ] Agreements, Tax, and Banking — **TUDO PREENCHIDO**
- [ ] Política de Privacidade URL pública
- [ ] App Privacy preenchido (Data Types declarados)
- [ ] Categorias selecionadas
- [ ] Idade classificação respondida
- [ ] Screenshots para 6.9" (mínimo 3)
- [ ] Subtítulo, descrição, palavras-chave preenchidos
- [ ] Demo account fornecida em "App Review Information"
- [ ] Notas de versão preenchidas

### Conformidade
- [ ] Botão de **denunciar/bloquear** em conteúdo de outros usuários (UGC)
- [ ] Sem Stripe para conteúdo digital (ou desabilitado no iOS)
- [ ] Sign in with Apple se tem login social terceiro
- [ ] Termo de uso aceito antes do primeiro post
- [ ] App funciona offline ou mostra erro amigável (Apple testa em modo avião)

### Após primeiro release aprovado
- [ ] Configurar Xcode Cloud com `ci_post_clone.sh`
- [ ] Adicionar variáveis de ambiente no Xcode Cloud
- [ ] Validar que push em main faz build automático no Cloud
- [ ] Devolver o Mac com a sensação de missão cumprida 🎉

---

## 📚 Referências oficiais

- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Capacitor iOS Documentation](https://capacitorjs.com/docs/ios)
- [Xcode Cloud Documentation](https://developer.apple.com/xcode-cloud/)
- [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [App Store Connect Help](https://developer.apple.com/help/app-store-connect/)

---

**Boa sorte! Se travar em alguma etapa, manda o erro/screenshot que eu te ajudo.** 🚀
