# Publicar na App Store — Xcode Local
### Trombone Cidadão · Bundle ID: `com.trombonecidadao.app` · Team: Elvis Vinícius De Lima Santos

---

## VISÃO GERAL DO PROCESSO

```
.env (produção)
    ↓
npm run build        ← gera a pasta dist/ com o app web
    ↓
npx cap sync ios     ← copia dist/ para o Xcode e atualiza plugins
    ↓
Product → Archive    ← Xcode compila o app nativo (.ipa)
    ↓
Distribute App       ← Xcode envia para a Apple
    ↓
App Store Connect    ← você configura metadados e submete para revisão
    ↓
Apple revisa         ← 24–48h
    ↓
App na loja ✅
```

---

## ETAPA 1 — Verificar o arquivo `.env`

Abra o arquivo `.env` na raiz do projeto e confirme:

**✅ Deve estar assim (produção):**
```
VITE_SUPABASE_URL=https://mrejgpcxaevooofyenzq.supabase.co
VITE_APP_URL=https://trombonecidadao.com.br/
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

**❌ Não pode estar assim (desenvolvimento):**
```
VITE_SUPABASE_URL=https://xxdletrjyjajtrmhwzev.supabase.co
VITE_APP_URL=https://trombone-cidadao.vercel.app/
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

> Se a chave Stripe ainda começa com `pk_test_`, substitua pela chave `pk_live_`
> no painel do Stripe antes de continuar.

---

## ETAPA 2 — Build da web e sync com iOS

Abra o **Terminal** (Cmd+Espaço → digite Terminal → Enter).

Navegue até a pasta do projeto:
```bash
cd /Users/macbookair/Documents/trombone-cidadao
```

Rode os dois comandos **em sequência**:

```bash
npm run build
```
Aguarde terminar. Você verá algo como:
```
✓ built in 7.90s
```

Depois:
```bash
npx cap sync ios
```
Aguarde terminar. Você verá algo como:
```
✔ Copying web assets from dist to ios/App/App/public in 1.23s
✔ Updating iOS native plugins in 1.00s
✔ update ios in 2.00s
```

> ⚠️ Se pular essa etapa, o Xcode vai compilar a versão antiga do app.

---

## ETAPA 3 — Abrir o projeto no Xcode

Abra o **Finder**, navegue até:
```
/Users/macbookair/Documents/trombone-cidadao/ios/App/
```

Clique duplo no arquivo:
```
App.xcworkspace          ← sempre abrir ESTE (ícone branco com grade azul)
```

> ⚠️ Nunca abra o `App.xcodeproj` (ícone azul) — ele não carrega os pods (dependências).

---

## ETAPA 4 — Verificar versão e build number

No Xcode, no painel esquerdo clique em **App** (o item do topo, com ícone azul).

Clique na aba **General**.

Verifique:

| Campo | Valor atual | O que fazer |
|-------|------------|-------------|
| **Version** | `1.0` | Versão visível na loja — ok para primeira publicação |
| **Build** | `1` | Número do build — deve ser único a cada upload |

> Para atualizações futuras: sempre incremente o **Build** (1 → 2 → 3...).
> A **Version** muda quando lançar nova versão (1.0 → 1.1 → 2.0).

---

## ETAPA 5 — Verificar Signing

Ainda no Xcode, clique na aba **Signing & Capabilities**.

Confirme que está assim:

```
✅ Automatically manage signing  →  marcado
✅ Team                          →  Elvis Vinícius De Lima Santos
✅ Bundle Identifier             →  com.trombonecidadao.app
```

Se o **Team** estiver como `Lairton da Silva (Personal Team)`, troque para
`Elvis Vinícius De Lima Santos`.

---

## ETAPA 6 — Selecionar destino correto

No **topo do Xcode**, ao lado do nome "App", tem um seletor de dispositivo.

Clique nele e selecione:
```
Any iOS Device (arm64)
```

> Se estiver selecionado um simulador (ex: "iPhone 16 Pro"), o Archive
> ficará desabilitado no menu. Precisa ser "Any iOS Device".

---

## ETAPA 7 — Gerar o Archive

No menu superior do Mac:
```
Product → Archive
```

O que acontece:
- Uma barra de progresso aparece no topo do Xcode
- O Xcode compila todo o app (web + nativo)
- Leva entre **3 e 8 minutos**
- Quando terminar, a janela **Organizer** abre automaticamente

> Se o Archive estiver cinza (desabilitado), verifique se o destino
> está como "Any iOS Device (arm64)" — veja Etapa 6.

---

## ETAPA 8 — Enviar para a Apple (Distribute)

Quando a janela **Organizer** abrir, você verá o archive listado com
data e hora. Siga:

### 8.1
Clique em **Distribute App**

### 8.2 — Método de distribuição
Selecione **App Store Connect**
Clique em **Next**

### 8.3 — Destino
Selecione **Upload**
Clique em **Next**

### 8.4 — Opções de distribuição
Deixe **todos os checkboxes marcados** como estão:
- ✅ Include bitcode for iOS content
- ✅ Upload your app's symbols
- ✅ Manage Version and Build Number

Clique em **Next**

### 8.5 — Re-sign
Selecione **Automatically manage signing**
Clique em **Next**

### 8.6 — Revisão final
O Xcode mostra um resumo com:
- App: Trombone Cidadão
- Team: Elvis Vinícius De Lima Santos
- Bundle ID: com.trombonecidadao.app

