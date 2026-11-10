import React from 'react';
import PipaMap from './PipaMap';
import PipaTankDetails from './PipaTankDetails';

export default function PipaManagementMap({ tanks, selected, levels, city, requests, onSelect, onOpen, canRequest, canEdit }) {
  return <div className="pipa-management-map">
    <PipaMap tanks={tanks.filter(t => t.active)} city={city} selected={selected} onSelect={tank => onSelect(tank.id)} requests={requests} levels={levels} showPopups={false} />
    <PipaTankDetails tank={selected} level={selected && levels.get(selected.id)} onClose={() => onSelect('')} onOpen={(mode, value) => { onSelect(''); onOpen(mode, value); }} canRequest={canRequest} canEdit={selected && canEdit(selected.channel_id)} />
  </div>;
}
