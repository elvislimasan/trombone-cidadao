export const PIPA_VOICE_DISTANCES = [1000, 500, 100];

// Uma leitura já dentro de 100 m anuncia somente 100 m, sem enfileirar
// os marcos que ficaram para trás. O último marco impede repetições do GPS.
export function pipaVoiceMilestone(distance, previous = Infinity) {
  if (!Number.isFinite(distance) || distance < 0) return null;
  return PIPA_VOICE_DISTANCES.filter(limit => distance <= limit && limit < previous).at(-1) ?? null;
}

export function pipaVoiceDistanceMessage(milestone, destination) {
  const distance = milestone === 1000 ? '1 quilômetro' : `${milestone} metros`;
  return `${destination} a ${distance}, em linha reta.${milestone === 100 ? ' Você está se aproximando do destino.' : ''}`;
}
