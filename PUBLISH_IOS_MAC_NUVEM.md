# Publicar iOS Usando Mac Na Nuvem (MacStadium / AWS EC2 Mac)

Este documento descreve um caminho prático e seguro para gerar o build iOS e publicar na App Store usando um Mac remoto (cloud Mac). O seu projeto é um app web (Vite/React) empacotado com Capacitor, então o fluxo é: **build web → sync Capacitor → Xcode Archive → TestFlight → App Store**.

---
## 1) Pré-requisitos (antes do Mac)

- Conta no **Apple Developer Program** ativa.
- Acesso ao **App Store Connect** com permissões para:
  - Criar apps, gerenciar TestFlight e enviar para revisão.
- Repositório do app acessível pelo Mac cloud (GitHub/GitLab/Bitbucket) ou um zip seguro.
- Variáveis de ambiente organizadas:
  - Nenhum segredo no código.
  - Arquivo `.env` não deve ser versionado.
  - Use `.env.example` como referência.

---
## 2) Escolhendo o Mac cloud (visão rápida)

### MacStadium (recomendado para simplicidade)
- Geralmente mais simples para “um Mac dedicado” (ideal para Xcode).
- Bom para acesso via NoMachine/VNC e também via SSH.

### AWS EC2 Mac (bom para escala/automação)
- Bom para automatizar pipeline e controlar infra.
- Custo por tempo (observe regras de alocação/dedicação do Mac).
- Acesso geralmente via SSH e, se necessário, ambiente gráfico via VNC.

Critério prático: se você quer publicar manualmente pelo Xcode, o mais simples costuma ser **MacStadium**. Se quer evoluir para CI, o **AWS EC2 Mac** pode fazer sentido.

---
## 2.1) Custo estimado (ordem de grandeza)

Os custos variam bastante por região, geração do Mac, armazenamento e tempo que você deixa a máquina “reservada”. Abaixo vai uma referência prática para estimar.

### MacStadium (mensal)
- Referências públicas com valores típicos: a partir de aproximadamente **US$ 109–119/mês** (Mac mini base) e subindo conforme memória/SSD, chegando a algumas centenas de dólares por mês em máquinas maiores.
  - Fonte comparativa: https://howtohosting.guide/mac-hosting/

Quando faz sentido: você vai usar o Mac com frequência (vários dias no mês), quer previsibilidade e um ambiente “sempre pronto”.

### AWS EC2 Mac (por tempo, com mínimo de 24h)
- EC2 Mac roda em **Dedicated Host** e existe um **mínimo de alocação de 24 horas** (por licença do macOS). Depois disso, você pode liberar a qualquer momento.
  - FAQ AWS: https://aws.amazon.com/ec2/instance-types/mac/faqs/
- Para estimar:
  - Custo do host = **preço/hora × horas alocadas** (mínimo 24h por vez).
  - Referência de preço (exemplo do mac2.metal): **~US$ 0,65/hora** → **~US$ 15,60** em 24h (apenas computação).
    - Referência: https://instances.vantage.sh/aws/ec2/mac2.metal
- Custos adicionais comuns no AWS:
  - **EBS** (disco): você paga por GB/mês + IOPS/throughput se provisionado.
  - **Snapshot/backup** (se usar).
  - Transferência de dados (geralmente irrelevante para build, mas pode existir).

Quando faz sentido: você quer usar o Mac pontualmente (ex.: 1 dia para “fechar” release), ou quer evoluir para automação/infra.

### Cenários rápidos
- “Só publicar 1 vez”: geralmente dá para fazer em **1 janela de 24h** no AWS EC2 Mac (custo base do host por 24h + EBS). Em provedores que cobram por mês, o mínimo será 1 mês.
- “Publicar e ajustar durante o mês”: Mac dedicado mensal (MacStadium) tende a ficar mais previsível/mais barato do que várias janelas de 24h no AWS.

---
## 3) Provisionando e acessando o Mac (boas práticas)

### Acesso remoto
- Habilite **SSH** (preferível) e, se precisar de interface, use **NoMachine** (MacStadium) ou **VNC**.
- Use **chaves SSH**, desabilite senha fraca e mantenha o macOS atualizado.

### Segurança do Apple ID
- Use Apple ID com **2FA**.
- Se o Mac for “compartilhado” (time), considere um Apple ID dedicado para builds.
- Evite deixar sessão do App Store Connect aberta em navegador em máquinas que outras pessoas acessam.

### Chaves e segredos
- Nunca copie `SUPABASE_SERVICE_ROLE_KEY` ou outros segredos para o app cliente.
- Se o projeto precisa de segredos para build, use `.env` local apenas no Mac (não commitado) ou secrets do provedor de CI.

---
## 4) Preparando o Mac para iOS (uma vez por máquina)

### 4.1 Instalar Xcode
- Instale o **Xcode** pela App Store (ou Apple Developer downloads).
- Abra o Xcode uma vez e aceite licenças.
- Instale Command Line Tools:

```bash
xcode-select --install
sudo xcodebuild -license accept
```

### 4.2 Instalar Node.js
O projeto usa Vite/Capacitor e precisa de Node. Recomenda-se Node LTS.

