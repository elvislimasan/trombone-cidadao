import React, { useState, useRef, useEffect } from 'react';

// Mock data
const mockReports = [
  {
    id: 1,
    title: "Buraco na Rua Principal",
    description: "Grande buraco causando acidentes",
    status: "pending",
    upvotes: 45,
    comments_count: 12,
    categoryIcon: "🚧",
    categoryName: "Infraestrutura",
    location: { lat: -8.0476, lng: -34.8770 },
    created_at: "2025-02-10",
    authorName: "João Silva"
  },
  {
    id: 2,
    title: "Poste sem iluminação",
    description: "Rua escura à noite, perigoso",
    status: "in-progress",
    upvotes: 32,
    comments_count: 8,
    categoryIcon: "💡",
    categoryName: "Iluminação",
    location: { lat: -8.0450, lng: -34.8750 },
    created_at: "2025-02-12",
    authorName: "Maria Santos"
  }
];

const mockPetitions = [
  {
    id: 1,
    title: "Construção de Praça no Bairro Centro",
    description: "Precisamos de um espaço de lazer para as famílias",
    image_url: null,
    signatureCount: 234,
    goal: 500,
    progress: 46.8,
    donationTotal: 1250.00,
    created_at: "2025-02-01"
  },
  {
    id: 2,
    title: "Sinalização de Trânsito na Escola Municipal",
    description: "Segurança para nossas crianças no horário de entrada e saída",
    image_url: null,
    signatureCount: 456,
    goal: 1000,
    progress: 45.6,
    donationTotal: 890.50,
    created_at: "2025-01-28"
  },
  {
    id: 3,
    title: "Coleta Seletiva no Bairro Vila Nova",
    description: "Implementação de programa de reciclagem",
    image_url: null,
    signatureCount: 189,
    goal: 300,
    progress: 63,
    donationTotal: 450.00,
    created_at: "2025-02-05"
  }
];

const mockStats = {
  total: 197,
  pending: 195,
  inProgress: 2,
  resolved: 54
};

