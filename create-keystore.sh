#!/bin/bash
# Script para criar keystore para Android
# ==========================================

echo "🔐 Criando keystore para Trombone Cidadão..."
echo ""

# Verificar se keytool está disponível
if ! command -v keytool &> /dev/null; then
    echo "❌ Erro: keytool não encontrado!"
    echo "   Certifique-se de que o Java JDK está instalado."
    exit 1
fi

# Criar keystore
keytool -genkey -v -keystore android/app/trombone-cidadao-release.keystore \
    -alias trombone-cidadao \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000

echo ""
echo "✅ Keystore criada com sucesso!"
echo ""
echo "⚠️  IMPORTANTE:"
echo "   1. Guarde a senha em local SEGURO!"
echo "   2. Faça backup da keystore!"
echo "   3. Se perder a keystore, não poderá atualizar o app na Play Store!"
echo ""
echo "📝 Próximos passos:"
echo "   1. Copie android/keystore.properties.template para android/keystore.properties"
echo "   2. Preencha com as senhas e informações da keystore"
echo "   3. Execute: npm run build:standalone"
echo ""