Opção comum (via nvm):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.zshrc
nvm install 20
nvm use 20
```

### 4.3 Instalar dependências do projeto
No diretório do repo:

```bash
npm install
```

---
## 5) Gerando o projeto iOS (Capacitor)

No diretório do repo:

```bash
npm run build
npx cap sync
npx cap add ios
npx cap sync ios
```

Isso criará a pasta `ios/` e sincronizará o bundle web (`dist/`) para dentro do projeto iOS.

Para abrir no Xcode:

```bash
npx cap open ios
```

---
## 6) Configuração no Xcode (assinar e rodar)

No Xcode, abra o workspace:
- `ios/App/App.xcworkspace`

### 6.1 Bundle ID e Team
Em **Targets → App → Signing & Capabilities**:
- Marque **Automatically manage signing** (recomendado).
- Selecione seu **Team** (Apple Developer).
- Confirme o **Bundle Identifier** (ex.: `com.trombonecidadao.app`).

### 6.2 Versão e Build
Ainda no target App:
- **Version** (ex.: `1.0.3`) e **Build** (incrementa a cada upload).

### 6.3 Permissões (Info.plist)
Seu app pede câmera/mídia/localização/notifications no Android, então no iOS você provavelmente precisará preencher descrições no Info.plist (o Xcode aponta warnings se estiver faltando).

Exemplos comuns:
- `NSCameraUsageDescription`
- `NSMicrophoneUsageDescription`
- `NSPhotoLibraryAddUsageDescription` / `NSPhotoLibraryUsageDescription`
- `NSLocationWhenInUseUsageDescription`

Use textos claros e objetivos (o review olha isso).

### 6.4 Capacidades (Push, etc.)
Se você usa push notifications no iOS:
- Adicione capability **Push Notifications**
- Adicione **Background Modes** (se necessário, com critério)
- Garanta que o App ID no Apple Developer esteja com APNs habilitado.

---
## 7) Criando o app no App Store Connect

1. Entre em **App Store Connect** → **My Apps** → **+**.
2. Crie o app com:
   - Nome, idioma, SKU
   - Bundle ID igual ao do Xcode
3. Preencha:
   - Política de privacidade (URL)
   - Classificação indicativa
   - Categorias, suporte, marketing

---
## 8) Enviando para TestFlight (Archive / Upload)

### 8.1 Archive
No Xcode:
- Selecione **Any iOS Device (arm64)** como destino (não simulador).
- Menu **Product → Archive**.

### 8.2 Upload
Depois do Archive abrir o Organizer:
- **Distribute App → App Store Connect → Upload**.

Se der erro de login, resolva o Apple ID no Xcode:
- Xcode → Settings/Preferences → Accounts → Add Apple ID.

---
## 9) TestFlight → App Store

1. App Store Connect → TestFlight:
   - Aguarde “Processing” finalizar.
2. Convide testers internos/externos.
3. Valide o app (login, feed, mídia, push, pagamentos).
4. Quando estiver ok:
   - App Store → Prepare for Submission → selecione o build.
   - Preencha screenshots, descrição, palavras-chave, privacidade.
   - Envie para review.

---
## 10) Checklist específico para o seu projeto (Capacitor)

- Garantir que o build web está ok:
  - `npm run build`
- Sincronizar antes de arquivar:
  - `npx cap sync ios`
- Ícone/splash:
  - Se estiver usando `@capacitor/assets`, gere assets e ressincronize:

```bash
npx capacitor-assets generate
npx cap sync ios
```

- Variáveis de ambiente:
  - Apenas variáveis `VITE_*` podem entrar no bundle web.
  - Segredos server-side devem ficar em Edge Functions/servidor.

---
## 11) Problemas comuns (e como resolver rápido)

### “No profiles found” / “Signing requires a development team”
- Selecione o Team no target e use “Automatically manage signing”.
- Confirme o Bundle ID e permissões no App Store Connect/Apple Developer.

### “App Store Connect Operation Error” / falha no upload
- Verifique Apple ID no Xcode (Accounts).
- Confirme 2FA e sessão ativa.

### “Missing Info.plist usage description”
- Adicione as chaves de permissão necessárias (câmera, fotos, localização etc.).

### Build web ok, mas iOS abre tela branca
- Rode `npm run build` + `npx cap sync ios` antes de abrir/arquivar.
- Confirme `webDir: 'dist'` no `capacitor.config.*`.

---
## 12) Recomendações de segurança para Mac cloud

- Use usuário dedicado no macOS (não “admin” para tudo).
- Ative FileVault se disponível.
- Armazene certificados no Keychain do usuário, com senha forte.
- Não guarde `.env` em pastas sincronizadas automaticamente.
- Remova perfis/certificados antigos e rotacione credenciais se houver suspeita de vazamento.

---
## 13) Alternativa: publicar sem interface gráfica (opcional)

Você pode evoluir para CI usando um runner macOS e automatizar upload, mas isso exige configurar autenticação (certificados/provisionamento ou API keys). Se quiser esse caminho, o próximo documento pode ser um “pipeline iOS” com upload automatizado para TestFlight.