// Ícones SVG inline
const Icons = {
  AlertCircle: () => (
    <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Clock: () => (
    <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  TrendingUp: () => (
    <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
  CheckCircle: () => (
    <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Plus: () => (
    <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  ),
  MapIcon: () => (
    <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
    </svg>
  ),
  List: () => (
    <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
  Filter: () => (
    <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
    </svg>
  ),
  X: () => (
    <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  Bell: () => (
    <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  ),
  Home: () => (
    <svg className="w-full h-full" fill="currentColor" viewBox="0 0 20 20">
      <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
    </svg>
  ),
  BarChart: () => (
    <svg className="w-full h-full" fill="currentColor" viewBox="0 0 20 20">
      <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
    </svg>
  ),
  Star: () => (
    <svg className="w-full h-full" fill="currentColor" viewBox="0 0 20 20">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  ),
  User: () => (
    <svg className="w-full h-full" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
    </svg>
  ),
  Megaphone: () => (
    <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
    </svg>
  ),
  ThumbsUp: () => (
    <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
    </svg>
  ),
  MessageCircle: () => (
    <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  Calendar: () => (
    <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  Grid: () => (
    <svg className="w-full h-full" fill="currentColor" viewBox="0 0 20 20">
      <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  ),
  ChevronRight: () => (
    <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  ),
  ChevronLeft: () => (
    <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  ),
  Heart: () => (
    <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  )
};

const TromboneCidadaoDemo = () => {
  const [bottomSheetHeight, setBottomSheetHeight] = useState(45);
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState('stats');
  const [viewMode, setViewMode] = useState('map');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [petitionCarouselIndex, setPetitionCarouselIndex] = useState(0);
  
  const startY = useRef(0);
  const startHeight = useRef(0);
  const sheetRef = useRef(null);

  const handleTouchStart = (e) => {
    setIsDragging(true);
    startY.current = e.touches[0].clientY;
    startHeight.current = bottomSheetHeight;
  };

  const handleTouchMove = (e) => {
    if (!isDragging) return;
    const deltaY = startY.current - e.touches[0].clientY;
    const viewportHeight = window.innerHeight;
    const deltaPercent = (deltaY / viewportHeight) * 100;
    const newHeight = Math.min(90, Math.max(15, startHeight.current + deltaPercent));
    setBottomSheetHeight(newHeight);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (bottomSheetHeight < 25) {
      setBottomSheetHeight(15);
    } else if (bottomSheetHeight < 55) {
      setBottomSheetHeight(45);
    } else {
      setBottomSheetHeight(85);
    }
  };

  const handleMouseDown = (e) => {
    setIsDragging(true);
    startY.current = e.clientY;
    startHeight.current = bottomSheetHeight;
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const deltaY = startY.current - e.clientY;
    const viewportHeight = window.innerHeight;
    const deltaPercent = (deltaY / viewportHeight) * 100;
    const newHeight = Math.min(90, Math.max(15, startHeight.current + deltaPercent));
    setBottomSheetHeight(newHeight);
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (bottomSheetHeight < 25) {
      setBottomSheetHeight(15);
    } else if (bottomSheetHeight < 55) {
      setBottomSheetHeight(45);
    } else {
      setBottomSheetHeight(85);
    }
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const StatPill = ({ icon: Icon, label, value, color, onClick }) => (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(4px)',
        padding: '8px 12px',
        borderRadius: '9999px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        border: 'none',
        cursor: 'pointer',
        transition: 'all 0.2s'
      }}
      onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)'}
      onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)'}
    >
      <div style={{
        backgroundColor: color,
        padding: '4px',
        borderRadius: '9999px',
        width: '20px',
        height: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ width: '12px', height: '12px', color: 'white' }}>
          <Icon />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <span style={{ fontSize: '11px', color: '#666', lineHeight: 1, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: '14px', fontWeight: 'bold', lineHeight: 1, marginTop: '2px' }}>{value}</span>
      </div>
    </button>
  );

  const PetitionCard = ({ petition, isCompact = false }) => (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '16px',
      overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
      border: '1px solid #E5E7EB',
      transition: 'all 0.2s',
      cursor: 'pointer',
      width: isCompact ? '280px' : '100%',
      flexShrink: 0
    }}
    onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)'}
    onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)'}
    >
      {/* Image/Icon */}
      <div style={{
        height: '140px',
        background: 'linear-gradient(135deg, rgba(240, 80, 69, 0.1), rgba(240, 80, 69, 0.05))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative'
      }}>
        {petition.image_url ? (
          <img src={petition.image_url} alt={petition.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '48px', height: '48px', color: 'rgba(240, 80, 69, 0.3)' }}>
            <Icons.Megaphone />
          </div>
        )}
        {/* Donation Badge */}
        {petition.donationTotal > 0 && (
          <div style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            backgroundColor: 'rgba(16, 185, 129, 0.9)',
            backdropFilter: 'blur(4px)',
            color: 'white',
            padding: '4px 12px',
            borderRadius: '9999px',
            fontSize: '12px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <div style={{ width: '14px', height: '14px' }}>
              <Icons.Heart />
            </div>
            R$ {petition.donationTotal.toFixed(2)}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: '16px' }}>
        <h3 style={{
          fontSize: '15px',
          fontWeight: 'bold',
          marginBottom: '8px',
          lineHeight: '1.4',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical'
        }}>
          {petition.title}
        </h3>

        <p style={{
          fontSize: '13px',
          color: '#6B7280',
          marginBottom: '16px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical'
        }}>
          {petition.description}
        </p>

        {/* Progress Bar */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '12px',
            fontWeight: 500,
            color: '#6B7280',
            marginBottom: '6px'
          }}>
            <span>{petition.signatureCount} assinaturas</span>
            <span>Meta: {petition.goal}</span>
          </div>
          <div style={{
            height: '6px',
            backgroundColor: '#E5E7EB',
            borderRadius: '9999px',
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              backgroundColor: '#F05045',
              width: `${petition.progress}%`,
              transition: 'width 0.5s',
              borderRadius: '9999px'
            }} />
          </div>
        </div>

        {/* CTA Button */}
        <button style={{
          width: '100%',
          backgroundColor: '#F05045',
          color: 'white',
          padding: '10px',
          borderRadius: '10px',
          fontSize: '14px',
          fontWeight: 'bold',
          border: 'none',
          cursor: 'pointer',
          transition: 'background-color 0.2s'
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#DC2626'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F05045'}
        onClick={(e) => {
          e.stopPropagation();
          alert('Apoiar petição: ' + petition.title);
        }}
        >
          Apoiar Agora
        </button>
      </div>
    </div>
  );

  const CompactStatCard = ({ icon: Icon, label, value, trend, bgColor, onClick }) => (
    <button
      onClick={onClick}
      style={{
        backgroundColor: bgColor,
        borderRadius: '12px',
        padding: '16px',
        border: '1px solid #E5E7EB',
        transition: 'box-shadow 0.2s',
        cursor: 'pointer',
        width: '100%',
        textAlign: 'left'
      }}
      onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)'}
      onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ width: '20px', height: '20px' }}><Icon /></div>
        {trend && (
          <span style={{
            fontSize: '12px',
            fontWeight: 600,
            color: trend.startsWith('+') ? '#059669' : '#DC2626'
          }}>
            {trend}
          </span>
        )}
      </div>
      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', marginBottom: '4px' }}>{value}</div>
      <div style={{ fontSize: '12px', color: '#4B5563' }}>{label}</div>
    </button>
  );

  return (
    <div style={{
      position: 'relative',
      height: '100vh',
      backgroundColor: '#F9FAFB',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      maxWidth: '480px',
      margin: '0 auto',
      boxShadow: '0 0 50px rgba(0,0,0,0.1)',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Header */}
      <header style={{
        background: 'linear-gradient(to right, #5D3A1A, #4A2F15)',
        color: 'white',
        padding: '12px 16px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        zIndex: 20,
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              padding: '6px',
              borderRadius: '8px',
              backdropFilter: 'blur(4px)'
            }}>
              <svg style={{ width: '20px', height: '20px' }} viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
              </svg>
            </div>
            <div>
              <h1 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, lineHeight: 1.2 }}>Trombone Cidadão</h1>
              <p style={{ fontSize: '12px', margin: 0, opacity: 0.8, lineHeight: 1.2 }}>Floresta, PE</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button style={{
              padding: '8px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: 'transparent',
              color: 'white',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
              position: 'relative'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <div style={{ width: '20px', height: '20px' }}><Icons.Bell /></div>
              {/* Notification badge */}
              <div style={{
                position: 'absolute',
                top: '6px',
                right: '6px',
                width: '8px',
                height: '8px',
                backgroundColor: '#F05045',
                borderRadius: '50%',
                border: '1.5px solid #5D3A1A'
              }} />
            </button>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: '#F05045',
              border: '2px solid white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'transform 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              TC
            </div>
          </div>
        </div>
      </header>

      {/* Scrollable Content Area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden'
      }}>
        {/* Reports/Broncas Section - DESTAQUE */}
        <section style={{
          background: 'linear-gradient(to bottom, #FFFFFF, #F9FAFB)',
          padding: '20px 16px',
          borderBottom: '1px solid #E5E7EB'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            marginBottom: '16px'
          }}>
            <div style={{ flex: 1 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '6px'
              }}>
                <h2 style={{
                  fontSize: '20px',
                  fontWeight: 'bold',
                  margin: 0,
                  color: '#111827'
                }}>
                  Broncas da Sua Cidade
                </h2>
              </div>
              <p style={{
                fontSize: '14px',
                color: '#6B7280',
                margin: 0,
                lineHeight: '1.5'
              }}>
                Veja os problemas reportados pela comunidade e acompanhe as soluções em tempo real
              </p>
            </div>
          </div>

          {/* Quick Stats Row */}
          <div style={{
            display: 'flex',
            gap: '8px',
            overflowX: 'auto',
            paddingBottom: '12px',
            marginBottom: '16px',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none'
          }}>
            <div style={{
              backgroundColor: '#FEF2F2',
              padding: '10px 14px',
              borderRadius: '12px',
              border: '1px solid #FEE2E2',
              flexShrink: 0,
              minWidth: '110px'
            }}>
              <div style={{
                fontSize: '24px',
                fontWeight: 'bold',
                color: '#DC2626',
                lineHeight: 1
              }}>
                {mockStats.total}
              </div>
              <div style={{
                fontSize: '12px',
                color: '#991B1B',
                marginTop: '4px',
                fontWeight: 500
              }}>
                Ativas
              </div>
            </div>
            <div style={{
              backgroundColor: '#ECFDF5',
              padding: '10px 14px',
              borderRadius: '12px',
              border: '1px solid #D1FAE5',
              flexShrink: 0,
              minWidth: '110px'
            }}>
              <div style={{
                fontSize: '24px',
                fontWeight: 'bold',
                color: '#059669',
                lineHeight: 1
              }}>
                {mockStats.resolved}
              </div>
              <div style={{
                fontSize: '12px',
                color: '#047857',
                marginTop: '4px',
                fontWeight: 500
              }}>
                Resolvidas
              </div>
            </div>
            <div style={{
              backgroundColor: '#EFF6FF',
              padding: '10px 14px',
              borderRadius: '12px',
              border: '1px solid #DBEAFE',
              flexShrink: 0,
              minWidth: '110px'
            }}>
              <div style={{
                fontSize: '24px',
                fontWeight: 'bold',
                color: '#2563EB',
                lineHeight: 1
              }}>
                {mockStats.inProgress}
              </div>
              <div style={{
                fontSize: '12px',
                color: '#1D4ED8',
                marginTop: '4px',
                fontWeight: 500
              }}>
                Em Andamento
              </div>
            </div>
          </div>

          {/* Map Preview */}
          <div style={{
            height: '200px',
            background: 'linear-gradient(to bottom right, #F3F4F6, #E5E7EB)',
            borderRadius: '16px',
            overflow: 'hidden',
            position: 'relative',
            border: '1px solid #E5E7EB',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)'
          }}>
            <svg style={{ width: '100%', height: '100%', opacity: 0.1 }} viewBox="0 0 400 200">
              <path d="M50,50 Q200,100 350,50" stroke="#888" strokeWidth="2" fill="none" />
              <path d="M50,150 Q200,100 350,150" stroke="#888" strokeWidth="2" fill="none" />
              <path d="M100,0 L100,200" stroke="#888" strokeWidth="2" />
              <path d="M200,0 L200,200" stroke="#888" strokeWidth="2" />
              <path d="M300,0 L300,200" stroke="#888" strokeWidth="2" />
            </svg>
            
            {/* Markers */}
            {mockReports.slice(0, 6).map((report, i) => (
              <div key={i} style={{
                position: 'absolute',
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                border: '3px solid white',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.2)',
                backgroundColor: 
                  report.status === 'pending' ? '#EF4444' : 
                  report.status === 'in-progress' ? '#3B82F6' : 
                  '#10B981',
                left: `${15 + (i * 14)}%`,
                top: `${30 + (i % 3) * 20}%`,
                animation: report.status === 'pending' ? 'pulse 2s infinite' : 'none',
                cursor: 'pointer',
                transition: 'transform 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.15)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              />
            ))}

            {/* Legenda no mapa */}
            <div style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(8px)',
              padding: '8px 12px',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
              fontSize: '11px',
              fontWeight: 600,
              color: '#374151'
            }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '8px', height: '8px', backgroundColor: '#EF4444', borderRadius: '50%' }} />
                  <span>Pendente</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '8px', height: '8px', backgroundColor: '#3B82F6', borderRadius: '50%' }} />
                  <span>Andamento</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '8px', height: '8px', backgroundColor: '#10B981', borderRadius: '50%' }} />
                  <span>Resolvida</span>
                </div>
              </div>
            </div>

            {/* CTA Button */}
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)',
              padding: '24px 16px 16px',
              display: 'flex',
              justifyContent: 'center'
            }}>
              <button style={{
                backgroundColor: 'white',
                color: '#111827',
                padding: '10px 20px',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 'bold',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                transition: 'all 0.2s'
              }}
              onClick={() => setBottomSheetHeight(85)}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
              }}
              >
                <div style={{ width: '18px', height: '18px' }}>
                  <Icons.MapIcon />
                </div>
                Explorar {mockStats.total} Broncas no Mapa
              </button>
            </div>
          </div>
        </section>

        {/* Petitions Section */}
        <section style={{
          background: 'linear-gradient(to bottom, #FFF7ED, #FFFFFF)',
          padding: '20px 16px',
          borderBottom: '1px solid #E5E7EB'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px'
          }}>
            <div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '4px'
              }}>
                <div style={{ width: '24px', height: '24px', color: '#F05045' }}>
                  <Icons.Megaphone />
                </div>
                <h2 style={{
                  fontSize: '18px',
                  fontWeight: 'bold',
                  margin: 0,
                  color: '#111827'
                }}>
                  Petições Ativas
                </h2>
              </div>
              <p style={{
                fontSize: '13px',
                color: '#6B7280',
                margin: 0
              }}>
                Apoie causas importantes da cidade
              </p>
            </div>
            <button style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid #F05045',
              backgroundColor: 'transparent',
              color: '#F05045',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              Ver Todas
              <div style={{ width: '14px', height: '14px' }}>
                <Icons.ChevronRight />
              </div>
            </button>
          </div>

          {/* Carousel de Petições */}
          <div style={{ position: 'relative' }}>
            {/* Carousel Container */}
            <div style={{
              display: 'flex',
              gap: '12px',
              overflowX: 'auto',
              scrollBehavior: 'smooth',
              paddingBottom: '8px',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none'
            }}>
              {mockPetitions.map(petition => (
                <PetitionCard key={petition.id} petition={petition} isCompact={true} />
              ))}
            </div>

            {/* Dots Indicator */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '6px',
              marginTop: '12px'
            }}>
              {mockPetitions.map((_, index) => (
                <div key={index} style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: index === petitionCarouselIndex ? '#F05045' : '#D1D5DB',
                  transition: 'all 0.3s'
                }} />
              ))}
            </div>
          </div>
        </section>

        {/* Spacer for FAB */}
        <div style={{ height: '80px' }} />
      </div>

      {/* FAB */}
      <button 
        style={{
          position: 'fixed',
          bottom: '80px',
          right: '20px',
          zIndex: 40,
          backgroundColor: '#F05045',
          color: 'white',
          padding: '16px',
          borderRadius: '50%',
          boxShadow: '0 4px 12px rgba(240, 80, 69, 0.4)',
          border: 'none',
          cursor: 'pointer',
          transition: 'transform 0.2s'
        }}
        onClick={() => alert('Nova Bronca!')}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
      >
        <div style={{ width: '24px', height: '24px' }}><Icons.Plus /></div>
      </button>

      {/* Bottom Navigation */}
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'white',
        borderTop: '1px solid #E5E7EB',
        padding: '8px 16px',
        zIndex: 30,
        maxWidth: '480px',
        margin: '0 auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
          <button style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 12px',
            color: '#F05045',
            border: 'none',
            backgroundColor: 'transparent',
            cursor: 'pointer'
          }}>
            <div style={{ width: '20px', height: '20px' }}><Icons.Home /></div>
            <span style={{ fontSize: '12px', fontWeight: 500 }}>Início</span>
          </button>
          <button style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 12px',
            color: '#9CA3AF',
            border: 'none',
            backgroundColor: 'transparent',
            cursor: 'pointer'
          }}>
            <div style={{ width: '20px', height: '20px' }}><Icons.Megaphone /></div>
            <span style={{ fontSize: '12px', fontWeight: 500 }}>Petições</span>
          </button>
          <div style={{ width: '48px' }}></div>
          <button 
            onClick={() => setBottomSheetHeight(85)}
            style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 12px',
            color: '#9CA3AF',
            border: 'none',
            backgroundColor: 'transparent',
            cursor: 'pointer'
          }}>
            <div style={{ width: '20px', height: '20px' }}><Icons.MapIcon /></div>
            <span style={{ fontSize: '12px', fontWeight: 500 }}>Mapa</span>
          </button>
          <button style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 12px',
            color: '#9CA3AF',
            border: 'none',
            backgroundColor: 'transparent',
            cursor: 'pointer'
          }}>
            <div style={{ width: '20px', height: '20px' }}><Icons.User /></div>
            <span style={{ fontSize: '12px', fontWeight: 500 }}>Perfil</span>
          </button>
        </div>
      </nav>

      <style>{`
        div::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default TromboneCidadaoDemo;
