import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';

const AcceptInvitePage = () => {
  const { token } = useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Estados: 'loading' | 'success' | 'error'
  const [status, setStatus] = useState('loading');
  const [cityName, setCityName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    // Aguardar a sessão carregar antes de qualquer ação
    if (authLoading) return;

    // Se não estiver logado, redirecionar para login preservando o destino
    if (!user) {
      navigate(`/login?redirect=/convite/${token}`, { replace: true });
      return;
    }

    // Usuário logado — chamar a Edge Function
    const acceptInvite = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const response = await fetch(
          `${supabaseUrl}/functions/v1/accept-ambassador-invite`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ token }),
          }
        );

        const json = await response.json();

        if (!response.ok) {
          setErrorMessage(json?.error ?? 'Erro desconhecido ao aceitar o convite.');
          setStatus('error');
          return;
        }

        setCityName(json.city_name ?? '');
        setStatus('success');
      } catch (err) {
        setErrorMessage(err.message ?? 'Erro de conexão. Tente novamente.');
        setStatus('error');
      }
    };

    acceptInvite();
  }, [authLoading, user, token, navigate]);

  // Tela de carregamento
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F9FAFB] px-4">
        <div className="w-12 h-12 rounded-full border-4 border-red-600 border-t-transparent animate-spin mb-4" />
        <p className="text-gray-600 text-sm">Verificando convite...</p>
      </div>
    );
  }

  // Tela de sucesso
  if (status === 'success') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F9FAFB] px-4 text-center">
        <div className="mb-6 flex items-center justify-center w-20 h-20 rounded-full bg-green-100">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-10 h-10 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Bem-vindo, embaixador!
        </h1>
        <p className="text-gray-600 mb-6 max-w-sm">
          {cityName
            ? `Você agora é embaixador de ${cityName}!`
            : 'Você agora é embaixador da cidade!'}
        </p>
        <button
          onClick={() => navigate('/', { replace: true })}
          className="px-6 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
        >
          Ver feed
        </button>
      </div>
    );
  }

  // Tela de erro
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F9FAFB] px-4 text-center">
      <div className="mb-6 flex items-center justify-center w-20 h-20 rounded-full bg-red-100">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-10 h-10 text-red-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Convite inválido
      </h1>
      <p className="text-gray-600 mb-6 max-w-sm">
        {errorMessage || 'Este convite não é válido ou já foi utilizado.'}
      </p>
      <button
        onClick={() => navigate(-1)}
        className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-300 transition-colors"
      >
        Voltar
      </button>
    </div>
  );
};

export default AcceptInvitePage;
