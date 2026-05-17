# Tutorial iOS (Capacitor) usando Xcode Cloud — a partir do Windows

Este guia assume que você já gerou a pasta `ios/` em um Mac (via Capacitor) e já possui conta no Apple Developer Program.

---

## 1) Objetivo

Publicar o app na App Store sem precisar manter um Mac local, usando:
- Windows para desenvolvimento do app (Vite/React/Capacitor) e versionamento no GitHub
- Xcode Cloud para build, assinatura e envio ao TestFlight/App Store Connect

---

## 2) Pré‑requisitos

- Repositório no GitHub com acesso de escrita
- App criado no App Store Connect (mesmo Bundle ID do projeto)
- Apple Developer Program ativo
- Bundle ID definido e estável (ex.: `com.trombonecidadao.app`)

No repositório:
- Pasta `ios/` versionada (com `Podfile` e `Podfile.lock`)
- `Pods/` não versionado (normal)

---

## 3) Subir a pasta `ios/` para o GitHub

1) Confirme se o `ios/` está no repositório:
```bash
git status
git add ios
git commit -m "chore(ios): adiciona projeto iOS"
git push origin dev
```

2) Garanta que arquivos sensíveis não subiram:
- `GoogleService-Info.plist` (se usar Firebase)
- certificados `.p12`, `.pem`, `.key`
- qualquer arquivo com tokens/segredos

---

## 4) Manter iOS atualizado depois (rotina)

Sempre que mudar plugins Capacitor ou ajustes nativos, você precisa atualizar a pasta `ios/` e commitar.

Fluxo recomendado:

1) Atualize o código web normalmente (Windows).
2) Rode build web:
```bash
npm run build
```
3) Sincronize o Capacitor (se o seu fluxo já estiver configurado no Windows):
```bash
npx cap sync
```

Observação:
- Dependendo do plugin, `cap sync ios` pode exigir CocoaPods e, portanto, um Mac. Se isso acontecer, faça o `cap sync ios` no Mac e commite as mudanças no `ios/`.

4) Commit das mudanças que afetaram iOS:
```bash
git add ios
git commit -m "chore(ios): sync capacitor"
git push
```

---

## 5) Garantir versão e build number (obrigatório para publicar)

Você precisa controlar:
- **Version** (ex.: `1.0.0`)
- **Build** (incremental: `1`, `2`, `3`…)

Normalmente isso fica no Xcode:
- `ios/App/App.xcodeproj` / `ios/App/App.xcworkspace`
- Target `App` → `General` → `Version` e `Build`

Regras:
- A cada envio para TestFlight, o **Build** precisa aumentar.
- Para nova versão na App Store, aumente a **Version** também.

---

## 6) Configurar o Xcode Cloud (uma vez)

### 6.1 Conectar repositório
1) App Store Connect → seu App → **Xcode Cloud**
2) Conecte o repositório (GitHub) e selecione a branch (ex.: `dev` para TestFlight)

### 6.2 Workflow sugerido (TestFlight)
- **Start condition**: On push
- **Branch**: `dev`
- **Action**: Build
- **Archive**: ON
- **TestFlight**: ON (distribuir para testers internos)

### 6.3 Assinatura (Signing)
No workflow:
- Preferir **Automatic signing** quando possível
- Se usar capacidades (Push Notifications, Associated Domains), habilite no App ID e ajuste no Xcode

---

## 7) Configurar o build do Xcode Cloud para Capacitor (build steps)

O essencial é que o `ios/` já esteja pronto no repositório. Em geral, o Xcode Cloud:
- resolve dependências (incluindo Pods)
- compila e arquiva o app

Se precisar de scripts (dependendo do projeto), os passos mais comuns são:
- instalar dependências do Node
- build web
- copiar assets para o iOS (se você depender disso)

Se você já comita o `ios/` sincronizado, costuma ser suficiente manter o app pronto sem scripts extras.

Se o workflow exigir Node, configure no Xcode Cloud:
- **Environment** → defina versão do Node (quando disponível)
- **Pre-actions** (se necessário):
```bash
npm ci
npm run build
npx cap sync ios
```

Observação:
- `cap sync ios` pode chamar CocoaPods. No Xcode Cloud isso normalmente funciona porque o ambiente é macOS.

---

## 8) Primeiro envio para TestFlight

1) Faça um push na branch do workflow (ex.: `dev`)
2) App Store Connect → Xcode Cloud → aguarde o build
3) App Store Connect → TestFlight → selecione o build
4) Preencha o “What to Test” (texto simples)
5) Adicione testers internos

---

## 9) Publicar na App Store (produção)

Recomendação: usar uma branch/tag específica (ex.: `main` ou `release/*`) para builds de produção.

Checklist:
- `Version` e `Build` atualizados
- Ícone 1024×1024 configurado (sem transparência)
- Screenshots e metadados preenchidos (descrição, palavras-chave, privacidade)
- Política de privacidade e termos com URL pública

Processo:
1) Gere um build no Xcode Cloud para a branch de release
2) App Store Connect → “App” → “Prepare for Submission”
3) Selecione o build e envie para revisão

---

## 10) Problemas comuns

### 10.1 Build falha por `Pods` / CocoaPods
- Confirme que `Podfile` e `Podfile.lock` estão no Git.
- Não versione `Pods/`.

### 10.2 Erro por Bundle ID diferente
- O Bundle ID do Xcode precisa ser o mesmo do App Store Connect.

### 10.3 Erro por permissões/capabilities
- Habilite a capability no App ID (Developer portal) e no Xcode (Signing & Capabilities).

### 10.4 “Precisa aumentar build number”
- A cada novo envio, aumente `Build`.

---

## 11) Checklist rápido (antes de apertar “Submit”)

- Build no TestFlight instalado e testado
- Login/cadastro e fluxos críticos funcionando
- Permissões (localização/câmera) testadas
- Política de privacidade e termos com URLs
- Metadados completos nas lojas

