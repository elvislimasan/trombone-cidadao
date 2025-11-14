@echo off
echo ========================================
echo DEPLOY EDGE FUNCTION - PRODUCAO
echo ========================================
echo.

REM Verificar se Supabase CLI está instalado
where supabase >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Supabase CLI nao encontrado!
    echo Instale com: npm install -g supabase
    pause
    exit /b 1
)

echo [1/4] Verificando autenticacao...
supabase projects list >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [AVISO] Nao autenticado. Fazendo login...
    supabase login
    if %ERRORLEVEL% NEQ 0 (
        echo [ERRO] Falha ao fazer login!
        pause
        exit /b 1
    )
)

echo [2/4] Verificando projeto linkado...
supabase status >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [AVISO] Projeto nao linkado.
    echo Por favor, forneca o Project Ref do Supabase:
    set /p PROJECT_REF="Project Ref: "
    if "!PROJECT_REF!"=="" (
        echo [ERRO] Project Ref nao fornecido!
        pause
        exit /b 1
    )
    supabase link --project-ref !PROJECT_REF!
    if %ERRORLEVEL% NEQ 0 (
        echo [ERRO] Falha ao linkar projeto!
        pause
        exit /b 1
    )
)

echo [3/4] Verificando arquivo da function...
if not exist "supabase\functions\send-push-notification\index.ts" (
    echo [ERRO] Arquivo da function nao encontrado!
    echo Esperado: supabase\functions\send-push-notification\index.ts
    pause
    exit /b 1
)

echo [4/4] Fazendo deploy da function...
supabase functions deploy send-push-notification
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Falha no deploy!
    pause
    exit /b 1
)

echo.
echo ========================================
echo DEPLOY CONCLUIDO COM SUCESSO!
echo ========================================
echo.
echo IMPORTANTE: Verifique se as variaveis de ambiente estao configuradas:
echo - VAPID_PUBLIC_KEY
echo - VAPID_PRIVATE_KEY
echo - VAPID_EMAIL
echo - FIREBASE_SERVICE_ACCOUNT (ou FIREBASE_PRIVATE_KEY + FIREBASE_CLIENT_EMAIL)
echo - FIREBASE_PROJECT_ID
echo.
echo Acesse: https://app.supabase.com - Edge Functions - Settings - Environment Variables
echo.
pause


