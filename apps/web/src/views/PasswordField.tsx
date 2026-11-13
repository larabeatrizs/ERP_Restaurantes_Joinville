import { useState } from 'react';
export function PasswordField({ id, name, label, disabled = false, autoComplete, describedBy }: { id: string; name: string; label: string; disabled?: boolean; autoComplete: 'current-password' | 'new-password'; describedBy?: string }) {
  const [visible, setVisible] = useState(false);
  return <div className="field"><label htmlFor={id}>{label}</label><div className="password-control">
    <input id={id} name={name} type={visible ? 'text' : 'password'} autoComplete={autoComplete} required disabled={disabled} aria-describedby={describedBy} />
    <button type="button" disabled={disabled} aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible(value => !value)}>{visible ? 'Ocultar' : 'Mostrar'}</button>
  </div></div>;
}
