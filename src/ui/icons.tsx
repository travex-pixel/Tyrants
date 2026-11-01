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
      <ellipse cx="6" cy="12" rx="3" ry="5" />
      <path d="M6 7h12c1.7 0 3 2.2 3 5s-1.3 5-3 5H6" />
      <circle cx="6" cy="12" r="1" />
    </svg>
  ),
  stone: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M7 19l-4-6 4-7h9l5 6-3 7z" />
      <path d="M7 6l5 7 7-1M12 13l-2 6" />
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
      <path d="M12 2l5 7-5 13-5-13z" />
      <path d="M7 9h10" />
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
};
export type IconName = keyof typeof Icons;
