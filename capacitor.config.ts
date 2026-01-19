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
    url: 'https://trombonecidadao.com.br',
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
      launchShowDuration: 0
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
