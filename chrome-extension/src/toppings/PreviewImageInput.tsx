import { useRef, useState } from 'react';

export default function PreviewImageInput({value,onChange,disabled}:{value:string;onChange:(value:string)=>void;disabled:boolean}) {
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const sequence=useRef(0);
  const pasteInput=useRef<HTMLInputElement>(null);
  const [filename,setFilename]=useState('');
  const fileInput=useRef<HTMLInputElement>(null);
  function remove() {
    sequence.current++;
    onChange('');setFilename('');setError('');setLoading(false);
    if(fileInput.current)fileInput.current.value='';
    pasteInput.current?.focus();
  }
  async function select(file?:File) {
    const current=++sequence.current;
    if(!file)return;
    setError('');setLoading(true);onChange('');
    try {
      if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024)throw new Error('Choose a PNG, JPG or WebP image under 10 MB.');
      const bitmap=await createImageBitmap(file);
      let result='';
      try {
        const scale=Math.min(1,1200/bitmap.width,900/bitmap.height);
        const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
        canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);
        for(const quality of [0.85,0.7,0.5]){result=canvas.toDataURL('image/webp',quality);if(result.length<690000)break;}
        if(result.length>=690000)throw new Error('This image is too large. Choose a smaller image.');
      } finally { bitmap.close(); }
      if(current===sequence.current){onChange(result);setFilename(file.name||'Pasted image');}
    } catch(e){if(current===sequence.current)setError(e instanceof Error?e.message:'Could not read this image.');}
    finally {if(current===sequence.current)setLoading(false);}
  }
  return <div className="preview-image-input"><label htmlFor="preview-image-paste"><span className="field-caption">Preview image <span className="required-mark" aria-hidden="true">*</span></span></label>
    {value&&<div className="preview-image-frame"><img src={value} alt="Selected Topping preview"/><button type="button" className="preview-image-remove" aria-label="Remove preview image" title="Remove image" disabled={disabled} onClick={remove}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>}
    <div className="preview-image-controls">
      <input ref={pasteInput} id="preview-image-paste" aria-label="Preview image" aria-required="true" type="text" readOnly disabled={disabled||loading} value={value?(filename||'Image selected'):''} placeholder="Click here and paste an image" onPaste={event=>{
        const file=Array.from(event.clipboardData.items).find(item=>item.kind==='file'&&item.type.startsWith('image/'))?.getAsFile();
        if(!file)return;
        event.preventDefault();void select(file);
      }}/>
      <button type="button" className="quiet" disabled={disabled||loading} onClick={()=>fileInput.current?.click()}>Choose file</button>
      <input ref={fileInput} aria-label="Choose preview image file" type="file" hidden accept="image/png,image/jpeg,image/webp" disabled={disabled||loading} onChange={e=>void select(e.target.files?.[0])}/>
    </div>
    {loading&&<span role="status">Preparing image…</span>}{error&&<p className="error" role="alert">{error}</p>}
  </div>;
}
