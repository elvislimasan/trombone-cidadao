import '@/index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { createPinIcon } from '@/components/map/pinIcon';

const cats=['buracos','iluminacao','esgoto','limpeza','poda','vazamento-de-agua','outros'];
const rot={buracos:'Buracos',iluminacao:'Iluminação',esgoto:'Esgoto',limpeza:'Limpeza',
poda:'Poda','vazamento-de-agua':'Vazamento',outros:'Outros'};
const sts=[['pending','Pendente'],['in-progress','Em andamento'],['resolved','Resolvida']];

function Bloco({dark}) {
  return (
    <div className={dark?'dark':''} style={{background:dark?'#14171c':'#eae6df',padding:14}}>
      <div style={{color:dark?'#ccc':'#444',font:'600 11px sans-serif',marginBottom:8}}>
        {dark?'ESCURO':'CLARO'}
      </div>
      {sts.map(([s,rs])=>(
        <div key={s} style={{marginBottom:10}}>
          <div style={{color:dark?'#9ca3af':'#555',font:'10px sans-serif',marginBottom:4}}>{rs}</div>
          <div style={{display:'flex',gap:8}}>
            {cats.map(c=>(
              <div key={c} style={{textAlign:'center',width:74}}>
                <div style={{display:'flex',justifyContent:'center'}}
                  dangerouslySetInnerHTML={{__html:createPinIcon({report:{category_id:c,status:s}}).options.html}}/>
                <div style={{color:dark?'#7a828f':'#666',font:'9px sans-serif',marginTop:2}}>{rot[c]}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
createRoot(document.getElementById('root')).render(<><Bloco dark={false}/><Bloco dark/></>);
