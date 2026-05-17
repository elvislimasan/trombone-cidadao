# Tutorial iOS + Firebase Push (FCM) + Xcode Cloud — Trombone Cidadão

Este guia é um passo a passo completo para publicar e testar no iOS usando Xcode Cloud, com Push Notifications via Firebase (FCM).

---

## 1) O que você precisa (checklist de credenciais e itens)

### Apple
- Conta ativa no **Apple Developer Program**
- Acesso ao **App Store Connect**
- Um **App ID (Identifier)** com Bundle ID explícito
- Uma **APNs Auth Key** (.p8) com:
  - **Key ID**
  - **Team ID**
  - arquivo **.p8**

### Firebase
- Projeto no Firebase
- App iOS cadastrado no Firebase com o mesmo Bundle ID do iOS
- Arquivo **GoogleService-Info.plist**

### Repositório / Código
- Pasta `ios/` versionada no GitHub
- `PRODUCT_BUNDLE_IDENTIFIER` igual ao App ID
- Entitlements com `aps-environment`

Bundle ID do projeto (confirmado no repositório):
- `com.trombonecidadao.app`

---

## 2) App Store Connect: criar o app (SKU e Package ID)

### 2.1 Criar um novo app
App Store Connect → **Apps** → **+** → **New App**

Preencha:
- **Platforms**: iOS
- **Name**: Trombone Cidadão
- **Primary language**: Português (Brasil)
- **Bundle ID**: selecione `com.trombonecidadao.app`
- **SKU**: um identificador interno (não aparece para o público)

Sugestão de SKU (pode ser qualquer string única):
- `TC-IOS-001`
- `TROMBONECIDADAO-IOS`
- `TROMBONE-IOS-PROD`

Regra:
- SKU não pode repetir entre apps da sua conta.

### 2.2 Acesso do usuário (User Access)
- **Acesso total** (normalmente)

---

## 3) Apple Developer: registrar App ID e habilitar Push

Apple Developer → **Certificates, Identifiers & Profiles**

### 3.1 Identifiers → App IDs → Register a new identifier
- **Description**: Trombone Cidadão
- **Bundle ID**: Explicit → `com.trombonecidadao.app`

### 3.2 Capabilities
Marque:
- **Push Notifications**

Não marque outras capabilities a menos que você realmente use (Associated Domains, Sign in with Apple, etc.).

---

## 4) Apple Developer: criar a APNs Auth Key (.p8)

Apple Developer → **Keys** → **+**

1) Name: `Trombone Cidadão APNs`
2) Marque: **Apple Push Notifications service (APNs)**
3) Continue → Register

Baixe o arquivo `.p8` e anote:
- **Key ID**
- **Team ID** (aparece no canto superior da conta ou em Membership)

Regra importante:
- O arquivo `.p8` só pode ser baixado uma vez. Guarde em local seguro.

---

## 5) Firebase Console: cadastrar o app iOS e configurar APNs

### 5.1 Cadastrar o app iOS no Firebase
Firebase Console → Project Settings → **Your apps** → Add app → iOS

Preencha:
- **iOS bundle ID**: `com.trombonecidadao.app`

Baixe:
- **GoogleService-Info.plist**

### 5.2 Conectar APNs ao Firebase (FCM)
Firebase Console → Project Settings → **Cloud Messaging**

Em “Apple app configuration”:
- Escolha **APNs Authentication Key** (recomendado)
- Envie:
  - arquivo `.p8`
  - **Key ID**
  - **Team ID**

---

## 6) Projeto iOS: conferir entitlements e bundle id

### 6.1 Bundle ID (já conferido)
No repositório, está como:
- `PRODUCT_BUNDLE_IDENTIFIER = com.trombonecidadao.app`

### 6.2 Entitlements (Push)
Confirme que existe `aps-environment`:
- `ios/App/App/App.entitlements`

Observação:
- Para TestFlight, `production` costuma funcionar.
- Para builds locais (Debug), o ideal é `development` em Debug e `production` em Release.

---

## 7) Onde guardar o GoogleService-Info.plist (sem vazar segredo)

Recomendação:
- NÃO commitar `GoogleService-Info.plist` se você quer manter configs separadas por ambiente (dev/prod).

Opções:

### Opção A: manter fora do Git e adicionar no Xcode Cloud (recomendado)
1) Armazene o conteúdo do `GoogleService-Info.plist` como **Secure File** ou como secret (dependendo do suporte do Xcode Cloud).
2) No workflow, crie um Pre‑Action script que recrie o arquivo no caminho:
   - `ios/App/App/GoogleService-Info.plist`

### Opção B: commitar (aceitável para alguns times)
Você pode commitar se:
- o projeto não é público
- você está confortável em manter esse arquivo no repositório

Mesmo assim, mantenha atenção a ambientes (prod vs dev).

---

## 8) Xcode Cloud: configurar workflow (TestFlight)

App Store Connect → seu app → **Xcode Cloud**

### 8.1 Conectar repositório
Conecte o GitHub e selecione a branch (ex.: `dev`).

### 8.2 Workflow sugerido
- **Start condition**: On push
- **Branch**: `dev`
- **Action**: Build + Archive
- **Distribute**: TestFlight (internal testers)
- **Signing**: Automatic

### 8.3 Pre‑Actions (se você precisar gerar o plist)
Se você usar a opção A (não commitar `GoogleService-Info.plist`), configure um Pre‑Action para escrever o arquivo antes do build.

Exemplo conceitual:
- obter o conteúdo do plist de um secret
- salvar em `ios/App/App/GoogleService-Info.plist`

---

## 9) Primeiro envio para TestFlight

1) Faça push na branch configurada (ex.: `dev`)
2) Aguarde o build no Xcode Cloud
3) App Store Connect → **TestFlight** → selecione o build
4) Adicione testers internos

Se o App Store Connect exigir:
- complete a conformidade de exportação (criptografia)
- complete a classificação indicativa

---

## 10) Teste de Push (validação ponta a ponta)

Checklist:
- App instalado via TestFlight
- Permissão de notificação concedida no iOS
- O app registra o token FCM
- Seu backend envia uma mensagem via Firebase (FCM) para o token/dispositivo

Se não chegar:
- confirme no Firebase se o APNs está configurado com a Auth Key correta
- verifique se o app iOS tem `aps-environment` e signing correto
- verifique se o token é FCM (não APNs) e se está atualizado

---

## 11) Publicar na App Store (produção)

Recomendação:
- Use uma branch de release (ex.: `main` ou `release/*`) com workflow próprio.
- Aumente `Version` e `Build` a cada envio.

Depois:
App Store Connect → prepare for submission → selecione build → enviar para revisão.

---

## 12) Itens que a Apple costuma exigir na submissão

- URLs públicas:
  - Política de Privacidade
  - Termos de Uso
- Screenshots e ícone 1024×1024
- Informações de contato (suporte)
- Se houver login obrigatório, fornecer credenciais de teste para revisão

