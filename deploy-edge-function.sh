#!/bin/bash

echo "========================================"
echo "DEPLOY EDGE FUNCTION - PRODUCAO"
echo "========================================"
echo ""

# Verificar se Supabase CLI está instalado
if ! command -v supabase &> /dev/null; then
    echo "[ERRO] Supabase CLI não encontrado!"
    echo "Instale com: npm install -g supabase"
    exit 1
fi

echo "[1/4] Verificando autenticação..."
if ! supabase projects list &> /dev/null; then
    echo "[AVISO] Não autenticado. Fazendo login..."
    supabase login
    if [ $? -ne 0 ]; then
        echo "[ERRO] Falha ao fazer login!"
        exit 1
    fi
fi

echo "[2/4] Verificando projeto linkado..."
if ! supabase status &> /dev/null; then
    echo "[AVISO] Projeto não linkado."
    echo "Por favor, forneça o Project Ref do Supabase:"
    read -p "Project Ref: " PROJECT_REF
    if [ -z "$PROJECT_REF" ]; then
        echo "[ERRO] Project Ref não fornecido!"
        exit 1
    fi
    supabase link --project-ref "$PROJECT_REF"
    if [ $? -ne 0 ]; then
        echo "[ERRO] Falha ao linkar projeto!"
        exit 1
    fi
fi

echo "[3/4] Verificando arquivo da function..."
if [ ! -f "supabase/functions/send-push-notification/index.ts" ]; then
    echo "[ERRO] Arquivo da function não encontrado!"
    echo "Esperado: supabase/functions/send-push-notification/index.ts"
    exit 1
fi

echo "[4/4] Fazendo deploy da function..."
supabase functions deploy send-push-notification
if [ $? -ne 0 ]; then
    echo "[ERRO] Falha no deploy!"
    exit 1
fi

echo ""
echo "========================================"
echo "DEPLOY CONCLUIDO COM SUCESSO!"
echo "========================================"
echo ""
echo "IMPORTANTE: Verifique se as variáveis de ambiente estão configuradas:"
echo "- VAPID_PUBLIC_KEY"
echo "- VAPID_PRIVATE_KEY"
echo "- VAPID_EMAIL"
echo "- FIREBASE_SERVICE_ACCOUNT (ou FIREBASE_PRIVATE_KEY + FIREBASE_CLIENT_EMAIL)"
echo "- FIREBASE_PROJECT_ID"
echo ""
echo "Acesse: https://app.supabase.com - Edge Functions - Settings - Environment Variables"
echo ""



