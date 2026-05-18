# Guia de Publicação — Trombone Cidadão na App Store

> App: **Trombone Cidadão**  
> Bundle ID: `com.trombonecidadao.app`  
> Versão atual: `1.0` (build 1)  
> Stack: React + Capacitor 7 + Supabase

---

## Pré-requisitos

| Item | Status |
|------|--------|
| Conta Apple Developer Program ativa (US$ 99/ano) | Necessário |
| Mac com Xcode 15 ou superior | Necessário |
| CocoaPods instalado via Homebrew | ✅ Instalado |
| Node.js 18+ instalado | Necessário |
| Acesso ao App Store Connect | Necessário |

---

## ETAPA 1 — Preparar o ambiente local

### 1.1 Instalar dependências

```bash
# Na raiz do projeto
npm ci
```

### 1.2 Configurar variáveis de ambiente para produção

Verifique o arquivo `.env` e confirme que todas as variáveis apontam para **produção**:

```bash
# Obrigatório para produção — NÃO use chaves de teste
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...      # trocar pk_test_ por pk_live_
VITE_SUPABASE_URL=https://mrejgpcxaevooofyenzq.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...               # chave anon de produção
VITE_APP_URL=https://trombonecidadao.com.br/
```

> ⚠️ O `.env` **nunca deve ser commitado**. Confirme que está no `.gitignore`.

### 1.3 Gerar build da web e sincronizar com iOS

```bash
npm run build
npx cap sync ios
```

Isso copia o `dist/` para `ios/App/App/public/` e atualiza os plugins nativos.

---

## ETAPA 2 — Configurar certificados e perfis de provisioning

