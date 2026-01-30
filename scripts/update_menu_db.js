
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xxdletrjyjajtrmhwzev.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4ZGxldHJqeWphanRybWh3emV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3MjMzNjksImV4cCI6MjA3NzI5OTM2OX0.DySq0AnK3aIi4RmJR--8_6wl72Ktj9exaxqYk6pP3Yo';

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
