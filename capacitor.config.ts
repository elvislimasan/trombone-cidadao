import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.trombonecidadao.app',
  appName: 'Trombone Cidadão',
  webDir: 'dist',
  // ✅ BUILD STANDALONE: App funciona offline
  // Não há server.url configurado, então o app carrega arquivos locais do dist/
  // Isso significa que o app funciona completamente offline após instalação
  server: {
    androidScheme: 'https'
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false, // ESSENCIAL: impede a sobreposição
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
