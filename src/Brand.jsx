export function Symbol({ className = '' }) {
  return <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M32 8C18.75 8 8 18.75 8 32h14c0-5.52 4.48-10 10-10h24C56 14.27 49.73 8 42 8H32Z" fill="currentColor"/><path d="M32 56c13.25 0 24-10.75 24-24H42c0 5.52-4.48 10-10 10H8c0 7.73 6.27 14 14 14h10Z" fill="currentColor"/></svg>;
}
export default function Brand() {
  return <div className="brand"><Symbol className="brand-mark"/><span>tender<span className="brand-period">.</span></span></div>;
}
