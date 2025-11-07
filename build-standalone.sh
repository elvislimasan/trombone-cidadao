#!/bin/bash

# ==========================================
# Script de Build Standalone para Produção
# ==========================================
# Este script faz o build completo do app Android
# usando as variáveis de produção do .env.production

set -e  # Para na primeira ocorrência de erro

echo "🚀 Iniciando build standalone para produção..."
echo ""

# Verificar se .env.production existe
if [ ! -f .env.production ]; then
    echo "❌ Erro: Arquivo .env.production não encontrado!"
    echo "   Crie o arquivo .env.production com suas variáveis de produção."
    exit 1
fi

echo "✅ Arquivo .env.production encontrado"
echo ""

# Passo 1: Build do site com variáveis de produção
echo "📦 Passo 1/4: Build do site com variáveis de produção..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Erro no build do site!"
    exit 1
fi

echo "✅ Build do site concluído"
echo ""

# Passo 2: Limpar builds anteriores (opcional)
echo "🧹 Passo 2/4: Limpando builds anteriores..."
cd android && ./gradlew clean && cd ..
echo "✅ Limpeza concluída"
echo ""

# Passo 3: Sincronizar com Capacitor
echo "🔄 Passo 3/4: Sincronizando arquivos com Capacitor..."
npx cap sync

if [ $? -ne 0 ]; then
    echo "❌ Erro ao sincronizar com Capacitor!"
    exit 1
fi

echo "✅ Sincronização concluída"
echo ""

# Passo 4: Build do APK
echo "📱 Passo 4/4: Build do APK de produção..."
cd android && ./gradlew assembleRelease && cd ..

if [ $? -ne 0 ]; then
    echo "❌ Erro no build do APK!"
    exit 1
fi

echo ""
echo "✅ Build standalone concluído com sucesso!"
echo ""
echo "📦 APK gerado em:"
echo "   android/app/build/outputs/apk/release/app-release.apk"
echo ""
echo "💡 Para instalar no dispositivo:"
echo "   adb install android/app/build/outputs/apk/release/app-release.apk"
echo ""

