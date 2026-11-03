/** Marca de Ordanza (mismos archivos que el sitio). */
const SRC = {
  marca: "/brand/ordanza-marca.png", // sello iridiscente, para fondos oscuros
  placa: "/brand/ordanza-placa.png", // sello sobre placa oscura, sirve en cualquier fondo
  lockup: "/brand/ordanza-lockup.png", // sello + ORDANZA, para fondos claros
  "lockup-blanco": "/brand/ordanza-lockup-blanco.png", // sello + ORDANZA, para fondos oscuros
} as const;
const RATIO = { marca: 1, placa: 1, lockup: 4.88, "lockup-blanco": 4.88 } as const;

export function Logo({ variant = "marca", size = 32, className = "" }: { variant?: keyof typeof SRC; size?: number; className?: string }) {
  const w = Math.round(size * RATIO[variant]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={SRC[variant]} alt="Ordanza" width={w} height={size} className={`logo ${className}`} style={{ width: w, height: size }} draggable={false} />;
}
