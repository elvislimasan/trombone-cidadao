export function activeMunicipalMembershipId(memberships, cityId, activeMunicipalityId = null) {
  if (cityId == null) return null;
  return memberships?.find((item) =>
    item.prefeitura?.status === 'ativa'
    && String(item.prefeitura.city_id) === String(cityId)
    && (!activeMunicipalityId || item.prefeitura.id === activeMunicipalityId))?.prefeitura?.id || null;
}

export function municipalRequesterContact(form) {
  return { name: String(form.requester_name || '').trim() || null, phone: String(form.requester_phone || '').trim() || null };
}

export function municipalRequesterErrors(form) {
  const { name, phone } = municipalRequesterContact(form);
  const errors = {};
  if (name && name.length > 160) errors.requester_name = 'Informe um nome de até 160 caracteres.';
  if (phone && (phone.length > 32 || !/^[+\d\s().-]+$/.test(phone) || !/^\d{10,15}$/.test(phone.replace(/\D/g, '')))) {
    errors.requester_phone = 'Informe um telefone com DDD (10 a 15 dígitos) ou deixe em branco.';
  }
  return errors;
}

export async function saveMunicipalRequesterContact(client, reportId, form, signal) {
  const errors = municipalRequesterErrors(form);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const contact = municipalRequesterContact(form);
  if (!contact.name && !contact.phone) return;
  let query = client.from('municipal_report_contacts').insert({ report_id: reportId, ...contact });
  if (signal && typeof query.abortSignal === 'function') query = query.abortSignal(signal);
  const { error } = await query;
  if (error) throw error;
}
