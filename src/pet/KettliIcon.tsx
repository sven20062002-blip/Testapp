/** Line icon of Kettli for the navigation (same props as the lucide icons). */
export function KettliIcon({ size = 24, strokeWidth = 2, className }: { size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M8 10.2C7.3 4.6 16.7 4.6 16 10.2" />
      <circle cx="12" cy="14.5" r="6.5" />
      <circle cx="9.7" cy="13.6" r=".9" fill="currentColor" stroke="none" />
      <circle cx="14.3" cy="13.6" r=".9" fill="currentColor" stroke="none" />
      <path d="M10.4 16.3q1.6 1.2 3.2 0" />
    </svg>
  );
}
