const P = {
  home: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z",
  cart: "M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2M9 20.5h.01M17 20.5h.01",
  scan: "M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 9v6M11 9v6M14 9v6M17 9v6",
  box: "M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5",
  tag: "M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01",
  cal: "M4 6h16v15H4zM4 10h16M8 3v5M16 3v5",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  x: "M6 6l12 12M18 6L6 18",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3",
  camera: "M3 8h4l2-3h6l2 3h4v12H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  trash: "M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15",
  download: "M12 3v12M7 10l5 5 5-5M4 21h16",
  printer: "M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z",
  edit: "M4 20h4L20 8l-4-4L4 16z",
  check: "M5 12l5 5L20 7",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  cash: "M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  card: "M2 6h20v12H2zM2 10h20M6 15h4",
  swap: "M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7",
  alert: "M12 3l10 18H2zM12 10v4M12 17h.01",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  undo: "M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
  percent: "M19 5L5 19M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  bell: "M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10.3 21a1.9 1.9 0 0 0 3.4 0",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.1a4 4 0 0 1 0 7.8M22 21a7 7 0 0 0-4-6.3",
  truck: "M1 4h13v12H1zM14 8h4l4 4v4h-8M5.5 19.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18.5 19.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  upload: "M12 15V3M7 8l5-5 5 5M4 21h16",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
  link: "M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
} as const;

export type IconName = keyof typeof P;

export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg className={`ic ${className}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d={P[name]} />
    </svg>
  );
}

export function Mark({ style }: { style?: React.CSSProperties }) {
  return (
    <div className="mark" style={style}>
      {[3, 6, 2, 4, 2, 7, 3].map((w, i) => (
        <i key={i} style={{ width: w }} />
      ))}
    </div>
  );
}
