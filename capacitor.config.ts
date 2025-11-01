import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.seudominio.app',
  appName: 'Trombone Cidadão',
  webDir: 'dist',
  plugins: {
    StatusBar: {
      overlaysWebView: false, // ESSENCIAL: impede a sobreposição
    }
  }
};

export default config;
