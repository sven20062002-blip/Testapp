/** @type {import('tailwindcss').Config} */
const c = (v) => `rgb(var(--${v}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: c('bg'),
        surface: c('surface'),
        elevated: c('elevated'),
        line: c('line'),
        fg: c('fg'),
        muted: c('muted'),
        subtle: c('subtle'),
        accent: { DEFAULT: c('accent'), fg: c('accent-fg'), soft: c('accent-soft') },
        good: c('good'),
        warn: c('warn'),
        bad: c('bad'),
        info: c('info'),
      },
      fontFamily: {
        sans: ['"Inter Variable"', '-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'system-ui', 'sans-serif'],
      },
      borderRadius: { '2xl': '1.125rem', '3xl': '1.5rem' },
      keyframes: {
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'slide-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'rise': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        'pop': { '0%': { transform: 'scale(.9)', opacity: 0 }, '60%': { transform: 'scale(1.03)', opacity: 1 }, '100%': { transform: 'scale(1)' } },
        'check': { '0%': { transform: 'scale(.6)' }, '60%': { transform: 'scale(1.15)' }, '100%': { transform: 'scale(1)' } },
        'shimmer': { from: { backgroundPosition: '200% 0' }, to: { backgroundPosition: '-200% 0' } },
        'pulse-ring': { '0%': { boxShadow: '0 0 0 0 rgb(var(--accent) / .55)' }, '100%': { boxShadow: '0 0 0 10px rgb(var(--accent) / 0)' } },
        'shake': { '0%,100%': { transform: 'translateX(0)' }, '25%': { transform: 'translateX(-4px)' }, '75%': { transform: 'translateX(4px)' } },
      },
      animation: {
        'fade-in': 'fade-in .2s ease-out',
        'slide-up': 'slide-up .32s cubic-bezier(.2,.9,.25,1)',
        rise: 'rise .35s cubic-bezier(.2,.9,.25,1) both',
        pop: 'pop .45s cubic-bezier(.2,.9,.25,1)',
        check: 'check .3s ease-out',
        shimmer: 'shimmer 2.4s linear infinite',
        'pulse-ring': 'pulse-ring 1.6s ease-out infinite',
        shake: 'shake .25s ease-in-out 2',
      },
    },
  },
  plugins: [],
};
