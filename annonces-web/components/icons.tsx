/* Icônes en SVG intégré : aucune police d'icônes à télécharger. Elles prennent la couleur du texte. */
import type { SVGProps } from 'react';

const base = (size: number): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
});

export const HeartIcon = ({ size = 22, filled = false }: { size?: number; filled?: boolean }) => (
  <svg {...base(size)} fill={filled ? 'currentColor' : 'none'}>
    <path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.9 4.5 7.2 4.5c2 0 3.5 1.1 4.8 2.8 1.3-1.7 2.8-2.8 4.8-2.8 3.3 0 5.6 3.1 4.4 6.6-1.7 4.8-9.2 9.4-9.2 9.4z" />
  </svg>
);

export const ImageIcon = ({ size = 28 }: { size?: number }) => (
  <svg {...base(size)} strokeWidth={1.6}>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <circle cx="8.5" cy="9.5" r="1.8" />
    <path d="M21 16l-5.5-5.5L6 20" />
  </svg>
);

export const PlusCircleIcon = ({ size = 20 }: { size?: number }) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v8M8 12h8" />
  </svg>
);

export const UploadIcon = ({ size = 24 }: { size?: number }) => (
  <svg {...base(size)}>
    <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
  </svg>
);

export const RetryIcon = ({ size = 22 }: { size?: number }) => (
  <svg {...base(size)}>
    <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" />
  </svg>
);

export const LockIcon = ({ size = 14 }: { size?: number }) => (
  <svg {...base(size)}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

export const CartIcon = ({ size = 22 }: { size?: number }) => (
  <svg {...base(size)}>
    <path d="M3 4h2.2l2.1 10.6a1.8 1.8 0 0 0 1.8 1.4h8.2a1.8 1.8 0 0 0 1.7-1.3L21 8H6.2" />
    <circle cx="9.5" cy="20" r="1.4" />
    <circle cx="17" cy="20" r="1.4" />
  </svg>
);

export const ChatIcon = ({ size = 22 }: { size?: number }) => (
  <svg {...base(size)}>
    <path d="M20 12.5c0 4-3.6 7-8 7-1.2 0-2.3-.2-3.3-.6L4 20l1.2-3.6C4.4 15.2 4 13.9 4 12.5c0-4 3.6-7 8-7s8 3 8 7z" />
  </svg>
);

export const UserIcon = ({ size = 22 }: { size?: number }) => (
  <svg {...base(size)}>
    <circle cx="12" cy="8.5" r="4" />
    <path d="M4.5 20c1.2-3.6 4.1-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
  </svg>
);
