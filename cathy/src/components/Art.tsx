/** Ilustraciones en SVG inline (sin red, funcionan offline). */
export function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="3" fill="#fbf9f3" stroke="#1c2333" strokeWidth="1.5" />
      <path d="M12 6h8M14 6v7l-6 11a2 2 0 0 0 1.8 3h12.4a2 2 0 0 0 1.8-3l-6-11V6" fill="none" stroke="#1c2333" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10.5 20h11" stroke="#cf5847" strokeWidth="1.6" />
      <circle cx="14" cy="23" r="1.2" fill="#2e6b4c" />
      <circle cx="17.5" cy="24" r="1.2" fill="#a86a12" />
      <circle cx="20" cy="22.5" r="1.2" fill="#3353a3" />
    </svg>
  );
}

export function EmptyFlask() {
  return (
    <svg viewBox="0 0 120 120" aria-hidden>
      <path d="M48 14h24M52 14v30L28 92a8 8 0 0 0 7 12h50a8 8 0 0 0 7-12L68 44V14" fill="none" stroke="#1c2333" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M36 78h48" stroke="#cf5847" strokeWidth="2" strokeDasharray="4 4" />
      <text x="88" y="80" fontFamily="monospace" fontSize="8" fill="#8a90a0">
        T1
      </text>
      <circle cx="50" cy="92" r="3" fill="#2e6b4c" />
      <circle cx="62" cy="96" r="3" fill="#a86a12" />
      <circle cx="72" cy="90" r="3" fill="#3353a3" />
    </svg>
  );
}
