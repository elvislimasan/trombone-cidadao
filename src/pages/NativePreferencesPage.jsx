import React from 'react';
import { Navigate } from 'react-router-dom';

// Mantém links antigos válidos. Aparência e notificações ficam nas configurações;
// o cabeçalho clássico escolhido pelo cliente não exige um seletor de layout.
export default function NativePreferencesPage() {
  return <Navigate to="/configuracoes" replace />;
}