Clique em **Upload**

### 8.7 — Aguardar
O upload leva **5 a 20 minutos** dependendo da conexão.
Quando terminar aparece:
```
"App Store Connect Upload Successful"
```

---

## ETAPA 9 — Configurar no App Store Connect

Acesse **appstoreconnect.apple.com** com a conta `trombonecidadao@gmail.com`.

### 9.1 — Criar o app (primeira vez)

Se o app ainda não existe:
1. Clique em **My Apps → +**
2. Preencha:
   - **Platform:** iOS
   - **Name:** Trombone Cidadão
   - **Primary Language:** Portuguese (Brazil)
   - **Bundle ID:** com.trombonecidadao.app (selecione da lista)
   - **SKU:** trombonecidadao-v1
3. Clique em **Create**

### 9.2 — Aguardar o build aparecer

Vá em **TestFlight**. O build demora **10 a 30 minutos** para ser processado.
Você recebe um e-mail quando estiver pronto.

### 9.3 — Preencher informações da versão

Vá em **App Store → versão 1.0**:

**Nome do app:**
```
Trombone Cidadão
```

**Subtítulo** (30 caracteres):
```
Fiscalize sua cidade
```

**Descrição:**
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

**Palavras-chave** (100 caracteres):
```
cidadão,prefeitura,bronca,obras,fiscalização,Floresta,Pernambuco,petição,serviço público
```

**URLs obrigatórias:**
| Campo | URL |
|-------|-----|
| Privacy Policy URL | https://trombonecidadao.com.br/termos |
| Support URL | https://trombonecidadao.com.br |

### 9.4 — Adicionar Screenshots

**Obrigatório:**
- iPhone 6.7" → 1290 × 2796 px (iPhone 15 Pro Max)
- iPhone 6.5" → 1242 × 2688 px (iPhone 14 Plus)

**Como capturar:**
1. No Xcode: **Open Developer Tool → Simulator**
2. Escolha iPhone 15 Pro Max
3. Rode o app: **Product → Run**
4. Navegue pelas telas principais
5. `Cmd + S` para salvar screenshot
6. Telas recomendadas: Home, criar bronca, mapa, perfil

**Depois faça o upload no App Store Connect** arrastando as imagens.

### 9.5 — Selecionar o Build

Na seção **Build**, clique em **+** e selecione o build que você acabou de fazer upload.

### 9.6 — App Privacy (coleta de dados)

Vá em **App Privacy → Get Started** e declare:

| Dado | Coletado | Finalidade | Vinculado ao usuário |
|------|----------|------------|---------------------|
| Localização precisa | ✅ | Funcionalidade | Não |
| Fotos e vídeos | ✅ | Funcionalidade | Não |
| Nome | ✅ | Conta | Sim |
| Email | ✅ | Conta | Sim |
| Identificadores de device | ✅ | Notificações | Sim |

### 9.7 — Age Rating

Vá em **Age Rating → Edit** e responda:

| Pergunta | Resposta |
|----------|----------|
| Conteúdo gerado pelo usuário | Frequente |
| Compras dentro do app | Sim (doações) |
| Todo o resto | Nenhum |

Resultado: **12+**

### 9.8 — Notas para o Revisor (obrigatório)

Em **App Review Information → Notes:**
```
Plataforma cívica para cidadãos de Floresta-PE reportarem problemas urbanos.

Conta de teste:
Email: [coloque um email de teste que você criou]
Senha: [coloque a senha]

Fluxo principal:
1. Faça login com a conta de teste
2. Toque em "Nova Bronca" na tela inicial
3. Permita câmera e localização quando solicitado
4. Tire uma foto e adicione descrição
5. Submeta e acompanhe o status

Para excluir conta: Perfil → Configurações → Excluir Conta → digite EXCLUIR
```

> ⚠️ Crie uma conta de teste real no app antes de submeter e coloque
> as credenciais aqui. A Apple precisa conseguir fazer login para aprovar.

---

## ETAPA 10 — Submeter para Revisão

### Checklist final

- [ ] Build selecionado na versão
- [ ] Screenshots de 6.7" e 6.5" adicionadas
- [ ] Descrição e palavras-chave preenchidas
- [ ] Privacy Policy URL funcionando
- [ ] Age Rating respondido
- [ ] App Privacy preenchido
- [ ] Notas para o revisor com conta de teste
- [ ] Chave Stripe `pk_live_` (não `pk_test_`)
- [ ] Edge Function `delete-user` deployada no Supabase
- [ ] Tabela `content_flags` criada no banco

### Submeter

Clique em **Add for Review** → **Submit to App Review**

Responda **No** para IDFA (o app não usa rastreamento de publicidade).

---

## O que esperar depois

| Status | Significado |
|--------|-------------|
| Waiting for Review | Na fila — normal esperar 24h |
| In Review | Apple está revisando agora |
| Metadata Rejected | Problema nos textos/screenshots — corrigir e reenviar |
| Rejected | Ver motivo no Resolution Center — corrigir e reenviar |
| Ready for Sale | Aprovado ✅ |

**Tempo médio:** 24 a 48 horas para primeira submissão.

---

## Atualizações futuras

```bash
# 1. Fazer alterações no código
# 2. Incrementar Build no Xcode (1 → 2)
npm run build
npx cap sync ios
# 3. Product → Archive → Distribute App → Upload
# 4. App Store Connect → + nova versão → selecionar build → submeter
```