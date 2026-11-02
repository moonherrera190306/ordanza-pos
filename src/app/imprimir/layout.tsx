export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        body{background:var(--sunk)}
        .printbar{position:sticky;top:0;display:flex;gap:8px;justify-content:center;padding:12px;background:var(--surface);border-bottom:1px solid var(--line)}
        .paper{background:#fff;color:#000;margin:16px auto;padding:3mm;font-family:var(--f-mono);font-size:11px;line-height:1.45;box-shadow:var(--sh-2)}
        .paper .c{text-align:center}.paper .r{display:flex;justify-content:space-between;gap:6px}
        .paper hr{border:0;border-top:1px dashed #000;margin:5px 0}
        .paper .big{font-size:14px;font-weight:700}.paper b{font-weight:700}
        .paper svg{display:block;margin:6px auto 0;max-width:100%}
        @media print{
          @page{margin:0}
          body{background:#fff}
          .printbar{display:none}
          .paper{margin:0;box-shadow:none}
        }
      `}</style>
      {children}
    </>
  );
}
