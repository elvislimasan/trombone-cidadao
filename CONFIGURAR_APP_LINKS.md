# Configurar App Links (Deep Links) para Android

Para que os links compartilhados abram diretamente no app (se instalado), é necessário configurar Android App Links.

## 1. Configurar AndroidManifest.xml

Edite o arquivo `android/app/src/main/AndroidManifest.xml` e adicione a seguinte configuração dentro da tag `<activity>` principal:

```xml
<activity
    android:name=".MainActivity"
    ...>
    
    <!-- Intent Filter para App Links -->
    <intent-filter android:autoVerify="true">
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        
        <!-- URL scheme para deep links -->
        <data android:scheme="trombonecidadao" android:host="bronca" />
        
        <!-- App Links (HTTPS) -->
        <data 
            android:scheme="https"
            android:host="trombone-cidadao.vercel.app"
            android:pathPrefix="/bronca" />
    </intent-filter>
</activity>
```

## 2. Criar arquivo assetlinks.json no servidor

Crie o arquivo `.well-known/assetlinks.json` no servidor (Vercel) com o seguinte conteúdo:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.trombonecidadao.app",
    "sha256_cert_fingerprints": [
      "SEU_SHA256_FINGERPRINT_AQUI"
    ]
  }
}]
```

### Como obter o SHA256 Fingerprint:

**IMPORTANTE**: Você já tem um keystore em `android/trombone-cidadao-release.keystore`. Use este keystore para obter o fingerprint.

1. Obtenha o fingerprint do keystore existente:
```bash
cd android
keytool -list -v -keystore trombone-cidadao-release.keystore -alias trombone-cidadao
```

**Nota**: O alias é `trombone-cidadao` (conforme `keystore.properties`). Se pedir senha, use a senha do keystore.

**OU** se o alias for diferente, verifique o arquivo `keystore.properties` para ver o alias correto:
```bash
cat keystore.properties
```

2. Quando executar o comando, procure pela linha que contém "SHA256:":
```
Certificate fingerprints:
     SHA1: XX:XX:XX:...
     SHA256: XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX
```

3. Copie o valor de "SHA256:" (sem os dois pontos `:`) e cole no `assetlinks.json` em `public/.well-known/assetlinks.json`

**Exemplo**: Se o SHA256 for `AA:BB:CC:DD:...`, no JSON use `"AABBCCDD..."` (sem os dois pontos)

## 3. Hospedar assetlinks.json

O arquivo deve estar acessível em **ambos os ambientes**:
- **Dev (Vercel)**: `https://trombone-cidadao.vercel.app/.well-known/assetlinks.json`
- **Produção**: `https://trombonecidadao.com.br/.well-known/assetlinks.json`

### Para Vercel:

Crie a pasta `public/.well-known/` e coloque o arquivo `assetlinks.json` lá. Ele será servido automaticamente em ambos os ambientes quando você fizer deploy.

### Para Produção:

Certifique-se de que o arquivo também está acessível no servidor de produção. Se você usa o mesmo repositório para ambos os ambientes, o arquivo em `public/.well-known/assetlinks.json` será servido automaticamente.

## 4. Verificar configuração

Use a ferramenta do Google para verificar **ambos os ambientes**:

**Dev (Vercel):**
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://trombone-cidadao.vercel.app&relation=delegate_permission/common.handle_all_urls

**Produção:**
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://trombonecidadao.com.br&relation=delegate_permission/common.handle_all_urls

Ambos devem retornar o JSON com o SHA256 fingerprint configurado.

## 5. Testar Deep Links

Após configurar, teste com:
```bash
adb shell am start -a android.intent.action.VIEW -d "trombonecidadao://bronca/SEU_REPORT_ID" com.trombonecidadao.app
```

Ou teste com link HTTPS (Dev):
```bash
adb shell am start -a android.intent.action.VIEW -d "https://trombone-cidadao.vercel.app/bronca/SEU_REPORT_ID" com.trombonecidadao.app
```

Ou teste com link HTTPS (Produção):
```bash
adb shell am start -a android.intent.action.VIEW -d "https://trombonecidadao.com.br/bronca/SEU_REPORT_ID" com.trombonecidadao.app
```

## Nota Importante

- O `assetlinks.json` deve estar acessível via HTTPS
- O certificado usado para assinar o APK deve corresponder ao fingerprint no `assetlinks.json`
- Pode levar algumas horas para o Android verificar e ativar os App Links

