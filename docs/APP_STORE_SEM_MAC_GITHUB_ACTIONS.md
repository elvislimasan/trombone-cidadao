# Publicar iOS na App Store sem Mac físico (GitHub Actions) — Trombone Cidadão

Este projeto é um app web (Vite/React) empacotado com Capacitor. Hoje ele já tem Android nativo e **ainda não tem a pasta `ios/`** no repositório. O caminho mais barato “sem Mac físico” é usar **runner macOS do GitHub Actions** para compilar, assinar e enviar para o App Store Connect.

> Objetivo deste guia: sair do estado atual do repo e chegar em **upload automático para TestFlight** (recomendado) e, a partir daí, submeter para a App Store.

## 1) O que eu observei no seu código (pontos que impactam iOS)

- Stack: **Capacitor + Vite/React** (não é React Native/Expo).
- Build web gera `dist/` (`webDir: 'dist'`) em [capacitor.config.ts](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/capacitor.config.ts#L5-L19).
- Identidade do app:
  - `appId`: `com.trombonecidadao.app`
  - `appName`: `Trombone Cidadão`
  em [capacitor.config.ts](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/capacitor.config.ts#L5-L8).
- O repo tem **3 configs do Capacitor** (`capacitor.config.ts`, `.js`, `.json`). Para iOS/CI isso é um risco porque o build pode “pegar” uma config diferente da esperada. Recomendo padronizar para **um único arquivo** (idealmente o `.ts`) antes de automatizar.

## 2) Custos (estimativa realista)

### 2.1 Custos obrigatórios

- **Apple Developer Program**: **US$ 99/ano** (obrigatório para publicar e para TestFlight). Fonte: Apple Developer Program (“$99 annual membership”) https://developer.apple.com/programs/ (seção “Join the Apple Developer Program”).  

### 2.2 Custos do GitHub Actions (runner macOS)

Para compilar iOS você precisa de macOS. O GitHub cobra por minuto no runner macOS (valores de referência oficiais):

- **macOS 3-core/4-core (M1/Intel)**: **US$ 0,062 por minuto** (GitHub-hosted runner). Fonte: “Actions runner pricing” https://docs.github.com/en/billing/reference/actions-runner-pricing.  

> Observações práticas:
> - GitHub arredonda tempo por job para o minuto inteiro.
> - Dependendo do seu plano, pode existir franquia de minutos; quando acaba, entra cobrança. A fórmula abaixo continua válida para estimar “pior caso” (overage).

#### Estimativa por build (referência)

Em projetos Capacitor, um pipeline macOS típico (npm ci + build + cap sync + pod install + archive + upload) costuma ficar assim:

- **Primeira execução (sem cache)**: ~30–45 min  
  - Custo: 30 × 0,062 = **US$ 1,86** até 45 × 0,062 = **US$ 2,79**
- **Execução recorrente (com cache ok)**: ~15–25 min  
  - Custo: 15 × 0,062 = **US$ 0,93** até 25 × 0,062 = **US$ 1,55**

#### Cenários mensais (somente GitHub Actions)

- 4 uploads/mês (1 por semana), 20 min cada: 4 × 20 × 0,062 = **US$ 4,96/mês**
- 20 builds/mês (mais CI), 20 min cada: 20 × 20 × 0,062 = **US$ 24,80/mês**

**Total anual mínimo realista** (publicando pouco): ~US$ 99/ano (Apple) + ~US$ 5–25/mês (CI macOS, dependendo do volume).

## 3) Requisitos e pré-requisitos

- Conta no **Apple Developer Program** ativa.
- Acesso ao **App Store Connect**.
- Um repositório no GitHub com Actions habilitado.
- Entender a regra: **segredos nunca no código** (somente em `.env` local e/ou GitHub Secrets).

## 4) Estratégia recomendada (barata e que funciona)

1) Preparar o projeto iOS (gerar `ios/`) e **versionar** `ios/` no git.  
2) Configurar **App Store Connect API Key** para autenticação no CI (evita Apple ID/senha no runner).  
3) Usar **Fastlane** para:
   - assinar (certificados/perfis)
   - compilar (archive)
   - enviar para **TestFlight**
4) Submeter para a App Store diretamente no App Store Connect.

