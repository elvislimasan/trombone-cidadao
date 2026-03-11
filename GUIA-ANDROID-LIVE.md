# Guia para Android Live Reload

## Problema Resolvido
Erro: "Página na web não disponível - Não foi possível carregar a página da web no endereço http://localhost:3000 - connection_refused"

## Causa
- `localhost` no dispositivo Android refere-se ao próprio dispositivo
- Servidor de desenvolvimento está no computador (IP: `192.168.100.107`)
- Dispositivo não consegue acessar `localhost` do computador

## Solução Implementada

### 1. Configuração Automática (Recomendado)
```bash
# Execute o script que detecta IP automaticamente
android-live.bat
```

### 2. Configuração Manual
Se o script automático não funcionar:

1. **Descubra seu IP:**
   ```bash
   ipconfig | findstr IPv4
   ```
   Exemplo: `192.168.100.107`

2. **Atualize os arquivos manualmente:**
   - `capacitor.config.json`: Mude `localhost` para seu IP
   - `package.json`: Atualize script `dev:android`

3. **Execute:**
   ```bash
   npm run dev:android
   npx cap run android -l
   ```

## Passo a Passo

### Terminal 1 - Servidor de Desenvolvimento
```bash
# Com IP automático
android-live.bat
# Ou manualmente
npm run dev:android
```

### Terminal 2 - Executar no Dispositivo
```bash
npx cap run android -l
```

## Solução Alternativa: USB Debugging
Se a rede Wi-Fi não funcionar:

1. **Conecte dispositivo via USB**
2. **Execute:**
   ```bash
   adb reverse tcp:3000 tcp:3000
   npm run dev
   npx cap run android -l --host=localhost
   ```

## Verificações de Problemas Comuns

### 1. Firewall/Antivírus
- Permita porta 3000 no firewall
- Desative antivírus temporariamente

### 2. Rede Wi-Fi
- Computador e dispositivo DEVEM estar na MESMA rede
- Teste ping: `ping 192.168.100.107` (do dispositivo)

### 3. Servidor Acessível?
- Teste no navegador do PC: `http://192.168.100.107:3000`
- Deve mostrar o app

### 4. Build Corrompido?
```bash
npm run clean
npm run build:clean
npx cap sync android
```

## Scripts Disponíveis

| Comando | Descrição |
|---------|-----------|
| `android-live.bat` | Configuração automática + execução |
| `npm run dev:android` | Servidor com IP correto |
| `npx cap run android -l` | Live reload no dispositivo |
| `npm run android` | Build normal (sem live reload) |
| `fix-android-live.bat` | Corrige problemas de build |

## Dicas

1. **Use cabo USB** para debugging mais estável
2. **Monitore logs:** `adb logcat | findstr "Chromium\|WebView"`
3. **Build normal** se live reload falhar: `npm run android`
4. **Reinicie tudo** se persistir: Servidor + App + ADB

## Troubleshooting

### "Connection Refused"
- Verifique se servidor está rodando
- Confirme IP correto
- Teste no navegador do PC

### "Tela Preta"
- Execute `fix-android-live.bat`
- Use build normal: `npm run android`

### "App Congela"
- Bundle muito grande (3.2MB)
- Use build normal ou otimize código
- Desative hot reload complexo

### Logs de Erro
```bash
# Ver erros WebView
adb logcat | findstr "Web Console"

# Ver erros JavaScript
adb logcat | findstr "chromium"
```

## Contato
Problemas persistentes? Verifique:
1. Logs completos do ADB
2. Console do Chrome DevTools (device)
3. Issues no repositório