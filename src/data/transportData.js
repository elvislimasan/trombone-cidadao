import React from 'react';
export const transportOptions = [
  {
    id: "serra-talhada-1",
    name: "Lotação do Povo",
    destination: "Serra Talhada",
    phone: "(87) 91234-5678",
    schedule: "Saídas a cada 30 minutos, das 6h às 18h (Seg a Sáb).",
    details: "Ponto de saída principal na Praça do Relógio. Veículos climatizados.",
    image: "Van de transporte de passageiros branca em uma estrada"
  },
  {
    id: "salgueiro-1",
    name: "Expresso Sertanejo",
    destination: "Salgueiro",
    phone: "(87) 98765-4321",
    schedule: "Saídas de hora em hora, das 7h às 17h (Todos os dias).",
    details: "Embarque em frente ao terminal rodoviário. Aceita encomendas.",
    image: "Micro-ônibus prata em uma rodovia"
  },
  {
    id: "recife-1",
    name: "Viação Progresso",
    destination: "Recife",
    phone: "0800 081 0155",
    schedule: "Horários: 08:00, 14:00, 22:00. Consulte o site para confirmar.",
    details: "Ônibus leito e executivo partindo do Terminal Rodoviário de Floresta.",
    image: "Ônibus de viagem moderno em um terminal rodoviário"
  },
  {
    id: "serra-talhada-2",
    name: "Rápido Floresta",
    destination: "Serra Talhada",
    phone: "(87) 95555-4444",
    schedule: "Saídas às 7h, 9h, 11h, 13h, 15h, 17h (Seg a Sex).",
    details: "Ponto de saída ao lado do Mercado Público. Viagens diretas.",
    image: "Carro sedan prata em uma rua da cidade"
  },
];

export const transportDestinations = [...new Set(transportOptions.map(item => item.destination))].sort();