Tudo feito em [developer.apple.com](https://developer.apple.com).

### 2.1 Criar ou verificar o App ID

1. Acesse **Certificates, Identifiers & Profiles → Identifiers**
2. Confirme que o identifier `com.trombonecidadao.app` existe
3. Nas **Capabilities**, verifique se estão habilitados:
   - **Push Notifications** (necessário — entitlement `aps-environment: production` já está em `App.entitlements`)
   - **Associated Domains** (se usar deep links)

### 2.2 Criar Distribution Certificate

1. Vá em **Certificates → +**
2. Selecione **Apple Distribution**
3. Gere o CSR no Mac: Acesso às Chaves → Menu Assistente de Certificados → Solicitar um Certificado de uma Autoridade Certificadora
4. Faça upload do CSR, baixe e clique duplo para instalar no Keychain

### 2.3 Criar Provisioning Profile de App Store

1. Vá em **Profiles → +**
2. Selecione **App Store Connect** (na seção Distribution)
3. Escolha o App ID `com.trombonecidadao.app`
4. Selecione o certificate criado no passo anterior
5. Nome sugerido: `TromboneCidadao_AppStore`
6. Baixe e clique duplo para instalar

### 2.4 Configurar Xcode

1. Abra **`ios/App/App.xcworkspace`** (sempre o `.xcworkspace`, nunca o `.xcodeproj`)
2. Selecione o target **App** no painel esquerdo
3. Aba **Signing & Capabilities**:
   - Desmarque **Automatically manage signing** para usar o perfil manual, **ou**
   - Marque **Automatically manage signing** e selecione seu Team — o Xcode baixa tudo automaticamente (recomendado)
4. Confirme:
   - **Team:** seu Apple Developer Team
   - **Bundle Identifier:** `com.trombonecidadao.app`
   - **Provisioning Profile:** `TromboneCidadao_AppStore` (ou Automatic)

---

## ETAPA 3 — Configurar Firebase (Push Notifications)

O app usa FCM para push. Sem o `GoogleService-Info.plist`, as notificações **não funcionarão** na App Store.

### 3.1 Obter o arquivo de configuração

1. Acesse [console.firebase.google.com](https://console.firebase.google.com)
2. Selecione o projeto do Trombone Cidadão
3. **Project Settings → Seu app iOS** → baixe o `GoogleService-Info.plist`
4. Arraste o arquivo para dentro do Xcode em **`ios/App/App/`** (marque "Copy items if needed")

### 3.2 Vincular APNs ao Firebase

1. No Firebase Console → **Project Settings → Cloud Messaging**
2. Na seção **Apple app configuration**:
   - Faça upload do **APNs Authentication Key** (.p8), gerado em developer.apple.com → **Keys → +** → Apple Push Notifications service (APNs)
   - Ou faça upload dos certificados APNs (Development + Production)

---

## ETAPA 4 — Deploy das Edge Functions no Supabase

As Edge Functions precisam estar no ar antes de submeter o app.

### 4.1 Instalar Supabase CLI

```bash
brew install supabase/tap/supabase
supabase login
supabase link --project-ref mrejgpcxaevooofyenzq
```

### 4.2 Fazer deploy de todas as functions

```bash
supabase functions deploy delete-user
supabase functions deploy send-push-notification
supabase functions deploy create-payment-intent
supabase functions deploy verify-recaptcha
supabase functions deploy share-report
supabase functions deploy share-petition
supabase functions deploy share-work
supabase functions deploy og-image
supabase functions deploy share-preview
```

### 4.3 Criar tabela `content_flags` no banco

Execute no **SQL Editor** do Supabase (dashboard → SQL Editor):

```sql
create table if not exists content_flags (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid references reports(id) on delete cascade,
  reporter_id uuid references profiles(id) on delete set null,
  reason      text not null,
  reviewed    boolean default false,
  created_at  timestamptz default now()
);

-- Apenas admins podem ler; qualquer pessoa autenticada ou anônima pode inserir
alter table content_flags enable row level security;

create policy "Inserir denúncia" on content_flags
  for insert with check (true);

create policy "Admins podem ver denúncias" on content_flags
  for select using (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );
```

---

## ETAPA 5 — Criar o app no App Store Connect

Acesse [appstoreconnect.apple.com](https://appstoreconnect.apple.com).

### 5.1 Criar novo app

1. **My Apps → +**
2. Preencha:
   - **Platform:** iOS
   - **Name:** Trombone Cidadão
   - **Primary Language:** Portuguese (Brazil)
   - **Bundle ID:** `com.trombonecidadao.app`
   - **SKU:** `trombonecidadao-ios-001` (qualquer string única)
   - **User Access:** Full Access

### 5.2 Preencher metadados da versão (aba "App Store")

#### Informações básicas
| Campo | Conteúdo sugerido |
|-------|-------------------|
| **Name** | Trombone Cidadão |
| **Subtitle** | Fiscalize sua cidade |
| **Category** | Utilities (primária) / Social Networking (secundária) |
| **Age Rating** | 12+ (responda o questionário — marque UGC) |

#### Descrição (até 4.000 caracteres)
```
O Trombone Cidadão é a plataforma cívica de Floresta-PE para você fiscalizar, cobrar e acompanhar a resolução de problemas urbanos na sua cidade.

Com o app você pode:
• Registrar broncas (buracos, iluminação, esgoto, limpeza, poda e mais)
• Fotografar e geolocalizar o problema automaticamente
• Acompanhar em tempo real o status das suas broncas
• Criar e assinar abaixo-assinados
• Ver obras públicas em andamento no mapa
• Receber notificações quando sua bronca for atualizada

Transparência e participação cidadã na palma da sua mão.
```

#### Palavras-chave (até 100 caracteres)
```
cidadão,prefeitura,bronca,obras,fiscalização,Floresta,Pernambuco,petição,serviço público
```

#### URLs obrigatórias
| Campo | URL |
|-------|-----|
| **Privacy Policy URL** | `https://trombonecidadao.com.br/termos` |
| **Support URL** | `https://trombonecidadao.com.br` |
| **Marketing URL** | `https://trombonecidadao.com.br` (opcional) |

### 5.3 Screenshots (obrigatório)

A Apple exige screenshots para **iPhone 6.7"** (iPhone 15 Pro Max) e **iPhone 6.5"** (iPhone 14 Plus). Opcional para iPad.

**Tamanhos exatos:**
- 6.7": **1290 × 2796 px**
- 6.5": **1242 × 2688 px**

**Como capturar no Simulador:**
1. Xcode → Open Developer Tools → Simulator
2. Escolha iPhone 15 Pro Max
3. Rode o app no simulador
4. `Cmd+S` para tirar screenshot
5. Repita para as telas principais (Home, Bronca, Mapa, Perfil — mínimo 3, máximo 10)

**Ferramentas para criar frames de marketing:**
- [Screely](https://screely.com) — adiciona moldura de iPhone grátis
- [AppLaunchpad](https://theapplaunchpad.com) — templates prontos

---

## ETAPA 6 — Build e Upload para App Store Connect

### 6.1 Verificar versão e build number no Xcode

Em **Xcode → Target App → General:**
- **Version:** `1.0.0` (visível na loja — `MARKETING_VERSION`)
- **Build:** `1` (incrementar a cada upload — `CURRENT_PROJECT_VERSION`)

> Cada upload exige build number único. Se já enviou build 1, o próximo deve ser 2.

### 6.2 Selecionar destino correto

No Xcode, no seletor de dispositivo (topo da janela):
- Mude de qualquer simulador para **"Any iOS Device (arm64)"**

### 6.3 Gerar Archive

```
Menu Product → Archive
```

Aguarde a compilação (2–5 minutos). O Xcode abrirá o **Organizer** automaticamente.

### 6.4 Upload via Organizer

1. Selecione o archive recém-gerado
2. Clique em **Distribute App**
3. Selecione **App Store Connect** → **Upload**
4. Opções: deixe todos os checkboxes marcados (Include bitcode, Upload symbols)
5. Clique **Next** até **Upload**
6. Aguarde o upload (pode levar 5–15 minutos)

> Alternativa: use **Xcode Cloud** (CI/CD já configurado em `ios/App/ci_scripts/ci_post_clone.sh`)

### 6.5 Verificar no App Store Connect

1. Acesse **App Store Connect → My Apps → Trombone Cidadão → TestFlight**
2. Aguarde o e-mail "Your build has been processed" (5–30 minutos)
3. Se houver erros de conformidade, eles aparecem aqui

---

## ETAPA 7 — Configurar App Privacy (Coleta de Dados)

Em **App Store Connect → App Privacy → Get Started:**

### Dados coletados pelo app

| Dado | Coletado? | Finalidade | Vinculado ao usuário? |
|------|-----------|------------|----------------------|
| Localização precisa | ✅ Sim | Funcionalidade do app | Não |
| Fotos/vídeos | ✅ Sim | Funcionalidade do app | Não |
| Nome | ✅ Sim | Funcionalidade do app | Sim |
| Email | ✅ Sim | Conta do usuário | Sim |
| Telefone | ✅ Sim | Funcionalidade do app | Sim |
| Identificadores de device | ✅ Sim (FCM token) | Notificações | Sim |
| Diagnósticos/crashs | ❌ Não | — | — |
| Histórico de navegação | ❌ Não | — | — |

> O `PrivacyInfo.xcprivacy` já está configurado em `ios/App/App/PrivacyInfo.xcprivacy`.

---

## ETAPA 8 — Configurar o Build no App Store Connect

1. Em **App Store Connect → App → versão 1.0 → Build**, clique em **+**
2. Selecione o build que foi uploadado
3. Preencha **"What to Test"** (para TestFlight, mas é bom preencher):
   ```
   Teste o fluxo completo: cadastro → criar bronca com foto e localização → 
   acompanhar status → excluir conta. Push notifications via FCM.
   ```

---

## ETAPA 9 — Questionário de Classificação Etária

Em **App Store Connect → versão → Age Rating → Edit:**

| Pergunta | Resposta |
|----------|----------|
| Conteúdo gerado por usuário | **Frequente/Intenso** (UGC presente) |
| Linguagem ofensiva | Nenhuma |
| Nudez | Nenhuma |
| Violência | Nenhuma |
| Uso de drogas ou álcool | Nenhuma |
| Horror/medo | Nenhuma |
| Apostas | Nenhuma |
| Compras dentro do app | **Sim** (doações via Stripe/PIX) |

**Resultado esperado:** classificação **12+**

---

## ETAPA 10 — Submeter para Revisão

### 10.1 Checklist final antes de submeter

- [ ] Build selecionado na versão
- [ ] Screenshots de 6.7" e 6.5" adicionadas
- [ ] Descrição, palavras-chave e URLs preenchidas
- [ ] Privacy Policy URL válida e acessível
- [ ] Age Rating respondido
- [ ] App Privacy (coleta de dados) preenchida
- [ ] `GoogleService-Info.plist` adicionado ao Xcode
- [ ] Edge Function `delete-user` deployada no Supabase
- [ ] Tabela `content_flags` criada no banco
- [ ] Chave Stripe trocada para `pk_live_...`
- [ ] `.env` não commitado no repositório

### 10.2 Notas para o Revisor da Apple (obrigatório)

Em **App Store Connect → versão → App Review Information → Notes:**

```
Este app é uma plataforma cívica para cidadãos de Floresta-PE, Brasil, 
reportarem problemas urbanos à prefeitura.

Para testar todas as funcionalidades:

Conta de teste:
- Email: [crie uma conta de teste antes de submeter]
- Senha: [senha da conta de teste]

Fluxo principal:
1. Cadastre-se ou use a conta de teste
2. Na tela inicial, toque em "Nova Bronca"
3. Permita acesso à câmera e localização quando solicitado
4. Tire uma foto, adicione descrição e submeta
5. Acompanhe o status na aba "Minhas Broncas"

Exclusão de conta:
- Perfil → Configurações → Excluir Conta → digite EXCLUIR → confirmar

Doações (Stripe em modo produção):
- Use cartão de teste: 4242 4242 4242 4242, validade qualquer futura, CVV 123

O app requer conexão com internet para todas as funcionalidades.
```

### 10.3 Submeter

1. Clique em **Submit for Review**
2. Responda se o app usa IDFA: **No**
3. Confirme a submissão

---

## Prazos e o que esperar

| Etapa | Tempo médio |
|-------|-------------|
| Processamento do build | 30–60 min |
| Revisão da Apple | 24–48 horas (pode ser até 7 dias) |
| Aprovação e publicação | Imediato após aprovação (ou na data agendada) |

**Status possíveis durante a revisão:**
- **Waiting for Review** — na fila
- **In Review** — sendo analisado agora
- **Metadata Rejected** — problema nos metadados, não no código
- **Rejected** — ver motivo em Resolution Center e corrigir
- **Approved** — pronto para publicar

---

## Motivos mais comuns de rejeição e como evitar

| Guideline | Problema | Solução já aplicada? |
|-----------|----------|---------------------|
| 5.1.1 (iv) | Exclusão de conta incompleta | ✅ Edge Function `delete-user` |
| 2.5.13 | Pedir permissão sem contexto | ✅ `NotificationPermissionModal` |
| 1.2 | UGC sem mecanismo de denúncia | ✅ Botão "Denunciar conteúdo" |
| 3.1.1 | Chave Stripe em modo teste | ⚠️ Trocar para `pk_live_...` |
| 2.1 | Screenshots de baixa qualidade | Capturar em dispositivo real |
| 4.0 | Crash durante revisão | Testar em iPhone físico antes |

---

## Após a aprovação

### Publicar imediatamente ou agendar
- **Manually release:** você controla quando publicar
- **Automatically release:** publica assim que aprovado
- **Scheduled release:** escolha data e hora

### Monitorar após o lançamento
- Crashes: **App Store Connect → Crashes** (ou integre o Sentry)
- Avaliações: **App Store Connect → Ratings and Reviews**
- Downloads: **App Store Connect → Analytics**

---

## Atualizações futuras

Para cada nova versão:

```bash
# 1. Incrementar versão no Xcode (MARKETING_VERSION e CURRENT_PROJECT_VERSION)
# 2. Gerar build da web
npm run build
npx cap sync ios

# 3. Archive e upload no Xcode
# Product → Archive → Distribute App → App Store Connect → Upload

# 4. No App Store Connect: criar nova versão, selecionar build, submeter
```

> O build number (`CURRENT_PROJECT_VERSION`) deve ser **sempre maior** que o anterior.  
> Exemplo: 1.0.0 (build 1) → 1.0.1 (build 2) → 1.1.0 (build 3)
