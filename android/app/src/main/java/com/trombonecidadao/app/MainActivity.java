package com.trombonecidadao.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.WebView;
import android.webkit.JavascriptInterface;
import android.util.Log;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.trombonecidadao.app.VideoProcessorPlugin;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    private static final String ACTION_PUSH_NOTIFICATION = "com.trombonecidadao.app.PUSH_NOTIFICATION";
    private PushNotificationReceiver pushNotificationReceiver;
    
    @Override
    public void onCreate(Bundle savedInstanceState) {
        try {
            registerPlugin(VideoProcessorPlugin.class);
        } catch (Exception e) {
            e.printStackTrace();
        }
        // Habilitar edge-to-edge (fullscreen) e respeitar safe areas
        // IMPORTANTE: Deve ser chamado ANTES de super.onCreate()
        try {
            WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        } catch (Exception e) {
            e.printStackTrace();
        }
        
        super.onCreate(savedInstanceState);
        
        // Configurar controle de insets para respeitar safe areas
        WindowInsetsControllerCompat windowInsetsController =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        
        if (windowInsetsController != null) {
            // Configurar comportamento da barra de status
            windowInsetsController.setAppearanceLightStatusBars(false);
            windowInsetsController.setAppearanceLightNavigationBars(false);
            
            // Garantir que as barras do sistema são visíveis
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                WindowInsetsController insetsController = getWindow().getInsetsController();
                if (insetsController != null) {
                    insetsController.show(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                }
            }
        }
        
        // Garantir que o layout é aplicado corretamente
        if (getWindow().getDecorView() != null) {
            try {
                getWindow().getDecorView().setOnApplyWindowInsetsListener((view, insets) -> {
                    // Aplicar insets para que o WebView respeite as safe areas
                    // IMPORTANTE: Não aplicar padding aqui - deixar o WebView gerenciar
                    view.setPadding(0, 0, 0, 0);
                    
                    // IMPORTANTE: Não aplicar padding diretamente no WebView
                    // O JavaScript no main.jsx vai gerenciar as safe areas via CSS variables
                    // Isso garante que funciona tanto em debug quanto em produção
                    
                    return insets;
                });
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
        
        // Garantir que o WebView está configurado corretamente
        try {
            // Aguardar um pouco para garantir que o bridge está pronto
            getWindow().getDecorView().post(() -> {
                try {
                    if (getBridge() != null && getBridge().getWebView() != null) {
                        WebView webView = getBridge().getWebView();
                        // Garantir que JavaScript está habilitado
                        webView.getSettings().setJavaScriptEnabled(true);
                        webView.getSettings().setDomStorageEnabled(true);
                        webView.getSettings().setDatabaseEnabled(true);
                        
                        // Garantir que o WebView respeita safe areas
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                            webView.setPadding(0, 0, 0, 0);
                        }
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        } catch (Exception e) {
            e.printStackTrace();
        }
        
        // 🔥 HABILITAR WEBVIEW DEBUG (permite ver console.log no Chrome DevTools)
        // Apenas em debug builds (não em produção)
        // BuildConfig é gerado automaticamente durante o build
        try {
            boolean isDebug = (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
            if (isDebug) {
                WebView.setWebContentsDebuggingEnabled(true);
            }
        } catch (Exception e) {
            // Se falhar, não habilitar debug (padrão seguro para produção)
            e.printStackTrace();
        }
    }
    
    @Override
    public void onStart() {
        super.onStart();
        
        // 🔥 Adicionar JavaScript Interface para abrir configurações do app
        // Executar no onStart para garantir que o bridge está disponível
        try {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                webView.addJavascriptInterface(new AndroidJSInterface(), "Android");
            }
        } catch (Exception e) {
            // Se falhar, tentar novamente no onResume
            e.printStackTrace();
        }
    }
    
    @Override
    public void onResume() {
        super.onResume();
        
        // 🔥 Garantir que JavaScript Interface está configurada
        try {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                // Verificar se já foi adicionado
                try {
                    webView.removeJavascriptInterface("Android");
                } catch (Exception e) {
                    // Ignorar se não existir
                }
                webView.addJavascriptInterface(new AndroidJSInterface(), "Android");
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        
        // ✅ Registrar BroadcastReceiver para receber notificações do FCMService (apenas se não estiver registrado)
        if (pushNotificationReceiver == null) {
            try {
                pushNotificationReceiver = new PushNotificationReceiver();
                IntentFilter filter = new IntentFilter(ACTION_PUSH_NOTIFICATION);
                registerReceiver(pushNotificationReceiver, filter);
                Log.d(TAG, "✅ BroadcastReceiver registrado para push notifications");
            } catch (Exception e) {
                Log.e(TAG, "Erro ao registrar BroadcastReceiver: " + e.getMessage(), e);
            }
        }
    }
    
    @Override
    public void onPause() {
        super.onPause();
        // NÃO desregistrar aqui - apenas no onDestroy
    }
    
    @Override
    public void onDestroy() {
        // Desregistrar BroadcastReceiver antes de chamar super.onDestroy()
        if (pushNotificationReceiver != null) {
            try {
                unregisterReceiver(pushNotificationReceiver);
                pushNotificationReceiver = null;
                Log.d(TAG, "✅ BroadcastReceiver desregistrado");
            } catch (Exception e) {
                // Ignorar se já foi desregistrado ou não foi registrado
                Log.w(TAG, "Aviso ao desregistrar BroadcastReceiver (pode já estar desregistrado): " + e.getMessage());
            }
        }
        super.onDestroy();
    }
    
    // 🔥 BroadcastReceiver para receber notificações do FCMService
    private class PushNotificationReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (ACTION_PUSH_NOTIFICATION.equals(intent.getAction())) {
                String notificationJson = intent.getStringExtra("notification");
                if (notificationJson != null) {
                    Log.d(TAG, "🔔 [FCM] Notificação recebida do FCMService: " + notificationJson);
                    // Passar notificação para o JavaScript
                    // Executar na UI thread para garantir que o WebView está disponível
                    MainActivity.this.runOnUiThread(() -> {
                        try {
                            Bridge bridge = getBridge();
                            if (bridge != null && bridge.getWebView() != null) {
                                String jsCode = String.format(
                                    "(function() {" +
                                    "  try {" +
                                    "    const notification = %s;" +
                                    "    const event = new CustomEvent('pushNotificationReceived', { detail: notification });" +
                                    "    window.dispatchEvent(event);" +
                                    "    console.log('🔔 [FCM] Evento pushNotificationReceived disparado:', notification);" +
                                    "  } catch(e) {" +
                                    "    console.error('Erro ao processar notificação:', e);" +
                                    "  }" +
                                    "})();",
                                    notificationJson
                                );
                                bridge.getWebView().evaluateJavascript(jsCode, null);
                                Log.d(TAG, "✅ [FCM] Notificação enviada para JavaScript");
                            } else {
                                Log.w(TAG, "⚠️ [FCM] Bridge ou WebView não disponível");
                            }
                        } catch (Exception e) {
                            Log.e(TAG, "❌ [FCM] Erro ao enviar notificação para JavaScript: " + e.getMessage(), e);
                        }
                    });
                }
            }
        }
    }
    
    // 🔥 Classe JavaScript Interface para abrir configurações do app
    public class AndroidJSInterface {
        @JavascriptInterface
        public void openAppSettings() {
            try {
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                Uri uri = Uri.fromParts("package", getPackageName(), null);
                intent.setData(uri);
                startActivity(intent);
            } catch (Exception e) {
                // Tentar método alternativo
                try {
                    Intent intent = new Intent(Settings.ACTION_MANAGE_APPLICATIONS_SETTINGS);
                    startActivity(intent);
                } catch (Exception e2) {
                    e2.printStackTrace();
                }
            }
        }
    }
}

