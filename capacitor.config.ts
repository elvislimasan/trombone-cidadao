import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.trombonecidadao.app',
  appName: 'Trombone Cidadão',
  webDir: 'dist',
  // ✅ BUILD STANDALONE: App funciona offline
  // Não há server.url configurado, então o app carrega arquivos locais do dist/
  // Isso significa que o app funciona completamente offline após instalação
  server: {
    androidScheme: 'https',
    // ⚠️ ATENÇÃO: Para Live Reload funcionar com 'yarn android:live', descomente as linhas abaixo
    // url: 'https://trombonecidadao.com.br',
    // url: 'http://192.168.100.107:3002',
    // url:  'https://2e08-2804-e94-93b-f200-65a2-6b74-cead-60ad.ngrok-free.app',
    cleartext: true
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false, // ESSENCIAL: impede a sobreposição
    },
    Camera: {
      enableZoom: true,
    
      quality: 70,
      allowEditing: false,
      resultType: "uri"
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 3000,
      showSpinner: false,
      androidScaleType: "CENTER_INSIDE",
      backgroundColor: "#4a2121"
    },
    PushNotifications: {
      // ✅ APRESENTAR NOTIFICAÇÕES TANTO EM FOREGROUND QUANTO EM BACKGROUND
      presentationOptions: ["badge", "sound", "alert"]
    }
  },
  // ✅ CONFIGURAÇÃO iOS PARA SAFE AREAS
  ios: {
    contentInset: 'automatic'
  }
};

export default config;
