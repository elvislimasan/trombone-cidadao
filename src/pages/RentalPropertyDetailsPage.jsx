import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { ArrowLeft, MapPin, Ruler, User, Building2, FileText, Calendar, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency, formatDate } from '@/lib/utils';

const RentalPropertyDetailsPage = () => {
  const { id } = useParams();
  const { toast } = useToast();
  const [property, setProperty] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [media, setMedia] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [propRes, contractsRes, mediaRes, docsRes] = await Promise.all([
        supabase.from('rental_properties').select('*, bairro:bairro_id(id, name)').eq('id', id).maybeSingle(),
        supabase.from('rental_property_contracts').select('*').eq('property_id', id).order('start_date', { ascending: false }),
        supabase.from('rental_property_media').select('*').eq('property_id', id).order('created_at'),
        supabase.from('rental_property_documents').select('*').eq('property_id', id).order('created_at'),
      ]);
      if (propRes.error) throw propRes.error;
      setProperty(propRes.data);
      setContracts(contractsRes.data || []);
      setMedia(mediaRes.data || []);
      setDocuments(docsRes.data || []);
    } catch (error) {
      toast({ title: 'Erro ao buscar imóvel', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading) {
    return <div className="flex justify-center items-center h-96">Carregando imóvel...</div>;
  }

  if (!property) {
    return (
      <div className="container max-w-3xl mx-auto px-4 py-12 text-center">
        <p className="text-muted-foreground">Imóvel não encontrado.</p>
        <Link to="/imoveis-alugados"><Button className="mt-4">Voltar</Button></Link>
      </div>
    );
  }

  const currentContract = contracts.find((c) => c.is_current) || contracts[0] || null;

  return (
    <>
      <Helmet>
        <title>{property.address} - Imóveis Alugados - Trombone Cidadão</title>
      </Helmet>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="container max-w-4xl mx-auto w-full px-4 py-8">
        <Link to="/imoveis-alugados" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4" /> Voltar para Imóveis Alugados
        </Link>

        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">{property.department || property.address}</h1>
            <p className="text-muted-foreground mt-1">{property.address}</p>
            <p className="text-muted-foreground flex items-center gap-1.5 mt-1">
              <MapPin className="w-4 h-4" /> {property.bairro?.name || 'Bairro não informado'}
            </p>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${property.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
            {property.is_active ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
            {property.is_active ? 'Aluguel ativo' : 'Aluguel encerrado'}
          </div>
        </div>

        {media.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
            {media.map((m) => (
              <img key={m.id} src={m.url} alt={property.address} className="w-full h-40 object-cover rounded-xl border" />
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader><CardTitle className="text-base">Contrato atual</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="flex items-center gap-2"><User className="w-4 h-4 text-muted-foreground" /> {currentContract?.owner_name || 'Não informado'}</p>
              <p className="flex items-center gap-2 font-semibold text-lg text-tc-red">{currentContract ? formatCurrency(currentContract.monthly_value) : '—'}/mês</p>
              <p className="flex items-center gap-2"><Calendar className="w-4 h-4 text-muted-foreground" /> Início: {currentContract ? formatDate(currentContract.start_date) : '—'}</p>
              {currentContract?.end_date && (
                <p className="flex items-center gap-2"><Calendar className="w-4 h-4 text-muted-foreground" /> Fim: {formatDate(currentContract.end_date)}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Características</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="flex items-center gap-2"><Ruler className="w-4 h-4 text-muted-foreground" />
                {property.length_m && property.width_m ? `${property.length_m}m x ${property.width_m}m (${property.area_m2}m²)` : 'Não informado'}
              </p>
              <p className="flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" /> {property.department || 'Secretaria não informada'}</p>
              {property.characteristics && <p className="text-muted-foreground">{property.characteristics}</p>}
            </CardContent>
          </Card>
        </div>

        <Card className="mb-8">
          <CardHeader><CardTitle className="text-base">Histórico de valores</CardTitle></CardHeader>
          <CardContent>
            {contracts.length > 0 ? (
              <div className="space-y-2">
                {contracts.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border text-sm">
                    <div>
                      <p className="font-medium">{c.owner_name}</p>
                      <p className="text-muted-foreground text-xs">
                        {formatDate(c.start_date)} — {c.end_date ? formatDate(c.end_date) : (c.is_current ? 'atual' : '—')}
                      </p>
                    </div>
                    <p className="font-semibold">{formatCurrency(c.monthly_value)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum contrato cadastrado.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Documentos</CardTitle></CardHeader>
          <CardContent>
            {documents.length > 0 ? (
              <div className="space-y-2">
                {documents.map((d) => (
                  <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm text-tc-red hover:underline p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <FileText className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1">{d.type === 'contrato' ? 'Contrato' : 'Aditivo'}{d.description ? ` — ${d.description}` : ''}</span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum documento disponível.</p>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </>
  );
};

export default RentalPropertyDetailsPage;
