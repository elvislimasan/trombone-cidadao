/**
 * Script para garantir que o capacitor.config.json copiado para Android
 * não tenha server.url no build standalone
 */

const fs = require('fs');
const path = require('path');

const capacitorConfigPath = path.join(__dirname, 'android', 'app', 'src', 'main', 'assets', 'capacitor.config.json');

if (fs.existsSync(capacitorConfigPath)) {
  try {
    const configContent = fs.readFileSync(capacitorConfigPath, 'utf8');
    const config = JSON.parse(configContent);
    
    // Remover server.url se existir (para build standalone)
    if (config.server && config.server.url) {
      delete config.server.url;
      // Salvar config atualizado
      fs.writeFileSync(capacitorConfigPath, JSON.stringify(config, null, '\t'), 'utf8');
    }
  } catch (error) {
    console.error('Erro ao processar capacitor.config.json:', error);
    process.exit(1);
  }
}







