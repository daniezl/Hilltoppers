import { useEffect, useRef, useState } from 'react';
import PreviewImageCrop from './PreviewImageCrop';

export default function PreviewImageInput({value,onChange,disabled,onEditingChange}:{value:string;onChange:(value:string)=>void;disabled:boolean;onEditingChange:(editing:boolean)=>void}) {
  const [error,setError]=useState('');
  const [crop,setCrop]=useState<{image:ImageBitmap;name:string}|null>(null);
  useEffect(()=>()=>{crop?.image.close();},[crop]);
  useEffect(()=>()=>{sequence.current++;},[]);
  const [loading,setLoading]=useState(false);
  useEffect(()=>{onEditingChange(loading||!!crop);return()=>onEditingChange(false);},[loading,crop,onEditingChange]);
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
    setError('');setLoading(true);
    try {
      if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024)throw new Error('Choose a PNG, JPG or WebP image under 10 MB.');
      const bitmap=await createImageBitmap(file);
      if(current===sequence.current)setCrop({image:bitmap,name:file.name||'Pasted image'});
      else bitmap.close();
    } catch(e){if(current===sequence.current)setError(e instanceof Error?e.message:'Could not read this image.');}
    finally {if(current===sequence.current)setLoading(false);}
  }
  return <div className="preview-image-input"><label htmlFor="preview-image-paste"><span className="field-caption">Preview image <span className="required-mark" aria-hidden="true">*</span></span></label>
    {crop?<PreviewImageCrop key={crop.name+sequence.current} image={crop.image} onCancel={()=>setCrop(null)} onSave={data=>{onChange(data);setFilename(crop.name);setCrop(null);}}/>:value&&<div className="preview-image-frame"><img src={value} alt="Selected Topping preview"/><button type="button" className="preview-image-remove" aria-label="Remove preview image" title="Remove image" disabled={disabled} onClick={remove}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>}
    <div className="preview-image-controls">
      <input ref={pasteInput} id="preview-image-paste" aria-label="Preview image" aria-required="true" type="text" readOnly disabled={disabled||loading||!!crop} value={value?(filename||'Image selected'):''} placeholder="Click here and paste an image" onPaste={event=>{
        const file=Array.from(event.clipboardData.items).find(item=>item.kind==='file'&&item.type.startsWith('image/'))?.getAsFile();
        if(!file)return;
        event.preventDefault();void select(file);
      }}/>
      <button type="button" className="quiet" disabled={disabled||loading||!!crop} onClick={()=>fileInput.current?.click()}>Choose file</button>
      <input ref={fileInput} aria-label="Choose preview image file" type="file" hidden accept="image/png,image/jpeg,image/webp" disabled={disabled||loading||!!crop} onChange={e=>{const file=e.target.files?.[0];e.target.value='';void select(file);}}/>
    </div>
    {loading&&<span role="status">Preparing image…</span>}{error&&<p className="error" role="alert">{error}</p>}
  </div>;
}
