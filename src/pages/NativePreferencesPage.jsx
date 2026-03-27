import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Smartphone, Monitor } from 'lucide-react';
import { useNativeUIMode } from '@/contexts/NativeUIModeContext';

export default function NativePreferencesPage() {
  const navigate = useNavigate();
  const { mode, setMode, isNative } = useNativeUIMode();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      navigate('/perfil', { replace: true });
    }
  }, [navigate]);

  if (!isNative) return null;

  return (
    <div className="container mx-auto py-8 max-w-3xl">
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <span className="text-xl leading-none">←</span>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Preferências</h1>
          <p className="text-muted-foreground mt-2">
            Escolha como o app deve se comportar no seu celular.
          </p>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Modo de navegação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <button
            type="button"
            onClick={() => setMode('default')}
            className={`w-full text-left rounded-2xl border p-4 transition ${
              mode === 'default' ? 'border-tc-red bg-tc-red/5' : 'border-border bg-background hover:bg-muted/30'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="mt-0.5">
                  <Monitor className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold">Padrão</p>
                  <p className="text-sm text-muted-foreground">
                    Mantém o layout da versão web (Header do site e navegação inferior com Perfil).
                  </p>
                </div>
              </div>
              {mode === 'default' && <CheckCircle2 className="w-5 h-5 text-tc-red" />}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMode('interactive')}
            className={`w-full text-left rounded-2xl border p-4 transition ${
              mode === 'interactive' ? 'border-tc-red bg-tc-red/5' : 'border-border bg-background hover:bg-muted/30'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="mt-0.5">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold">Interativa</p>
                  <p className="text-sm text-muted-foreground">
                    Usa header e navegação inferior nativos (menu Mais no lugar do Perfil).
                  </p>
                </div>
              </div>
              {mode === 'interactive' && <CheckCircle2 className="w-5 h-5 text-tc-red" />}
            </div>
          </button>
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">
        A mudança é aplicada imediatamente.
      </div>
    </div>
  );
}
