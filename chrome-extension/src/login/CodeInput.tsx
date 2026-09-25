import { useState } from 'react';

type Props = { id: string; value: string; disabled: boolean; onChange: (value: string) => void };
// Keep one real input so paste, backspace, autofill and screen readers work normally.
export default function CodeInput({id,value,disabled,onChange}:Props) {
  const [focused,setFocused]=useState(false);
  const [position,setPosition]=useState(0);
  return <div className="school-code" data-disabled={disabled}>
    <input id={id} name={id} type="text" inputMode="numeric" autoComplete="one-time-code"
      pattern="[0-9]{6}" maxLength={6} required disabled={disabled} value={value}
      onChange={event=>{onChange(event.target.value.replace(/\D/g,''));setPosition(event.target.selectionStart??0);}}
      onFocus={event=>{setFocused(true);setPosition(event.target.selectionStart??value.length);}}
      onBlur={()=>setFocused(false)} onSelect={event=>setPosition(event.currentTarget.selectionStart??0)}/>
    <div className="school-code-cells" aria-hidden="true">
      {Array.from({length:6},(_,i)=><span key={i} className={focused && i===Math.min(position,5)?'is-active':''}>{value[i]||''}</span>)}
    </div>
  </div>;
}
