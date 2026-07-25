/* Cero Agotados — Tailwind theme compartido (Tailwind Play CDN) */
tailwind.config = {
  theme: {
    extend: {
      colors: {
        // Verde salud (marca) + teal confianza + ambar (atencion)
        primary: {
          DEFAULT: '#059669',
          50:  '#ECFDF5',
          100: '#D1FAE5',
          200: '#A7F3D0',
          300: '#6EE7B7',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
          800: '#065F46',
          900: '#064E3B',
        },
        teal: {
          DEFAULT: '#0891B2',
          50:  '#ECFEFF',
          100: '#CFFAFE',
          500: '#06B6D4',
          600: '#0891B2',
          700: '#0E7490',
        },
        amber: { DEFAULT: '#F59E0B', 50: '#FFFBEB', 100: '#FEF3C7', 600: '#D97706' },
        danger:  { DEFAULT: '#DC2626', 50: '#FEF2F2', 100: '#FEE2E2' },
        ink:     '#0F172A', // texto principal
        soft:    '#334155', // texto medio
        muted:   '#64748B', // texto secundario
        line:    '#E6EBF1', // bordes
        canvas:  '#F4F7FA', // fondo app
        surface: '#FFFFFF',
      },
      fontFamily: {
        display: ['Figtree', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '18px', xl2: '22px', input: '12px', pill: '999px' },
      boxShadow: {
        card: '0 1px 2px rgba(15,23,42,.04), 0 6px 20px rgba(15,23,42,.06)',
        pop:  '0 12px 34px rgba(15,23,42,.14)',
        nav:  '0 -4px 20px rgba(15,23,42,.06)',
        btn:  '0 6px 16px rgba(5,150,105,.28)',
      },
    },
  },
};
