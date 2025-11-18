# Como Testar App Links no Emulador Android Studio

## ⚠️ Importante: App Links HTTPS vs Deep Links Customizados

No emulador, os **App Links HTTPS** (`https://trombone-cidadao.vercel.app/bronca/[ID]`) podem não funcionar imediatamente porque:
- Builds de debug usam certificado diferente do release
- O Android precisa verificar o `assetlinks.json` no servidor
- Pode levar horas para a verificação ser concluída

**Solução**: Use **Deep Links Customizados** (`trombonecidadao://bronca/[ID]`) para testar no emulador. Eles funcionam imediatamente!

## 1. Testar Deep Link Customizado (Recomendado para Emulador)

### Via ADB (Terminal):

```bash
# Substitua SEU_REPORT_ID pelo ID real de uma bronca
adb shell am start -a android.intent.action.VIEW -d "trombonecidadao://bronca/SEU_REPORT_ID" com.trombonecidadao.app
```

**Exemplo**:
```bash
adb shell am start -a android.intent.action.VIEW -d "trombonecidadao://bronca/2684b2be-67fc-4a0b-ac29-5f765c3ed924" com.trombonecidadao.app
```

### Via Android Studio:

1. Abra o **Device Manager** no Android Studio
2. Clique nos **3 pontos** ao lado do emulador
3. Selecione **"Edit"**
4. Vá em **"Advanced Settings"**
5. Em **"Open URL"**, cole: `trombonecidadao://bronca/SEU_REPORT_ID`
6. Clique em **"Apply"** e depois **"Run"**

### Via Browser no Emulador:

1. Abra o Chrome no emulador
2. Digite na barra de endereço: `trombonecidadao://bronca/SEU_REPORT_ID`
3. O app deve abrir automaticamente

## 2. Testar App Link HTTPS (Pode não funcionar no emulador)

Se você quiser testar App Links HTTPS, primeiro precisa:

1. **Obter o SHA256 do certificado de debug**:
```bash
# No Windows (Git Bash ou PowerShell)
cd android
keytool -list -v -keystore "%USERPROFILE%\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android
```

2. **Adicionar o SHA256 de debug ao assetlinks.json**:
   - Copie o SHA256 (sem os dois pontos)
   - Adicione ao array `sha256_cert_fingerprints` em `public/.well-known/assetlinks.json`
   - Faça deploy no Vercel

3. **Forçar verificação no Android**:
```bash
adb shell pm set-app-links --package com.trombonecidadao.app 0 all
adb shell pm verify-app-links --re-verify com.trombonecidadao.app
```

4. **Testar**:
```bash
adb shell am start -a android.intent.action.VIEW -d "https://trombone-cidadao.vercel.app/bronca/SEU_REPORT_ID" com.trombonecidadao.app
```

## 3. Verificar se o Deep Link está Funcionando

### No Logcat do Android Studio:

1. Abra o **Logcat** no Android Studio
2. Filtre por: `[App]`
3. Você deve ver logs como:
   ```
   [App] Deep link detectado no launch: trombonecidadao://bronca/...
   [App] Processando deep link: trombonecidadao://bronca/...
   [App] Navegando para bronca: ...
   ```

### Verificar se o App Abriu a Página Correta:

- O app deve abrir diretamente na página da bronca
- A URL na barra de navegação deve mostrar `/bronca/[ID]`

## 4. Troubleshooting

### O link não abre o app:

1. **Verifique se o app está instalado**:
```bash
adb shell pm list packages | grep trombonecidadao
```

2. **Verifique se o intent-filter está correto**:
   - Abra `android/app/src/main/AndroidManifest.xml`
   - Verifique se o intent-filter com `trombonecidadao://bronca` está presente

3. **Reinstale o app**:
```bash
npm run android:build
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### O app abre mas não navega para a bronca:

1. **Verifique os logs no Logcat**:
   - Procure por erros em `[App]`
   - Verifique se o ID da bronca foi extraído corretamente

2. **Teste manualmente no código**:
   - Adicione `console.log` no `handleDeepLink` para debug

### App Links HTTPS não funcionam:

- **Isso é normal no emulador com build de debug**
- Use deep links customizados (`trombonecidadao://`) para testar
- App Links HTTPS funcionarão em produção com build release

## 5. Testar em Dispositivo Real

Para testar App Links HTTPS em um dispositivo real:

1. **Build release**:
```bash
npm run android:build-release
```

2. **Instale no dispositivo**:
```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

3. **Configure o assetlinks.json** com o SHA256 do keystore de release

4. **Teste compartilhando um link** de uma bronca via WhatsApp ou outro app

## Nota Final

- **Deep Links Customizados** (`trombonecidadao://`) funcionam imediatamente
- **App Links HTTPS** requerem configuração do `assetlinks.json` e podem levar tempo para verificação
- Para desenvolvimento/testes, use deep links customizados
- Para produção, configure corretamente o `assetlinks.json` com o SHA256 do keystore de release