> Por que TestFlight primeiro? Porque reduz retrabalho e é o fluxo esperado pela Apple.

## 5) Passo a passo — preparar `ios/` sem precisar de Mac

Você consegue gerar a estrutura `ios/` em Windows/Linux (o build final é que precisa de macOS).

### 5.1 Instalar dependência iOS do Capacitor

No root do projeto:

```bash
npm i @capacitor/ios@^7.4.4
```

Essa versão precisa estar no mesmo major do `@capacitor/core` do projeto. Aqui o projeto está em Capacitor v7.

### 5.2 Gerar a plataforma iOS e sincronizar o web bundle

```bash
npm ci
npm run build
npx cap add ios
npx cap sync ios
```

Depois disso, você deve ter a pasta:

- `ios/`

Recomendação: **commitar `ios/`** (pelo menos inicialmente). Isso evita que mudanças no template/versões do Capacitor alterem seu projeto iOS silenciosamente em cada build.

## 6) Passo a passo — configurar App Store Connect (uma vez)

### 6.1 Criar o app no App Store Connect

1) App Store Connect → My Apps → “+” → New App
2) Use como **Bundle ID**: `com.trombonecidadao.app` (do seu `capacitor.config.ts`)
3) Defina um SKU (ex.: `TROMBONECIDADAO001`)

### 6.2 Criar uma API Key (p8) para CI

1) App Store Connect → Users and Access → Keys → App Store Connect API
2) Crie uma Key e baixe o arquivo `.p8`
3) Você vai obter:
   - **Issuer ID**
   - **Key ID**
   - O arquivo **.p8** (segredo)

Para salvar no GitHub Secrets com segurança, converta o `.p8` para base64 na sua máquina e cole no Secret (exemplo):

```bash
base64 -i AuthKey_XXXXXX.p8 | tr -d '\n'
```

## 7) GitHub Secrets (obrigatório)

No repositório GitHub: Settings → Secrets and variables → Actions → New repository secret.

Crie:

- `APP_STORE_CONNECT_API_KEY_ID` (Key ID)
- `APP_STORE_CONNECT_API_ISSUER_ID` (Issuer ID)
- `APP_STORE_CONNECT_API_KEY_BASE64` (conteúdo do `.p8` em base64, sem quebras de linha)
- `IOS_BUNDLE_ID` = `com.trombonecidadao.app`

### Assinatura (2 opções)

Você tem duas formas principais:

**Opção A (recomendada em time/CI): fastlane match**  
Prós: reprodutível, padrão de mercado.  
Contras: precisa de um repo privado adicional (para armazenar certs/perfis criptografados) e uma senha do match.

Secrets adicionais:
- `MATCH_GIT_URL` (URL do repositório privado do match)
- `MATCH_PASSWORD` (senha para criptografia)

**Opção B: assinatura manual/exportada**  
Prós: pode ser mais rápida para “primeiro upload”.  
Contras: costuma virar dor no longo prazo.

Este guia segue a **Opção A**.

## 8) Fastlane (arquivos e lane)

Você vai precisar criar os arquivos do Fastlane dentro do projeto iOS (após existir `ios/`).

Estrutura recomendada:

- `ios/App/Gemfile`
- `ios/App/fastlane/Appfile`
- `ios/App/fastlane/Fastfile`

### 8.1 Gemfile (ios/App/Gemfile)

```ruby
source "https://rubygems.org"

gem "fastlane"
```

### 8.2 Appfile (ios/App/fastlane/Appfile)

```ruby
app_identifier(ENV["IOS_BUNDLE_ID"])
```

### 8.3 Fastfile (ios/App/fastlane/Fastfile)

Exemplo de lane mínima para TestFlight, autenticando via API Key:

```ruby
default_platform(:ios)

platform :ios do
  desc "Build e upload para TestFlight"
  lane :release do
    api_key = app_store_connect_api_key(
      key_id: ENV["APP_STORE_CONNECT_API_KEY_ID"],
      issuer_id: ENV["APP_STORE_CONNECT_API_ISSUER_ID"],
      key_content: Base64.decode64(ENV["APP_STORE_CONNECT_API_KEY_BASE64"]),
      is_key_content_base64: false
    )

    match(
      type: "appstore",
      git_url: ENV["MATCH_GIT_URL"],
      api_key: api_key
    )

    build_app(
      workspace: "App.xcworkspace",
      scheme: "App",
      export_method: "app-store"
    )

    upload_to_testflight(api_key: api_key)
  end
end
```

