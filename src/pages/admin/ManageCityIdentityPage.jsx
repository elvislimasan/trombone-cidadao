import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { ImagePlus, MapPin } from 'lucide-react';
import { useCity } from '@/contexts/CityContext';
import { Combobox } from '@/components/ui/combobox';
import CityThumbnailManager from '@/components/CityThumbnailManager';

export default function ManageCityIdentityPage() {
  const { cities, loadingCities } = useCity();
  const [cityId, setCityId] = useState('');
  const options = useMemo(() => cities.map((city) => ({ value: String(city.id), label: `${city.name}${city.state?.uf ? ` · ${city.state.uf}` : ''}` })), [cities]);
  const city = cities.find((item) => String(item.id) === String(cityId));
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Helmet><title>Identidade visual da cidade | Admin</title></Helmet>
      <header className="rounded-3xl border border-edge-subtle bg-surface-raised p-6 shadow-sm">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-subtleBg text-brand"><ImagePlus className="h-6 w-6" /></span>
        <h1 className="mt-4 text-2xl font-extrabold text-content-primary">Identidade visual da cidade</h1>
        <p className="mt-2 text-sm leading-6 text-content-secondary">Defina a imagem institucional exibida no Radar, na home desktop e nos perfis públicos de moradores.</p>
      </header>
      <section className="mt-5 rounded-2xl border border-edge-subtle bg-surface-raised p-5 shadow-sm">
        <label className="text-sm font-bold text-content-primary">Cidade</label>
        <Combobox options={options} value={cityId} onChange={setCityId} disabled={loadingCities} placeholder={loadingCities ? 'Carregando cidades...' : 'Escolha uma cidade'} searchPlaceholder="Buscar cidade..." />
      </section>
      {city ? <div className="mt-5"><CityThumbnailManager city={city} /></div> : <div className="mt-5 rounded-2xl border border-dashed border-edge-default px-6 py-12 text-center text-sm text-content-secondary"><MapPin className="mx-auto mb-3 h-6 w-6 text-content-tertiary" />Escolha uma cidade para enviar sua imagem.</div>}
    </main>
  );
}
