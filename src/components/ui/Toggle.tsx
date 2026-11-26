import clsx from 'clsx';

/**
 * iOS-style switch. Track 52×32, knob 28 with 2px inset – the knob is positioned
 * explicitly (left + translate), so it can never leave the track.
 */
export function Toggle({ checked, onChange, label, id, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string; disabled?: boolean }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-8 w-[52px] shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 ease-out',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40',
        checked ? 'bg-accent' : 'bg-line dark:bg-[rgb(58_60_66)]',
      )}
    >
      <span
        aria-hidden
        className={clsx(
          'pointer-events-none block h-7 w-7 rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/0.25),0_0_0_0.5px_rgb(0_0_0/0.04)]',
          'transition-transform duration-200 ease-[cubic-bezier(.3,1.4,.6,1)]',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  );
}
