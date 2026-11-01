import type { SVGProps } from "react";

const base = (p: SVGProps<SVGSVGElement>) => ({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, ...p });

export const Icons = {
  hand: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12" />
      <path d="M11 11.5V4.5a1.5 1.5 0 0 1 3 0V12" />
      <path d="M14 12V6.5a1.5 1.5 0 0 1 3 0V13" />
      <path d="M17 13V9.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1.5a6 6 0 0 1-5-2.7L4 14.5a1.6 1.6 0 0 1 2.6-1.8L8 14" />
    </svg>
  ),
  sparkle: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />
    </svg>
  ),
  bolt: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
    </svg>
  ),
  sun: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  mountain: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M3 20l6-11 4 6 2-3 6 8z" />
      <path d="M9 9l2 3" />
    </svg>
  ),
  giant: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M4 20h16" />
      <path d="M12 4v12" />
      <path d="M7 9l5-5 5 5" />
      <path d="M7 16l5 4 5-4" />
    </svg>
  ),
  clone: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  storm: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M17 17a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 6 17z" />
      <path d="M12 19l-2 4M8 19l-1 2M16 19l-1 2" />
    </svg>
  ),
  hammer: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M14 4l6 6-3 3-6-6z" />
      <path d="M11 7l-8 8 3 3 8-8" />
    </svg>
  ),
  book: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  users: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  trophy: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" />
    </svg>
  ),
  cog: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  ),
  wood: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M8 6h10c2 0 3.5 2.7 3.5 6S20 18 18 18H8" />
      <ellipse cx="8" cy="12" rx="4" ry="6" fill="currentColor" fillOpacity="0.25" />
      <ellipse cx="8" cy="12" rx="2" ry="3" />
      <path d="M12 8.5h5M12 15.5h5" strokeOpacity="0.6" />
    </svg>
  ),
  stone: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M3 19l2.5-5 4-1.5 3 3L11 19z" fill="currentColor" fillOpacity="0.25" />
      <path d="M11 19l2-5.5 5-1.5 3 4-1.5 3z" fill="currentColor" fillOpacity="0.15" />
      <path d="M8 12.5L9 8l5-2 3.5 3-1.5 4.5" />
    </svg>
  ),
  food: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M12 21c-5 0-8-4-8-8 0-3 2-5 4-5 1.5 0 2.5.5 4 2 1.5-1.5 2.5-2 4-2 2 0 4 2 4 5 0 4-3 8-8 8z" />
      <path d="M12 10V6l3-3" />
    </svg>
  ),
  essence: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M12 3l5 6-5 12-5-12z" fill="currentColor" fillOpacity="0.25" />
      <path d="M7 9h10M12 3v18M9 9l3 12 3-12" strokeOpacity="0.7" />
    </svg>
  ),
  scroll: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M6 4h11a3 3 0 0 1 3 3v1H9" />
      <path d="M6 4a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h11a3 3 0 0 0 3-3v-1H9" />
      <path d="M9 8v12M12 11h5M12 14h5" />
    </svg>
  ),
  pop: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  ),
  close: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  ),
  play: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M6 4l14 8-14 8z" />
    </svg>
  ),
  pause: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M8 5v14M16 5v14" />
    </svg>
  ),
  eye: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  target: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    </svg>
  ),
  home: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
    </svg>
  ),
  link: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5" />
    </svg>
  ),
  crown: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M3 18h18l-1.5-10-4.5 4-3-6-3 6-4.5-4z" />
    </svg>
  ),
  moon: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  ),
  flag: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M4 22V4h12l-2 4 2 4H4" />
    </svg>
  ),
  skull: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M12 2a8 8 0 0 0-5 14.2V19a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2.8A8 8 0 0 0 12 2z" />
      <circle cx="9" cy="11" r="1.5" />
      <circle cx="15" cy="11" r="1.5" />
      <path d="M10 17h4" />
    </svg>
  ),
  arrowUp: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  ),
  arrowDown: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M12 5v14M5 12l7 7 7-7" />
    </svg>
  ),
  copy: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  heart: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
    </svg>
  ),
  save: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </svg>
  ),
  mallet: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <rect x="11" y="3" width="10" height="7" rx="2" transform="rotate(45 16 6.5)" fill="currentColor" fillOpacity="0.3" />
      <path d="M12.5 10.5L4 19" strokeWidth="3" />
      <path d="M3.5 5.5a6 6 0 0 1 3-3M21.5 18.5a6 6 0 0 1-3 3" strokeOpacity="0.6" />
    </svg>
  ),
  boltFill: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M13.5 2L5 13h6l-1.5 9L19 11h-6z" fill="currentColor" fillOpacity="0.35" />
    </svg>
  ),
  sunFace: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="5" fill="currentColor" fillOpacity="0.3" />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
      <path d="M10 11h.01M14 11h.01" strokeWidth="2.4" />
      <path d="M9.8 13.6c1.2 1.3 3.2 1.3 4.4 0" />
    </svg>
  ),
  hills: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M2 19c3-6 6-9 9-9s6 3 9 9" fill="currentColor" fillOpacity="0.25" />
      <path d="M12 19c2-4 4-6 6-6s4 2 4 6" fill="currentColor" fillOpacity="0.2" />
      <path d="M11 3v5M8.5 5.5L11 3l2.5 2.5" />
    </svg>
  ),
  shovel: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M14 4l6 6" />
      <path d="M3 21c0-4 2-6 5-8l3-3 3 3-3 3c-2 3-4 5-8 5z" fill="currentColor" fillOpacity="0.3" />
      <path d="M11 10l6-6" />
    </svg>
  ),
  pouch: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M7 9c-3 3-4 6-3 9a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3c1-3 0-6-3-9z" fill="currentColor" fillOpacity="0.25" />
      <path d="M8 9c1-2 7-2 8 0M9 6l1.5-3 1.5 2 1.5-2L15 6" />
      <path d="M12 12l.8 2.2L15 15l-2.2.8L12 18l-.8-2.2L9 15l2.2-.8z" fill="currentColor" />
    </svg>
  ),
  campfire: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M12 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-7z" fill="currentColor" fillOpacity="0.35" />
      <path d="M4 20l16-4M4 16l16 4" />
    </svg>
  ),
  house: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" fill="currentColor" fillOpacity="0.25" />
      <path d="M10 20v-5a2 2 0 0 1 4 0v5" />
    </svg>
  ),
  sprout: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M3 20h18" />
      <path d="M7 20v-5M12 20v-8M17 20v-5" />
      <path d="M12 12c-4 0-5-3-5-5 3 0 5 2 5 5zM12 12c4 0 5-3 5-5-3 0-5 2-5 5z" fill="currentColor" fillOpacity="0.3" />
    </svg>
  ),
  barrel: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M6 4h12c1 3 1 13 0 16H6c-1-3-1-13 0-16z" fill="currentColor" fillOpacity="0.25" />
      <path d="M5 9h14M5 15h14M12 4v16" strokeOpacity="0.7" />
    </svg>
  ),
  axe: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M14 3c3 0 6 2 7 5-3 0-5 1-7 3l-3-3c1-2 2-4 3-5z" fill="currentColor" fillOpacity="0.3" />
      <path d="M11 8L3 16l2 2 8-8" />
    </svg>
  ),
  anvil: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M3 8h13a5 5 0 0 1 5 5h-9l-2 2v3h4v2H7v-2h4v-3l-3-2H3z" fill="currentColor" fillOpacity="0.3" />
    </svg>
  ),
  totem: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <rect x="8" y="3" width="8" height="18" rx="1" fill="currentColor" fillOpacity="0.25" />
      <path d="M8 9h8M8 15h8M4 6l4 2M20 6l-4 2" />
      <path d="M10.5 6.5h.01M13.5 6.5h.01M10.5 12h.01M13.5 12h.01" strokeWidth="2.2" />
    </svg>
  ),
  obelisk: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M10 20L11 5l1-3 1 3 1 15z" fill="currentColor" fillOpacity="0.3" />
      <path d="M5 21h14M7 20h10" />
      <path d="M12 2l1 1-1 1-1-1z" fill="currentColor" />
    </svg>
  ),
  book2: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M5 3h13a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5z" fill="currentColor" fillOpacity="0.25" />
      <path d="M5 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2M8 3v18" />
      <path d="M14 3v8l2-1.5 2 1.5V3" fill="currentColor" fillOpacity="0.5" />
    </svg>
  ),
  twin: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <circle cx="8" cy="9" r="3.5" fill="currentColor" fillOpacity="0.3" />
      <circle cx="16" cy="9" r="3.5" fill="currentColor" fillOpacity="0.3" />
      <path d="M2 20a6 6 0 0 1 12 0M10 20a6 6 0 0 1 12 0" />
    </svg>
  ),
};
export type IconName = keyof typeof Icons;
