type Props = {linked:boolean;confirmed:boolean;busy:boolean;onClick:()=>void};
export default function SchoolLinkButton({linked,confirmed,busy,onClick}:Props) {
  const state=confirmed?'verified':linked?'unlink':'link';
  const labels={link:'Link email',verified:'Verified',unlink:'Unlink'};
  return <button type="button" className="secondary account-action school-link-button" data-state={state}
    disabled={busy||confirmed} aria-label={labels[state]} onClick={onClick}>
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <g style={{opacity:confirmed?0:1}}><path d="M4 10h12"/><path d="M10 4v12" style={{opacity:linked?0:1}}/></g>
      <path className="school-link-check" d="m4 10 4 4 8-8" style={{opacity:confirmed?1:0,transform:confirmed?'scale(1)':'scale(.6)'}}/>
    </svg>
    <span className="school-link-labels" aria-hidden="true">{Object.entries(labels).map(([key,label])=><span key={key} className={state===key?'is-visible':''}>{label}</span>)}</span>
    <span className="school-link-announcement" role="status">{confirmed?'Email verified.':''}</span>
  </button>;
}
