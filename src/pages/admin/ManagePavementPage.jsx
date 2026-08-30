
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, PlusCircle, Edit, Trash2, MapPin, Search, HelpCircle, Loader2, Route as Road, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useListaPaginada } from '@/hooks/useListaPaginada';
import PaginacaoLista from '@/components/admin/PaginacaoLista';
import PavementEditModal from '@/components/pavement/PavementEditModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { showAppError, showAppNotice } from '@/lib/appError';
import { cepsDaRua } from '@/lib/pavementReport';
import { savePavementStreet, storagePathsFromStreet } from '@/lib/savePavementStreet';
import { removePavementMedia } from '@/lib/pavementStreetMedia';
import {
  bboxDasRuas,
  buildOverpassQuery,
  buscarVias,
  casarTracado,
  coordenadaDaRua,
  toMultiLineStringWkt,
} from '@/lib/streetGeometry';

const ManagePavementPage = () => {
  const { user } = useAuth();
  const [myActiveCityIds, setMyActiveCityIds] = useState([]);
  const [myCities, setMyCities] = useState([]); // [{ id, name, uf }]
  const isScopedAmbassador = !!user && !user.is_admin && !user.is_master && !!user.is_ambassador;
  const [streets, setStreets] = useState([]);
  const [bairros, setBairros] = useState([]);
  const [buscaRua, setBuscaRua] = useState('');
  const [mostrarSoSemNome, setMostrarSoSemNome] = useState(false);
  const [mostrarSoSemCep, setMostrarSoSemCep] = useState(false);
  const [editingStreet, setEditingStreet] = useState(null);
  const [deletingStreet, setDeletingStreet] = useState(null);
  const [importandoTracado, setImportandoTracado] = useState(null); // null | { feitas, total, achadas }

  useEffect(() => {
    if (!isScopedAmbassador || !user?.id) return;
    supabase
      .from('ambassador_cities')
      .select('city_id, cities(id, name, states(uf))')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .then(({ data }) => {
        const rows = data || [];
        setMyActiveCityIds(rows.map((r) => r.city_id));
        setMyCities(rows.map((r) => ({
          id: r.city_id,
          name: r.cities?.name || null,
          uf: r.cities?.states?.uf || null,
        })).filter((c) => c.name));
      });
  }, [isScopedAmbassador, user?.id]);

  const fetchStreets = useCallback(async () => {
    if (isScopedAmbassador && myActiveCityIds.length === 0) {
      setStreets([]);
      return;
    }
    let query = supabase
      .from('pavement_streets')
      .select('*, bairro:bairros!pavement_streets_bairro_id_fkey(name)')
      .order('updated_at', { ascending: false });
    if (isScopedAmbassador) {
      query = query.in('city_id', myActiveCityIds);
    }
    const { data, error } = await query;
    if (error) showAppError({ title: "Erro ao buscar ruas", description: error.message, variant: "destructive" });
    else setStreets(data.map(s => ({...s, bairro_name: s.bairro?.name})));
  }, [isScopedAmbassador, myActiveCityIds]);

  const fetchBairros = useCallback(async () => {
    let query = supabase.from('bairros').select('*').order('name');
    if (isScopedAmbassador && myActiveCityIds.length > 0) {
      query = query.in('city_id', myActiveCityIds);
    }
    const { data, error } = await query;
    if (error) showAppError({ title: "Erro ao buscar bairros", description: error.message, variant: "destructive" });
    else setBairros(data);
  }, [isScopedAmbassador, myActiveCityIds]);

  useEffect(() => {
    fetchStreets();
    fetchBairros();
  }, [fetchStreets, fetchBairros]);

  const handleSaveStreet = async (streetToSave) => {
    const ok = await savePavementStreet({
      supabase,
      streetToSave,
      bairros,
      isScopedAmbassador,
      myActiveCityIds,
    });
    if (ok) {
      await fetchStreets();
      setEditingStreet(null);
    }
    return ok;
  };

  const handleAddNewStreet = () => {
    setEditingStreet({ id: null, name: '', is_unnamed: false, cep: '', status: 'unpaved', pavement_type: 'asphalt', bairro_id: null, location: null, paving_date: '', honoree_name: '', biography: '', curiosities: '', historical_documents: [], historical_photos: [] });
  };

  const handleDeleteStreet = async (streetId) => {
    const { error } = await supabase.from('pavement_streets').delete().eq('id', streetId);
    if (error) {
      showAppError({ title: "Erro ao remover rua", description: error.message, variant: "destructive" });
    } else {
      try {
        await removePavementMedia(supabase, storagePathsFromStreet(deletingStreet));
      } catch (storageError) {
        console.error('A rua foi removida, mas seus anexos não foram removidos:', storageError);
      }
      await fetchStreets();
    }
    setDeletingStreet(null);
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'paved': return 'Pavimentada';
      case 'unpaved': return 'Sem Pavimentação';
      case 'partially_paved': return 'Parcialmente Pavimentada';
      default: return 'N/A';
    }
  };

  // `streets` continua inteiro: é o que o modal usa para desenhar os outros
  // pinos no seletor de mapa (`existingStreets` em `PavementEditModal`). A
  // checagem de nome repetido é outra coisa — uma consulta ao banco dentro de
  // `savePavementStreet`, que não depende desta lista. O recorte por filtro é
  // só do que vai para a tela.
  const totalSemNome = useMemo(() => streets.filter((street) => street.is_unnamed).length, [streets]);

  // OS DOIS FILTROS SAO A MESMA PERGUNTA EM MOMENTOS DIFERENTES
  //
  // "Sem nome oficial" é a lista que vira projeto de lei; "sem CEP" é a lista
  // de trabalho de quem está completando a base. Ambos respondem "o que ainda
  // falta aqui" — e por isso combinam: ligados juntos, mostram as ruas que não
  // têm nem nome nem CEP, que são as mais atrasadas de todas.
  //
  // A contagem usa `cepsDaRua`, e não a coluna antiga: uma rua cujo CEP está
  // só na lista nova não pode aparecer como pendente.
  const totalSemCep = useMemo(
    () => streets.filter((street) => cepsDaRua(street).length === 0).length,
    [streets]
  );

  const semTracado = useMemo(
    () => streets.filter((s) => !s.path && !s.is_unnamed && s.location),
    [streets]
  );

  /**
   * Traz o traçado de todas as ruas que ainda não têm.
   *
   * UMA chamada ao Overpass POR CIDADE, e o casamento local dentro de cada
   * grupo. Ver o cabeçalho de `lib/streetGeometry.js` para o porquê de não ser
   * uma por rua.
   *
   * `streets` não é recortado por cidade para admin/imperador — é a base
   * inteira. Uma bbox só, sobre `comPonto` inteiro, cobriria todas as cidades
   * cadastradas de uma vez, e o Overpass receberia uma consulta do tamanho do
   * país (504/429, ou uma resposta grande o bastante para travar a aba). Por
   * isso o agrupamento por `city_id` antes de montar a bbox: cada cidade pede
   * a sua região, e a guarda de 2 km de `casarTracado` continua resolvendo
   * homônimos dentro do grupo. Rua sem `city_id` forma grupo próprio — sumir
   * da importação seria pior que uma bbox maior que o necessário.
   *
   * Nunca sobrescreve `path_source = 'manual'`: o filtro é `!s.path`, então
   * rua com traçado — de qualquer origem — fica de fora.
   */
  const importarTracados = async () => {
    const comPonto = semTracado
      .map((s) => ({ ...s, location: coordenadaDaRua(s.location) }))
      .filter((s) => s.location);

    if (comPonto.length === 0) {
      showAppError({ title: 'Nada a buscar', description: 'Nenhuma rua sem traçado tem ponto cadastrado.', variant: 'destructive' });
      return;
    }

    // Rua sem city_id vai para o grupo `null` — chave própria, não descarte.
    const grupos = new Map();
    for (const rua of comPonto) {
      const chave = rua.city_id ?? null;
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(rua);
    }

    setImportandoTracado({ feitas: 0, total: comPonto.length, achadas: 0 });
    try {
      let feitas = 0;
      let achadas = 0;
      let falhas = 0;
      let tentadas = 0;
      let abortadoPorFalha = false;

      for (const grupo of grupos.values()) {
        if (abortadoPorFalha) break;

        const bbox = bboxDasRuas(grupo);
        if (!bbox) continue; // defensivo: `comPonto` já garante ponto válido.
        const ways = await buscarVias(buildOverpassQuery(bbox));

        for (let i = 0; i < grupo.length; i += 1) {
          const rua = grupo[i];
          const wkt = toMultiLineStringWkt(casarTracado(rua, ways));
          if (wkt) {
            tentadas += 1;
            const { error } = await supabase
              .from('pavement_streets')
              .update({ path: wkt, path_source: 'osm' })
              .eq('id', rua.id);

            // FALHA DE GRAVAÇÃO NÃO PODE PARECER "NÃO ACHEI".
            //
            // Contar só os acertos fazia as duas coisas terminarem na mesma
            // frase: "0 traçados encontrados de 400 ruas" tanto quando o OSM não
            // conhece nenhuma rua quanto quando a coluna `path` não existe ainda.
            // A primeira é informação; a segunda é um erro de instalação que
            // ficava escondido atrás dela.
            //
            // E se a PRIMEIRA gravação falha, a causa é do banco, não da rua —
            // coluna ausente, RLS, sessão expirada. Insistir nas outras 399
            // custaria dois minutos de espera para chegar à mesma conclusão.
            // O aborto vale para a importação inteira, não só o grupo atual.
            if (error) {
              falhas += 1;
              console.error('Falha ao gravar o traçado de', rua.name, error);
              if (tentadas === 1) {
                showAppError({
                  title: 'Não foi possível gravar o traçado',
                  description: `${error.message}. Se a coluna do traçado ainda não existe no banco, aplique a migração 203 antes de importar.`,
                  variant: 'destructive',
                });
                abortadoPorFalha = true;
                break;
              }
            } else {
              achadas += 1;
            }
            // Espaçar os UPDATEs para não estourar o pooler numa cidade grande.
            await new Promise((r) => setTimeout(r, 300));
          }
          feitas += 1;
          setImportandoTracado({ feitas, total: comPonto.length, achadas });
        }
      }

      if (abortadoPorFalha) return;

      await fetchStreets();
      const semCasar = comPonto.length - tentadas;
      showAppNotice({
        title: 'Importação concluída',
        description: [
          `${achadas} de ${comPonto.length} rua${comPonto.length === 1 ? '' : 's'} com traçado.`,
          semCasar > 0 ? `${semCasar} sem correspondência no OpenStreetMap.` : '',
          falhas > 0 ? `${falhas} falhou ao gravar — veja o console.` : '',
        ].filter(Boolean).join(' '),
      });
    } catch (erro) {
      showAppError({ title: 'Erro ao importar traçados', description: erro.message, variant: 'destructive' });
    } finally {
      setImportandoTracado(null);
    }
  };

  const ruasFiltradas = useMemo(() => {
    const termo = buscaRua.trim().toLowerCase();
    return streets.filter((s) => {
      if (mostrarSoSemNome && !s.is_unnamed) return false;
      if (mostrarSoSemCep && cepsDaRua(s).length > 0) return false;
      if (!termo) return true;
      return (s.name || '').toLowerCase().includes(termo)
        || (s.bairro_name || '').toLowerCase().includes(termo)
        // Procurar por CEP tem de achar QUALQUER um dos trechos: quem digita
        // "56408-193" quer a rua daquela faixa, e ela pode ser a segunda.
        || cepsDaRua(s).some((c) => c.cep.toLowerCase().includes(termo));
    });
  }, [streets, buscaRua, mostrarSoSemNome, mostrarSoSemCep]);

  const { visiveis: ruasVisiveis, propsPaginacao: propsPaginacaoRuas } = useListaPaginada(
    ruasFiltradas,
    { porPagina: 20, chaveFiltro: `${buscaRua}|${mostrarSoSemNome}|${mostrarSoSemCep}` }
  );

  return (
    <>
      <Helmet>
        <title>Gerenciar Pavimentação - Admin</title>
        <meta name="description" content="Gerencie as ruas e o status de pavimentação." />
      </Helmet>
      <div className="container max-w-[88rem] mx-auto w-full px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center justify-between gap-4 mb-12"
        >
          <div className="flex items-center gap-4">
            <Link to="/admin">
              <Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
            </Link>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-tc-red">
                {isScopedAmbassador ? 'Pavimentação da minha cidade' : 'Gerenciar Pavimentação'}
              </h1>
              <p className="mt-2 text-lg text-muted-foreground">Adicione, edite ou remova ruas do mapa de pavimentação.</p>
            </div>
          </div>
          <Button onClick={handleAddNewStreet} className="gap-2">
            <PlusCircle className="w-4 h-4" /> Adicionar Rua
          </Button>
        </motion.div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Ruas Cadastradas</CardTitle>
                <CardDescription className="mt-1">{streets.length} rua{streets.length === 1 ? '' : 's'} no total.</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant={mostrarSoSemNome ? 'default' : 'outline'}
                  size="sm"
                  className="gap-2"
                  aria-pressed={mostrarSoSemNome}
                  onClick={() => setMostrarSoSemNome((current) => !current)}
                >
                  <HelpCircle className="h-4 w-4" />
                  {totalSemNome} sem nome oficial
                </Button>
                {/* O contador some quando chega a zero: botao que filtra nada e
                    so mais um alvo na tela, e o zero ja diz o que precisava. */}
                {totalSemCep > 0 && (
                  <Button
                    type="button"
                    variant={mostrarSoSemCep ? 'default' : 'outline'}
                    size="sm"
                    className="gap-2"
                    aria-pressed={mostrarSoSemCep}
                    onClick={() => setMostrarSoSemCep((current) => !current)}
                  >
                    <MapPin className="h-4 w-4" />
                    {totalSemCep} sem CEP
                  </Button>
                )}
                {semTracado.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={importarTracados}
                    disabled={Boolean(importandoTracado)}
                  >
                    {importandoTracado ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> {importandoTracado.feitas}/{importandoTracado.total} · {importandoTracado.achadas} achadas</>
                    ) : (
                      <><Road className="h-4 w-4" /> Buscar traçado de {semTracado.length}</>
                    )}
                  </Button>
                )}
              </div>
            </div>
            {/* Sem busca, achar uma rua era rolar até topá-la. */}
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por rua, bairro ou CEP..."
                className="pl-10"
                value={buscaRua}
                onChange={(e) => setBuscaRua(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent>
            {ruasVisiveis.length === 0 ? (
              <p className="text-center text-muted-foreground py-10">
                {buscaRua || mostrarSoSemNome ? 'Nenhuma rua corresponde ao filtro.' : 'Nenhuma rua cadastrada ainda.'}
              </p>
            ) : (
            <div className="space-y-3">
              {ruasVisiveis.map(street => (
                <div key={street.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-background rounded-lg border gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{street.name}</p>
                      {/* Tokens do tema, e não a paleta crua: `bg-amber-50` é
                          uma cor CLARA e continuava clara no tema escuro,
                          virando um borrão creme no meio do cartão. O par
                          `status-pending*` já tem versão para os dois temas. */}
                      {street.is_unnamed && (
                        <Badge variant="outline" className="gap-1 border-status-pendingBorder bg-status-pendingBg text-status-pendingFg hover:bg-status-pendingBg">
                          <HelpCircle className="h-3 w-3" /> Sem nome oficial
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">Status: {getStatusText(street.status)}</p>
                    {street.bairro_name && <p className="text-sm text-muted-foreground">Bairro: {street.bairro_name}</p>}
                    {cepsDaRua(street).length > 0 && (
                      <p className="text-sm text-muted-foreground">
                        {cepsDaRua(street).length === 1 ? 'CEP: ' : 'CEPs: '}
                        {cepsDaRua(street).map((c) => c.cep).join(' · ')}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">Última atualização: {new Date(street.updated_at).toLocaleString('pt-BR')}</p>
                  </div>
                  <div className="flex-shrink-0 flex gap-2">
                    {/* Ver a pagina publica da rua: e a unica forma de conferir
                        como o cadastro ficou sem sair procurando no mapa. */}
                    <Button asChild variant="ghost" size="icon" title="Ver pagina da rua">
                      <Link to={`/mapa-pavimentacao/rua/${street.id}`} target="_blank" rel="noreferrer">
                        <Eye className="w-4 h-4" />
                      </Link>
                    </Button>
                    <Button variant="ghost" size="icon" title="Editar" onClick={() => setEditingStreet(street)}><Edit className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => setDeletingStreet(street)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
            )}

            <PaginacaoLista {...propsPaginacaoRuas} />
          </CardContent>
        </Card>
      </div>

      <PavementEditModal
        street={editingStreet}
        onSave={handleSaveStreet}
        onClose={() => setEditingStreet(null)}
        bairros={bairros}
        existingStreets={streets}
        defaultCityId={isScopedAmbassador && myActiveCityIds.length === 1 ? myActiveCityIds[0] : null}
        fallbackCityCenter={isScopedAmbassador && myCities.length > 0 ? { name: myCities[0].name, uf: myCities[0].uf } : null}
        onBairroCreated={(newBairro) => setBairros((prev) => [...prev, newBairro])}
      />

      <Dialog open={!!deletingStreet} onOpenChange={(open) => !open && setDeletingStreet(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader><DialogTitle className="text-xl font-bold text-foreground">Confirmar Exclusão</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">Tem certeza que deseja remover a rua "{deletingStreet?.name}"? Esta ação não pode ser desfeita.</p>
          <DialogFooter className="sm:justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button type="button" variant="destructive" onClick={() => handleDeleteStreet(deletingStreet.id)}>
              <Trash2 className="w-4 h-4 mr-2" /> Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ManagePavementPage;
