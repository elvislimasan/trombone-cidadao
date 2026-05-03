# Guia: Publicar Trombone Cidadão na App Store via Xcode Cloud

> **Boa notícia:** Todo o processo abaixo é feito pelo **navegador** (App Store Connect) e pelo **GitHub**. Não precisa de Mac com Xcode instalado. Funciona de qualquer computador, inclusive Windows.

---

## O que foi preparado neste projeto

| Arquivo | O que faz |
|---|---|
| `ios/App/App/Info.plist` | Permissões de câmera, microfone, fotos e localização adicionadas |
| `ios/App/App/App.entitlements` | Push Notifications habilitado para produção |
| `ios/App/App/PrivacyInfo.xcprivacy` | Privacy Manifest obrigatório pela Apple desde maio/2024 |
| `ios/App/ci_scripts/ci_post_clone.sh` | Script que o Xcode Cloud executa para buildar o projeto |

---

## Pré-requisitos

- [ ] Conta Apple Developer ativa ($99/ano) em [developer.apple.com](https://developer.apple.com)
- [ ] App **criado** no App Store Connect (Bundle ID: `com.trombonecidadao.app`)
- [ ] Repositório no GitHub com o código enviado (push feito)

---

## Passo 1 — Subir o código para o GitHub

No terminal (Windows, Mac ou Linux), dentro da pasta do projeto:

```bash
git add ios/
git add -u
git commit -m "feat: add iOS Xcode Cloud config and App Store requirements"
git push origin dev
```

> Se ainda não tem o repositório no GitHub, crie em [github.com/new](https://github.com/new) e faça:
> ```bash
> git remote add origin https://github.com/SEU_USUARIO/trombone-cidadao.git
> git push -u origin dev
> ```

---

## Passo 2 — Criar o app no App Store Connect

1. Acesse [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. Clique em **"Meus Apps"** → botão **"+"** → **"Novo App"**
3. Preencha:
   - **Plataforma:** iOS
   - **Nome:** Trombone Cidadão
   - **Idioma principal:** Português (Brasil)
   - **Bundle ID:** `com.trombonecidadao.app`
   - **SKU:** `trombonecidadao` (qualquer texto único)
4. Clique em **Criar**

---

## Passo 3 — Configurar o Xcode Cloud

1. No App Store Connect, abra o app **Trombone Cidadão**
2. No menu lateral, clique em **Xcode Cloud**
3. Clique em **"Começar"** ou **"Criar Workflow"**
4. Conecte sua conta do **GitHub** quando solicitado e autorize o acesso ao repositório

### Configuração do Workflow

| Campo | Valor |
|---|---|
| **Nome do workflow** | `Deploy App Store` |
| **Branch** | `main` (ou `dev` para testar antes) |
| **Ambiente** | Xcode — versão mais recente |
| **Ação** | Archive & Distribution |
| **Destino** | App Store Connect |

5. Em **"Actions"**, selecione:
   - **Action:** Archive
   - **Scheme:** App
   - **Platform:** iOS
   - **Deployment Preparation:** TestFlight & App Store

6. Em **"Post-Actions"**, adicione:
   - **TestFlight (Internal Testing):** para testar antes de publicar

7. Clique em **Salvar** e depois **Iniciar Build**

---

## Passo 4 — Assinatura automática (Code Signing)

O Xcode Cloud gerencia a assinatura automaticamente. Na primeira execução ele vai:

1. Criar um **Certificate** de distribuição na sua conta Apple
2. Criar o **Provisioning Profile** para `com.trombonecidadao.app`
3. Registrar o Push Notification capability

> Você só precisa **aprovar** esses itens quando o Xcode Cloud pedir permissão (aparece uma notificação no App Store Connect).

---

## Passo 5 — Push Notifications (configuração extra)

O app usa Push Notifications. Para funcionar em produção:

1. Acesse [developer.apple.com/account](https://developer.apple.com/account)
2. Vá em **Certificates, IDs & Profiles** → **Identifiers**
3. Clique em `com.trombonecidadao.app`
4. Em **Capabilities**, habilite **Push Notifications**
5. Clique em **Save**

---

## Passo 6 — Publicar na App Store

Após o build ser aprovado no TestFlight:

1. No App Store Connect, vá em **"Distribuição"** → **"App Store"**
2. Clique em **"+"** ao lado da versão
3. Selecione o build gerado pelo Xcode Cloud
4. Preencha as informações obrigatórias:
   - Screenshots (iPhone 6.5" e 5.5" obrigatórios)
   - Descrição do app
   - Palavras-chave
   - URL de suporte
   - Política de privacidade
5. Clique em **"Enviar para Revisão"**

---

## Fluxo automatizado (próximas versões)

Após a configuração inicial, para publicar uma nova versão:

```bash
# 1. Atualize a versão no project.pbxproj se necessário
# MARKETING_VERSION = 1.1
# CURRENT_PROJECT_VERSION = 2

# 2. Commite e faça push para a branch configurada
git add .
git commit -m "feat: nova versão 1.1"
git push origin main
```

O Xcode Cloud detecta o push e **inicia o build automaticamente**.

---

## Solução de problemas comuns

| Erro | Solução |
|---|---|
| `Pod install failed` | Verifique se o `Podfile` está correto e as versões do `@capacitor` são compatíveis |
| `No signing certificate` | No Xcode Cloud, vá em Settings → Grant Access para permitir gerenciar certificados |
| `Missing Push Notifications entitlement` | Habilite Push Notifications no identifier em developer.apple.com |
| `Privacy manifest missing` | O arquivo `PrivacyInfo.xcprivacy` já foi adicionado neste setup |
| `Build script failed` | Verifique os logs do `ci_post_clone.sh` na aba de logs do Xcode Cloud |

---

## Arquitetura do build no Xcode Cloud

```
GitHub push (main)
        ↓
Xcode Cloud detecta mudança
        ↓
ci_post_clone.sh executa:
  1. npm ci
  2. npm run build        ← gera dist/
  3. npx cap sync ios    ← copia dist/ para ios/App/App/public/
  4. pod install         ← instala dependências iOS
        ↓
Xcode compila o .xcworkspace
        ↓
Archive assinado (.ipa)
        ↓
Upload automático → TestFlight / App Store
```
