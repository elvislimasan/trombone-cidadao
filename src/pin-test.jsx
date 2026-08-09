import '@/index.css';
import 'leaflet/dist/leaflet.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Calendar, ThumbsUp, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Replica o conteudo do Popup ja com os ajustes, dentro do wrapper do Leaflet.
function Balao({dark}) {
  return (
    <div className={dark?'dark':''} style={{padding:20,background:dark?'#14171c':'#e9e5df'}}>
      <div style={{color:dark?'#ccc':'#555',font:'600 11px sans-serif',marginBottom:8}}>
        {dark?'TEMA ESCURO':'TEMA CLARO'}
      </div>
      <div className="leaflet-container" style={{position:'relative'}}>
        <div className="leaflet-popup" style={{position:'static'}}>
          <div className="leaflet-popup-content-wrapper" style={{borderRadius:12}}>
            <div className="leaflet-popup-content" style={{margin:'10px 12px'}}>
              <div className="w-52">
                <h3 className="font-bold text-sm leading-snug mb-1 line-clamp-2">
                  Lâmpada do poste apagada loteamento 3 Marias
                </h3>
                <div className="flex items-center text-[11px] text-muted-foreground mb-2">
                  <Calendar className="w-3 h-3 mr-1" />02/06/2026
                </div>
                <div className="flex items-center justify-between gap-1.5">
                  <Button variant="outline" size="sm" className="h-7 px-2 flex items-center gap-1 text-xs">
                    <ThumbsUp className="w-3 h-3" /><span>1</span>
                  </Button>
                  <Button size="sm" variant="outline"
                    className="h-7 px-2 flex items-center gap-1 border-primary/30 text-primary hover:bg-primary/10 text-xs">
                    <Megaphone className="w-3 h-3" />Atualizar
                  </Button>
                  <Button size="sm" className="h-7 px-3 text-xs bg-primary hover:bg-primary/90">
                    Detalhes
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <div className="leaflet-popup-tip-container" style={{margin:'0 auto'}}>
            <div className="leaflet-popup-tip"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')).render(
  <div style={{display:'flex',gap:14,padding:14,background:'#f4f5f7'}}>
    <Balao dark={false}/><Balao dark/>
  </div>
);
