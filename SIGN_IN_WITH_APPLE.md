# Configurar Sign in with Apple

Este documento cobre todas as etapas **externas** (fora do código) que precisam ser feitas para o Sign in with Apple funcionar.

---

## Pré-requisitos

- Acesso ao [Apple Developer Portal](https://developer.apple.com)
- Acesso ao [Supabase Dashboard](https://supabase.com/dashboard)
- Xcode aberto com o projeto `App.xcworkspace`
- Bundle ID: `com.trombonecidadao.app`

---

## Passo 1 — Ativar Sign in with Apple no App ID

1. Acesse [developer.apple.com/account/resources/identifiers](https://developer.apple.com/account/resources/identifiers)
2. Clique no App ID `com.trombonecidadao.app`
3. Em **Capabilities**, marque a caixa **Sign In with Apple**
4. Certifique-se de que está marcado como **Enable as a primary App ID**
5. Clique em **Save**

---

## Passo 2 — Criar uma Key com Sign in with Apple

1. Acesse [developer.apple.com/account/resources/authkeys](https://developer.apple.com/account/resources/authkeys)
2. Clique no botão **+** para criar uma nova Key
3. Dê um nome (ex: `Trombone Cidadao Sign In`)
4. Marque **Sign In with Apple**
5. Clique em **Configure** ao lado de Sign In with Apple
6. Em **Primary App ID**, selecione `com.trombonecidadao.app`
7. Clique em **Save**, depois **Continue**, depois **Register**
8. **Baixe o arquivo `.p8`** — só é possível baixar UMA VEZ, guarde em lugar seguro
9. Anote o **Key ID** (ex: `ABC1234567`)

---

## Passo 3 — Anotar as informações necessárias

Você vai precisar de:

| Campo | Onde encontrar |
|-------|---------------|
| **Team ID** | developer.apple.com → Account → Membership → Team ID |
| **Key ID** | developer.apple.com → Certificates → Keys → sua key |
| **Arquivo .p8** | Baixado no Passo 2 |
| **Client ID (Bundle ID)** | `com.trombonecidadao.app` |

---

## Passo 4 — Configurar Apple no Supabase

O Supabase tem 3 campos para o Apple provider:

### 4.1 — Ativar e preencher

1. Acesse o Supabase Dashboard → **Authentication → Providers**
2. Encontre **Apple** e ative o toggle
3. Preencha os campos:

---

**Client IDs**

Cole o Bundle ID do app:
```
com.trombonecidadao.app
```

---

**Secret Key for OAuth**

Este campo não aceita o arquivo `.p8` diretamente. Você precisa gerar um **JWT** assinado com ele. Siga os passos abaixo:

#### Gerar o Secret Key (JWT)

Você vai precisar de:
- **Team ID** — encontrado em [developer.apple.com](https://developer.apple.com) → Account → Membership Details → Team ID (10 caracteres, ex: `ABC1234567`)
- **Key ID** — a Key que você criou no Passo 2 (ex: `XYZ9876543`)
- **Arquivo .p8** — baixado no Passo 2

**Opção A — Usando o site jwt.io (mais fácil):**

1. Acesse [jwt.io](https://jwt.io)
2. Em **Algorithm**, selecione `ES256`
3. Em **Header**, coloque:
   ```json
   {
     "alg": "ES256",
     "kid": "SEU_KEY_ID"
   }
   ```
4. Em **Payload**, coloque (ajuste as datas):
   ```json
   {
     "iss": "SEU_TEAM_ID",
     "iat": 1747699200,
     "exp": 1763251200,
     "aud": "https://appleid.apple.com",
     "sub": "com.trombonecidadao.app"
   }
   ```
   > Para `iat` use o timestamp atual (segundos). Para `exp` use até 6 meses à frente.
   > Converta datas em [epochconverter.com](https://epochconverter.com)

5. Em **Verify Signature**, cole o conteúdo do arquivo `.p8` no campo **Private Key**
6. Copie o JWT gerado (o texto longo no lado esquerdo) — esse é o **Secret Key**

**Opção B — Usando terminal (Node.js):**

```bash
node -e "
const fs = require('fs');
const crypto = require('crypto');

const teamId = 'SEU_TEAM_ID';
const keyId = 'SEU_KEY_ID';
const clientId = 'com.trombonecidadao.app';
const privateKey = fs.readFileSync('caminho/para/arquivo.p8', 'utf8');

const now = Math.floor(Date.now() / 1000);
const exp = now + 15552000; // 180 dias

const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: keyId })).toString('base64url');
const payload = Buffer.from(JSON.stringify({ iss: teamId, iat: now, exp, aud: 'https://appleid.apple.com', sub: clientId })).toString('base64url');
const data = header + '.' + payload;
const sign = crypto.createSign('SHA256');
sign.update(data);
const sig = sign.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
console.log(data + '.' + sig);
"
```

Cole o JWT gerado no campo **Secret Key for OAuth** do Supabase.

---

**Allow users without an email**

Deixe **desativado** (false). Usuários que escolhem ocultar o email do Apple receberão um email relay (`@privaterelay.appleid.com`) — isso já funciona. Ativar esse campo permitiria contas sem email nenhum, o que pode causar problemas no perfil.

---

4. Clique em **Save**

---

## Passo 5 — Adicionar URL de redirect no Supabase

1. No Supabase Dashboard, vá em **Authentication → URL Configuration**
2. Em **Redirect URLs**, adicione:
   ```
   com.trombonecidadao.app://painel-usuario
   ```
3. Clique em **Save**

---

## Passo 6 — Adicionar capability Sign in with Apple no Xcode

1. Abra `ios/App/App.xcworkspace` no Xcode
2. Clique no target **App** (ícone azul na lista de arquivos)
3. Vá na aba **Signing & Capabilities**
4. Clique em **+ Capability** (botão no canto superior esquerdo da aba)
5. Procure por **Sign In with Apple** e dê duplo clique
6. A capability vai aparecer na lista

---

## Passo 7 — Sincronizar e fazer novo build

Após configurar tudo, execute no terminal:

```bash
npm run build
npx cap sync ios
```

Depois no Xcode:
- **Product → Clean Build Folder** (`Shift + Cmd + K`)
- **Product → Archive**
- Distribute como **App Store Connect** (Build 3)

---

## Verificação

Após subir o novo build, o botão **"Continuar com Apple"** na tela de login deve:
- No iPhone: abrir o painel nativo do iOS para escolher Apple ID
- No web: redirecionar para a página de login da Apple

---

## Solução de problemas

| Erro | Solução |
|------|---------|
| `invalid_client` no Supabase | Verifique se o Team ID, Key ID e conteúdo do .p8 estão corretos |
| `Sign in with Apple not available` | O device não tem Apple ID configurado, ou o simulador não suporta |
| `AuthorizationErrorCode.unknown` | Certifique-se que o Bundle ID está correto e o App ID tem Sign in with Apple ativado |
| `nonce mismatch` | Erro interno — não deve ocorrer com a implementação atual |
