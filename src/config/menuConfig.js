export const defaultMenuSettings = {
  colors: {
    background: '#1a1a1a', // Solid dark background for better contrast
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

export const defaultFooterSettings = {
  colors: {
    background: '#1a1a1a',
    text: '#a1a1aa',
    heading: '#ffffff',
    link: '#facc15',
    separator: '#3f3f46',
  },
  description: 'Sua voz, nossa ação. Juntos por uma cidade melhor.',
  copyrightText: '© {year} {siteName}. Todos os direitos reservados.',
  contact: {
    isVisible: true,
    title: 'Contato',
    address: 'Floresta, Pernambuco, Brasil',
    phone: '(87) 99999-9999',
    email: 'contato@trombonecidadao.com',
  },
  socialMedia: [
    { platform: 'Facebook', url: 'https://facebook.com', isVisible: true },
    { platform: 'Instagram', url: 'https://instagram.com', isVisible: true },
    { platform: 'Twitter', url: 'https://twitter.com', isVisible: true },
    { platform: 'Youtube', url: 'https://youtube.com', isVisible: false },
  ],
  linkColumns: [
    {
      title: 'Navegação',
      isVisible: true,
      links: [
        { name: 'Início', path: '/', isVisible: true },
        { name: 'Sobre', path: '/sobre', isVisible: true },
        { name: 'Estatísticas', path: '/estatisticas', isVisible: true },
        { name: 'Notícias', path: '/noticias', isVisible: true },
      ],
    },
    {
      title: 'Recursos',
      isVisible: true,
      links: [
        { name: 'Obras Públicas', path: '/obras-publicas', isVisible: true },
        { name: 'Mapa de Pavimentação', path: '/mapa-pavimentacao', isVisible: true },
        { name: 'Serviços', path: '/servicos', isVisible: true },
        { name: 'Termos de Uso', path: '/termos-de-uso', isVisible: true },
      ],
    },
  ],
};

export const availableIcons = [
  'LayoutDashboard', 'Info', 'BarChart2', 'User', 'Construction', 'Route', 
  'Briefcase', 'Newspaper', 'Shield', 'Home', 'Settings', 'Mail', 'Phone',
  'MapPin', 'Globe', 'Server', 'Cloud', 'Code', 'Activity', 'Airplay', 'AlertCircle',
  'AlignCenter', 'Anchor', 'Aperture', 'Archive', 'Award', 'Bell', 'BookOpen',
  'Bookmark', 'Box', 'Camera', 'CheckSquare', 'ChevronDown', 'Circle', 'Clipboard',
  'Clock', 'Compass', 'Copy', 'CreditCard', 'Crop', 'Database', 'Disc', 'Download',
  'Droplet', 'Edit', 'ExternalLink', 'Eye', 'Facebook', 'File', 'FileSignature', 'Film', 'Filter',
  'Flag', 'Folder', 'Gift', 'Github', 'Grid', 'HardDrive', 'Hash', 'Heart',
  'Image', 'Inbox', 'Instagram', 'Key', 'Link', 'List', 'Lock', 'LogIn', 'LogOut',
  'Maximize', 'Menu', 'MessageCircle', 'Mic', 'Minimize', 'Monitor', 'Moon', 'MoreHorizontal',
  'Move', 'Music', 'Package', 'Paperclip', 'Pause', 'PenTool', 'Percent', 'PieChart',
  'Play', 'Plus', 'Power', 'Printer', 'Radio', 'RefreshCcw', 'Repeat', 'Rewind', 'Save',
  'Scissors', 'Search', 'Send', 'Share2', 'ShoppingBag', 'ShoppingCart', 'Sidebar',
  'Slash', 'Smartphone', 'Smile', 'Speaker', 'Star', 'Sun', 'Sunrise', 'Sunset',
  'Table', 'Tag', 'Target', 'Terminal', 'ThumbsDown', 'ThumbsUp', 'ToggleLeft', 'ToggleRight',
  'Tool', 'Trash2', 'TrendingUp', 'Truck', 'Tv', 'Twitter', 'Type', 'Umbrella', 'Unlock',
  'Upload', 'Video', 'Voicemail', 'Volume2', 'Watch', 'Wifi', 'Wind', 'X', 'Youtube', 'Zap', 'ZoomIn', 'ZoomOut'
];

export const socialPlatforms = [
  'Facebook', 'Instagram', 'Twitter', 'Youtube', 'Linkedin', 'Github', 'Tiktok', 'Whatsapp'
];