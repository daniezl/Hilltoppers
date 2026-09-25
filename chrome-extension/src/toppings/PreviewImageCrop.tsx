import { useEffect, useRef, useState } from 'react';
import { Crop } from '@phosphor-icons/react';

const frame={x:100,y:137.5,width:1000,height:625};

// Matches the marketplace card's 16:10 preview.
export default function PreviewImageCrop({image,onSave,onCancel}:{image:ImageBitmap;onSave:(data:string)=>void;onCancel:()=>void}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  const [zoom,setZoom]=useState(1);
  const [center,setCenter]=useState({x:image.width/2,y:image.height/2});
  const [error,setError]=useState('');
  const pointers=useRef(new Map<number,{x:number;y:number}>());
  const view=useRef({zoom:1,x:image.width/2,y:image.height/2});
  const width=Math.min(image.width,image.height*1.6)/zoom;
  const height=width/1.6;
  const cx=Math.max(width/2,Math.min(image.width-width/2,center.x));
  const cy=Math.max(height/2,Math.min(image.height-height/2,center.y));
  function applyView(nextZoom:number,x:number,y:number){
    const z=Math.max(1,Math.min(4,nextZoom));
    const w=Math.min(image.width,image.height*1.6)/z,h=w/1.6;
    const next={zoom:z,x:Math.max(w/2,Math.min(image.width-w/2,x)),y:Math.max(h/2,Math.min(image.height-h/2,y))};
    view.current=next;setZoom(next.zoom);setCenter({x:next.x,y:next.y});
  }
  function transformAt(factor:number,from:{x:number;y:number},to=from){
    const box=canvas.current!.getBoundingClientRect(),old=view.current;
    const z=Math.max(1,Math.min(4,old.zoom*factor));
    const scale=Math.min(image.width,image.height*1.6)/old.zoom*1200/(frame.width*box.width);
    const origin={x:box.left+box.width/2,y:box.top+box.height/2};
    applyView(z,old.x+(from.x-origin.x)*scale-(to.x-origin.x)*scale*old.zoom/z,old.y+(from.y-origin.y)*scale-(to.y-origin.y)*scale*old.zoom/z);
  }
  useEffect(()=>{
    const element=canvas.current;
    const wheel=(e:WheelEvent)=>{
      // Chromium sends trackpad pinch gestures as Ctrl+wheel.
      if(!e.ctrlKey)return;
      e.preventDefault();
      const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?element!.clientHeight:1);
      transformAt(Math.exp(-delta*.01),{x:e.clientX,y:e.clientY});
    };
    element?.addEventListener('wheel',wheel,{passive:false});
    return()=>element?.removeEventListener('wheel',wheel);
  },[image]);
  useEffect(()=>{
    const ctx=canvas.current?.getContext('2d');
    if(!ctx)return;
    ctx.clearRect(0,0,1200,900);
    const scale=frame.width/width;
    ctx.drawImage(image,600-cx*scale,450-cy*scale,image.width*scale,image.height*scale);
    // Dim only the discarded area; keep the crop at its original brightness.
    ctx.fillStyle='rgba(0,0,0,.58)';
    ctx.beginPath();ctx.rect(0,0,1200,900);ctx.rect(frame.x,frame.y,frame.width,frame.height);ctx.fill('evenodd');
    ctx.save();
    ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=2;
    ctx.beginPath();
    for(const part of [1/3,2/3]){
      ctx.moveTo(frame.x+frame.width*part,frame.y);ctx.lineTo(frame.x+frame.width*part,frame.y+frame.height);
      ctx.moveTo(frame.x,frame.y+frame.height*part);ctx.lineTo(frame.x+frame.width,frame.y+frame.height*part);
    }
    ctx.stroke();
    ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.setLineDash([18,12]);
    ctx.shadowColor='rgba(0,0,0,.6)';ctx.shadowBlur=3;
    ctx.strokeRect(frame.x,frame.y,frame.width,frame.height);
    ctx.setLineDash([]);ctx.lineWidth=6;
    for(const [x,y,dx,dy] of [[frame.x,frame.y,1,1],[frame.x+frame.width,frame.y,-1,1],[frame.x,frame.y+frame.height,1,-1],[frame.x+frame.width,frame.y+frame.height,-1,-1]]){
      ctx.beginPath();ctx.moveTo(x+dx*30,y);ctx.lineTo(x,y);ctx.lineTo(x,y+dy*30);ctx.stroke();
    }
    ctx.restore();
  },[image,cx,cy,width,height]);
  function save(){
    try {
      const output=document.createElement('canvas');output.width=1200;output.height=750;
      output.getContext('2d')!.drawImage(image,cx-width/2,cy-height/2,width,height,0,0,1200,750);
      let result='';
      for(const quality of [0.85,0.7,0.5]){result=output.toDataURL('image/webp',quality);if(result.length<690000)break;}
      if(result.length>=690000)throw new Error('This image is too large. Try cropping a smaller area.');
      onSave(result);
    }catch(e){setError(e instanceof Error?e.message:'Could not crop this image.');}
  }
  return <div className="preview-crop">
    <div className="preview-crop-heading"><strong><Crop size={18} aria-hidden="true"/>Crop your image</strong><span>16:10</span></div><p className="preview-crop-hint">Drag to move. Pinch to zoom. Only the bright area will be kept.</p>
    <canvas ref={canvas} width={1200} height={900} tabIndex={0} aria-label="Crop preview. Drag or use arrow keys to move the image." onPointerDown={e=>{
      if(e.button!==0)return;
      e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);
      pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
    }} onPointerMove={e=>{
      const points=pointers.current;if(!points.has(e.pointerId))return;
      const before=Array.from(points.values());
      points.set(e.pointerId,{x:e.clientX,y:e.clientY});
      const after=Array.from(points.values());
      if(points.size===1){transformAt(1,before[0],after[0]);return;}
      const distance=(p:{x:number;y:number}[])=>Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y);
      const midpoint=(p:{x:number;y:number}[])=>({x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2});
      if(distance(before)>0)transformAt(distance(after)/distance(before),midpoint(before),midpoint(after));
    }} onPointerUp={e=>{pointers.current.delete(e.pointerId);}} onPointerCancel={e=>{pointers.current.delete(e.pointerId);}} onLostPointerCapture={e=>{pointers.current.delete(e.pointerId);}} onKeyDown={e=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
      e.preventDefault();const step=width*(e.shiftKey?0.1:0.02);
      applyView(zoom,Math.max(width/2,Math.min(image.width-width/2,cx+(e.key==='ArrowLeft'?step:e.key==='ArrowRight'?-step:0))),Math.max(height/2,Math.min(image.height-height/2,cy+(e.key==='ArrowUp'?step:e.key==='ArrowDown'?-step:0))));
    }}/>
    <label className="preview-crop-zoom">Zoom<input aria-label="Crop zoom" type="range" min="1" max="4" step="0.01" value={zoom} onChange={e=>applyView(Number(e.target.value),cx,cy)}/></label>
    {error&&<p className="error" role="alert">{error}</p>}
    <div className="preview-crop-actions"><button type="button" className="quiet" onClick={onCancel}>Cancel</button><button type="button" className="primary" onClick={save}>Crop image</button></div>
  </div>;
}
