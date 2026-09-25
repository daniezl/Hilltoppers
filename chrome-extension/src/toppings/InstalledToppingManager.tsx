import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { changeTopping, localToppings, saveToppingOrder, TOPPINGS_KEY, TOPPING_ORDER_KEY, PREVIEW_TOPPING_KEY, type Topping } from '../services/toppingsService';
import ToppingIcon from './ToppingIcon';

export default function InstalledToppingManager({onChange,onLayoutChange}:{onChange:()=>Promise<unknown>;onLayoutChange:()=>void}) {
  const [items,setItems]=useState<Topping[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[over,setOver]=useState<string|null>(null);
  const dragged=useRef<string|null>(null);
  useLayoutEffect(()=>{onLayoutChange();},[items,onLayoutChange]);
  useEffect(()=>{
    let alive=true;
    const read=()=>{void localToppings().then(list=>{if(alive)setItems(list);}).catch(e=>{if(alive)setError(e.message);});};
    const changed=(changes:Record<string,chrome.storage.StorageChange>,area:string)=>{
      if((area==='local'&&(changes[TOPPINGS_KEY]||changes[TOPPING_ORDER_KEY]||changes.askSjaToppingEnabled))||(area==='session'&&changes[PREVIEW_TOPPING_KEY]))read();
    };
    read();chrome.storage.onChanged.addListener(changed);
    return()=>{alive=false;chrome.storage.onChanged.removeListener(changed);};
  },[]);
  async function move(id:string,target:string){
    if(busy||id===target)return;
    const next=[...items],from=next.findIndex(t=>t.id===id),to=next.findIndex(t=>t.id===target);
    if(from<0||to<0)return;
    next.splice(to,0,next.splice(from,1)[0]);setItems(next);setBusy(true);setError('');
    try{await saveToppingOrder(next.map(t=>t.id));}catch(e){setError(e instanceof Error?e.message:'Could not save the order.');setItems(await localToppings());}finally{setBusy(false);}
  }
  async function remove(t:Topping){
    setBusy(true);setError('');
    try{await changeTopping(t,false);await onChange();}catch(e){setError(e instanceof Error?e.message:'Could not remove Topping.');}finally{setBusy(false);}
  }
  return <section className="installed-manager" aria-labelledby="installed-title">
    <div className="installed-heading"><h2 id="installed-title">Your Toppings</h2></div>
    {error&&<p className="error" role="alert">{error}</p>}
    {!items.length?<p className="installed-empty">No Toppings added yet.</p>:<ul className="installed-list">{items.map((t,index)=><li key={t.id} draggable={!busy} className={over===t.id?'is-drop-target':''}
      onDragStart={e=>{if(busy){e.preventDefault();return;}dragged.current=t.id;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',t.id);}}
      onDragOver={e=>{if(!busy&&dragged.current&&dragged.current!==t.id){e.preventDefault();e.dataTransfer.dropEffect='move';setOver(t.id);}}}
      onDrop={e=>{e.preventDefault();const id=dragged.current;dragged.current=null;setOver(null);if(id)void move(id,t.id);}}
      onDragEnd={()=>{dragged.current=null;setOver(null);}}>
      <button className="installed-grip" type="button" aria-label={`Reorder ${t.name}`} title="Drag to reorder, or use arrow keys" disabled={busy} onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();const target=items[index+(e.key==='ArrowUp'?-1:1)];if(target)void move(t.id,target.id);}}}><svg viewBox="0 0 20 24" aria-hidden="true">{[6,12,18].flatMap(y=>[7,13].map(x=><circle key={`${x}-${y}`} cx={x} cy={y} r="1.3"/>))}</svg></button>
      <ToppingIcon icon={t.icon||(t.id==='ask-sja'?'chat':'sparkle')}/>
      <span className="installed-name">{t.name}{t.preview&&<small>Preview</small>}</span><span className="installed-author">By {t.author}</span>
      <button type="button" className="installed-remove" aria-label={`Remove ${t.name}`} title="Remove" disabled={busy} onClick={()=>void remove(t)}>−</button>
    </li>)}</ul>}
  </section>;
}
