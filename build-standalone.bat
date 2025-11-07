@echo off
REM ==========================================
REM Script de Build Standalone para Produção (Windows)
REM ==========================================
REM Este script faz o build completo do app Android
REM usando as variáveis de produção do .env.production

echo.
echo 🚀 Iniciando build standalone para produção...
echo.

REM Verificar se .env.production existe
if not exist .env.production (
    echo ❌ Erro: Arquivo .env.production não encontrado!
    echo    Crie o arquivo .env.production com suas variáveis de produção.
    exit /b 1
)

echo ✅ Arquivo .env.production encontrado
echo.

REM Passo 1: Build do site com variáveis de produção
echo 📦 Passo 1/4: Build do site com variáveis de produção...
call npm run build
if errorlevel 1 (
    echo ❌ Erro no build do site!
    exit /b 1
)
echo ✅ Build do site concluído
echo.

REM Passo 2: Limpar builds anteriores (opcional)
echo 🧹 Passo 2/4: Limpando builds anteriores...
cd android
call gradlew.bat clean
cd ..
echo ✅ Limpeza concluída
echo.

REM Passo 3: Sincronizar com Capacitor
echo 🔄 Passo 3/4: Sincronizando arquivos com Capacitor...
call npx cap sync
if errorlevel 1 (
    echo ❌ Erro ao sincronizar com Capacitor!
    exit /b 1
)
echo ✅ Sincronização concluída
echo.

REM Passo 4: Build do APK
echo 📱 Passo 4/4: Build do APK de produção...
cd android
call gradlew.bat assembleRelease
cd ..
if errorlevel 1 (
    echo ❌ Erro no build do APK!
    exit /b 1
)

echo.
echo ✅ Build standalone concluído com sucesso!
echo.
echo 📦 APK gerado em:
echo    android\app\build\outputs\apk\release\app-release.apk
echo.
echo 💡 Para instalar no dispositivo:
echo    adb install android\app\build\outputs\apk\release\app-release.apk
echo.

