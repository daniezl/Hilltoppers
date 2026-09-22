type Props = {
  installed: boolean;
  confirmation?: string;
  busy: boolean;
  onClick: () => void;
};

export default function ToppingInstallButton({ installed, confirmation, busy, onClick }: Props) {
  const success = Boolean(confirmation);
  const state = success ? (installed ? 'added' : 'removed') : (installed ? 'remove' : 'add');
  const labels = { add: 'Add', remove: 'Remove', added: 'Added to extension', removed: 'Removed' };
  return <button
    type="button"
    className="topping-install"
    data-state={state}
    disabled={busy || success}
    aria-label={labels[state]}
    onClick={onClick}
  >
    <svg className="topping-install-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <g className="topping-install-symbol" style={{ opacity: success ? 0 : 1 }}>
        <path d="M4 10h12"/>
        <path className="topping-install-plus" d="M10 4v12" style={{ opacity: installed ? 0 : 1 }}/>
      </g>
      <path className="topping-install-check" d="m4 10 4 4 8-8" style={{ opacity: success ? 1 : 0, transform: success ? 'scale(1)' : 'scale(.6)' }}/>
    </svg>
    <span className="topping-install-labels" aria-hidden="true">
      {Object.entries(labels).map(([key, label]) => <span key={key} className={key === state ? 'is-visible' : ''}>{label}</span>)}
    </span>
    <span className="topping-install-status" role="status">{confirmation || ''}</span>
  </button>;
}
