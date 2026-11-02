"use client";

/** Campo de PIN de administrador para autorizar operaciones de un cajero. */
export function PinSupervisor({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <label className="fld sup">
      <span>PIN de un administrador para autorizar</span>
      <input
        className="mono" type="password" inputMode="numeric" maxLength={6} autoComplete="off" autoFocus={autoFocus}
        value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))} placeholder="••••"
      />
    </label>
  );
}
