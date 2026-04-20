
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Variáveis ausentes: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (recomendado) ou SUPABASE_ANON_KEY.'
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

const defaultMenuSettings = {
  colors: {
    background: '#1a1a1a', 
    text: '#FFFFFF',
  },
  items: [
    { name: 'Início', path: '/', icon: 'LayoutDashboard', isVisible: true },
    { name: 'Sobre', path: '/sobre', icon: 'Info', isVisible: true },
    { name: 'Estatísticas', path: '/estatisticas', icon: 'BarChart2', isVisible: true },
    { name: 'Obras', path: '/obras-publicas', icon: 'Construction', isVisible: true },
    { name: 'Pavimentação', path: '/mapa-pavimentacao', icon: 'Route', isVisible: true },
    { name: 'Serviços', path: '/servicos', icon: 'Briefcase', isVisible: true },
    { name: 'Abaixo-Assinados', path: '/abaixo-assinados', icon: 'FileSignature', isVisible: true },
    { name: 'Notícias', path: '/noticias', icon: 'Newspaper', isVisible: true },
  ],
};

async function updateMenuSettings() {
  console.log('Buscando configurações atuais...');
  const { data, error } = await supabase
    .from('site_config')
    .select('menu_settings')
    .eq('id', 1)
    .single();

  if (error) {
    console.error('Erro ao buscar configurações:', error);
    return;
  }

  const currentSettings = data.menu_settings || {};
  let newItems = [];

  if (currentSettings.items) {
      // Mesclar: Manter configurações existentes para itens que já existem, adicionar novos
      newItems = defaultMenuSettings.items.map(defaultItem => {
          const existingItem = currentSettings.items.find(i => i.path === defaultItem.path);
          if (existingItem) {
              return existingItem; // Mantém visibilidade/ícone personalizado
          }
          return defaultItem; // Adiciona novo item (Abaixo-Assinados)
      });
  } else {
      newItems = defaultMenuSettings.items;
  }

  const newSettings = {
      ...currentSettings,
      items: newItems
  };

  console.log('Atualizando configurações no banco...');
  const { error: updateError } = await supabase
    .from('site_config')
    .update({ menu_settings: newSettings })
    .eq('id', 1);

  if (updateError) {
    console.error('Erro ao atualizar configurações:', updateError);
  } else {
    console.log('Configurações atualizadas com sucesso! O item Abaixo-Assinados foi adicionado ao banco.');
  }
}

updateMenuSettings();
