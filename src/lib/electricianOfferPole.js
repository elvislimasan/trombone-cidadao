import { poleDisplayCode } from '@/lib/poleDisplay';

export async function loadElectricianOfferPole(client, offer, cityId) {
  if (!offer || cityId == null) return null;
  let poleId = offer.pole_id;
  let reportedCode = '';
  const reportId = offer.tipo === 'solicitacao' ? offer.id : offer.report_id;
  if (reportId) {
    const { data, error } = await client.from('reports')
      .select('pole_id,reported_post_identifier,reported_plate,pole_number')
      .eq('id', reportId).eq('city_id', cityId).maybeSingle();
    if (error) throw error;
    poleId = poleId ?? data?.pole_id;
    reportedCode = poleDisplayCode({
      identifier: data?.reported_post_identifier,
      plate: data?.reported_plate || data?.pole_number,
    });
  }
  if (poleId != null) {
    const { data, error } = await client.from('poles').select('id,identifier,plate')
      .eq('id', poleId).eq('city_id', cityId).maybeSingle();
    if (error) throw error;
    const code = poleDisplayCode(data) || reportedCode;
    return code ? { code, nearby: false } : null;
  }
  if (reportedCode) return { code: reportedCode, nearby: false };

  const lat = Number(offer.latitude); const lng = Number(offer.longitude);
  if (offer.latitude == null || offer.longitude == null || !Number.isFinite(lat)
    || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const { data: nearby, error: nearbyError } = await client.rpc('nearest_poles', {
    lat, lng, radius_m: 80, max_results: 5,
  });
  if (nearbyError) throw nearbyError;
  if (!nearby?.length) return null;
  // The public proximity lookup spans cities; keep only this municipality's poles.
  const { data: poles, error: polesError } = await client.from('poles').select('id,identifier,plate')
    .in('id', nearby.map((pole) => pole.pole_id)).eq('city_id', cityId);
  if (polesError) throw polesError;
  const pole = nearby.map((candidate) => poles?.find((item) => String(item.id) === String(candidate.pole_id)))
    .find(Boolean);
  const code = poleDisplayCode(pole);
  return code ? { code, nearby: true } : null;
}
