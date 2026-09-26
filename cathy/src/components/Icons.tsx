/** Íconos de trazo, 20 × 20, heredan el color del texto. Siempre decorativos: el texto acompaña. */
type P = { size?: number };

function Svg({ size = 18, children }: P & { children: React.ReactNode }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const CopyIcon = (p: P) => (
  <Svg {...p}>
    <rect x="6.5" y="6.5" width="10" height="10" rx="2" />
    <path d="M13.5 6.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v7A1.5 1.5 0 0 0 5 13.5h1.5" />
  </Svg>
);

export const DownloadIcon = (p: P) => (
  <Svg {...p}>
    <path d="M10 3.5v9M6.25 8.75 10 12.5l3.75-3.75M4 16.5h12" />
  </Svg>
);

export const CheckIcon = (p: P) => (
  <Svg {...p}>
    <path d="m4.5 10.5 3.5 3.5 7.5-8" />
  </Svg>
);

export const OfflineIcon = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 7.5a11 11 0 0 1 3-1.9M8.6 4.6A11 11 0 0 1 17.5 7.5M5 10.5a7 7 0 0 1 3.3-1.8M12.6 8.9A7 7 0 0 1 15 10.5M7.75 13.25a3.25 3.25 0 0 1 4.5 0M3 3l14 14" />
  </Svg>
);

export const ArrowLeftIcon = (p: P) => (
  <Svg {...p}>
    <path d="M16 10H4M8.5 5.5 4 10l4.5 4.5" />
  </Svg>
);