## 9) Workflow GitHub Actions (macOS) — build + upload

Crie `.github/workflows/ios-testflight.yml`:

```yaml
name: iOS - TestFlight (Capacitor)

on:
  workflow_dispatch:
  push:
    tags:
      - "ios-v*"

concurrency:
  group: ios-testflight-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build_upload:
    runs-on: macos-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install JS deps
        run: npm ci

      - name: Build web (dist)
        run: npm run build

      - name: Capacitor sync iOS
        run: npx cap sync ios

      - name: Setup Ruby (Fastlane)
        uses: ruby/setup-ruby@v1
        with:
          ruby-version: "3.3"
          bundler-cache: true
          working-directory: ios/App

      - name: Install CocoaPods
        run: |
          cd ios/App
          pod install

      - name: Fastlane release (TestFlight)
        env:
          IOS_BUNDLE_ID: ${{ secrets.IOS_BUNDLE_ID }}
          APP_STORE_CONNECT_API_KEY_ID: ${{ secrets.APP_STORE_CONNECT_API_KEY_ID }}
          APP_STORE_CONNECT_API_ISSUER_ID: ${{ secrets.APP_STORE_CONNECT_API_ISSUER_ID }}
          APP_STORE_CONNECT_API_KEY_BASE64: ${{ secrets.APP_STORE_CONNECT_API_KEY_BASE64 }}
          MATCH_GIT_URL: ${{ secrets.MATCH_GIT_URL }}
          MATCH_PASSWORD: ${{ secrets.MATCH_PASSWORD }}
        run: |
          cd ios/App
          bundle exec fastlane ios release
```

### Como disparar

- Criar tag e push:

```bash
git tag ios-v1.0.3
git push origin ios-v1.0.3
```

ou rodar manualmente em Actions → workflow → “Run workflow”.

## 10) Ajustes específicos do seu app (permissões e capabilities)

Seu app usa plugins como câmera/mídia/push. Em iOS isso normalmente exige:

- Chaves no `Info.plist` (descrição de uso de câmera/fotos/microfone/localização, conforme o que você realmente usa).
- Para **Push Notifications**: capability + entitlements (`aps-environment`) e configuração no App ID.

Sem abrir Xcode, esses ajustes podem ser feitos via arquivos do projeto (e Fastlane pode ajudar), mas a forma mais confiável é:

- Fazer o **primeiro setup** (capabilities/entitlements) em um ambiente com Xcode (pode ser um Mac cloud) e commitar o resultado; depois o **GitHub Actions** mantém o fluxo automatizado.

Se você quiser, eu monto um “checklist iOS” exatamente baseado nos plugins do seu `package.json` e no que o app de fato aciona em runtime.

## 11) Troubleshooting rápido

- Build iOS “tela branca”:
  - Garanta `npm run build` antes do `npx cap sync ios`.
  - Confirme `webDir: 'dist'` (já está ok no seu `capacitor.config.ts`).
- Erros de assinatura (`No profiles found`, `Signing requires a development team`):
  - Geralmente é `match` não conseguindo criar/baixar perfil, ou Bundle ID divergente.
  - Confirme `IOS_BUNDLE_ID` = `com.trombonecidadao.app`.
- Upload falha no TestFlight:
  - Verifique permissões da API Key no App Store Connect e se o app já existe no App Store Connect.

## 12) Recomendações finais (segurança, escalabilidade, manutenção)

- Padronize o Capacitor para **um único arquivo de config** (evita builds inconsistentes).
- Guarde segredos **somente** em GitHub Secrets (CI) e `.env` local (não versionado).
- Use TestFlight como etapa obrigatória antes de “App Store”.
- Se o custo do macOS runner crescer, o próximo passo de economia costuma ser:
  - reduzir tempo do job (cache, steps mínimos)
  - ou migrar build iOS para um Mac cloud por janela (AWS EC2 Mac) quando for raro publicar
