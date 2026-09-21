import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/lib/customSupabaseClient';
import { optimizeStoredWorkImage, optimizeStoredWorkThumbnail } from '@/lib/optimizeStoredWorkImage';
import { runWorkImageBatch } from '@/lib/runWorkImageBatch';
import { showAppError } from '@/lib/appError';

const initialProgress = { total: 0, done: 0, changed: 0, skipped: 0, failed: 0, lastError: '' };

export default function WorkImageBatchOptimizer() {
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState('');
  const [progress, setProgress] = useState(initialProgress);
  const stopRequested = useRef(false);

  useEffect(() => () => { stopRequested.current = true; }, []);

  const start = async () => {
    if (running) return;
    stopRequested.current = false;
    setRunning(true);
    setPhase('Contando fotos...');
    setProgress(initialProgress);

    try {
      const [mediaCount, coverCount] = await Promise.all([
        supabase.from('public_work_media').select('id', { count: 'exact', head: true })
          .in('type', ['image', 'photo']).not('url', 'is', null).neq('url', ''),
        supabase.from('public_works').select('id', { count: 'exact', head: true })
          .not('thumbnail_url', 'is', null).neq('thumbnail_url', ''),
      ]);
      if (mediaCount.error || coverCount.error) throw mediaCount.error || coverCount.error;
      setProgress((current) => ({ ...current, total: (mediaCount.count || 0) + (coverCount.count || 0) }));

      const sources = [
        {
          label: 'Fotos das galerias',
          loadPage: async (offset, size) => {
            const { data, error } = await supabase.from('public_work_media')
              .select('id, url, name, type, work_id, measurement_id')
              .in('type', ['image', 'photo']).not('url', 'is', null).neq('url', '')
              .order('id', { ascending: true }).range(offset, offset + size - 1);
            if (error) throw error;
            return data || [];
          },
          optimize: (row) => optimizeStoredWorkImage(row, { maxDimension: 1600, onlyOversized: true }),
        },
        {
          label: 'Capas das obras',
          loadPage: async (offset, size) => {
            const { data, error } = await supabase.from('public_works')
              .select('id, thumbnail_url').not('thumbnail_url', 'is', null).neq('thumbnail_url', '')
              .order('id', { ascending: true }).range(offset, offset + size - 1);
            if (error) throw error;
            return data || [];
          },
          optimize: (row) => optimizeStoredWorkThumbnail(row, { maxDimension: 1600 }),
        },
      ];

      const result = await runWorkImageBatch({
        sources,
        shouldStop: () => stopRequested.current,
        onSource: setPhase,
        onResult: ({ status, error }) => setProgress((current) => ({
          ...current,
          done: current.done + 1,
          changed: current.changed + Number(status === 'changed'),
          skipped: current.skipped + Number(status === 'skipped'),
          failed: current.failed + Number(status === 'failed'),
          lastError: error?.message || current.lastError,
        })),
      });
      setPhase(result.stopped ? 'Interrompido' : 'Concluído');
    } catch (error) {
      setPhase('Interrompido por erro');
      showAppError({ title: 'Erro no redimensionamento em lote', description: error?.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="mb-4 sm:mb-6">
      <CardContent className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Redimensionar fotos antigas</h2>
            <p className="text-sm text-muted-foreground">Verifica fotos das galerias e capas de todas as obras. Imagens acima de 1600 px são reduzidas; as demais são ignoradas.</p>
          </div>
          {running
            ? <Button type="button" variant="outline" onClick={() => { stopRequested.current = true; }}>Parar após a foto atual</Button>
            : <Button type="button" variant="outline" onClick={start}>Iniciar rotina</Button>}
        </div>
        {phase && <div className="space-y-2" role="status" aria-live="polite">
          <p className="text-sm font-medium">{phase}: {progress.done} de {progress.total} verificadas</p>
          <Progress value={progress.total ? Math.round(progress.done / progress.total * 100) : 0} />
          <p className="text-xs text-muted-foreground">{progress.changed} redimensionadas · {progress.skipped} já adequadas · {progress.failed} falhas</p>
          {progress.lastError && <p className="text-xs text-destructive">Última falha: {progress.lastError}</p>}
          {running && <p className="text-xs text-muted-foreground">Mantenha esta página aberta enquanto a rotina estiver em andamento.</p>}
        </div>}
      </CardContent>
    </Card>
  );
}
