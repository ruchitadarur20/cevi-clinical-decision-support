import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem' },
    extend: {
      fontFamily: { sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'] },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        teal: { DEFAULT: 'hsl(var(--teal))', foreground: 'hsl(var(--teal-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        warning: 'hsl(var(--warning))',
        success: 'hsl(var(--success))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        sidebar: { DEFAULT: 'hsl(var(--sidebar))', foreground: 'hsl(var(--sidebar-foreground))', muted: 'hsl(var(--sidebar-muted))', border: 'hsl(var(--sidebar-border))', active: 'hsl(var(--sidebar-active))' },
      },
      borderRadius: { lg: '0.625rem', md: '0.5rem', sm: '0.375rem' },
      boxShadow: {
        card: '0 1px 2px 0 hsl(222 47% 11% / 0.04), 0 1px 3px 0 hsl(222 47% 11% / 0.06)',
        pop: '0 10px 30px -8px hsl(222 47% 11% / 0.25)',
      },
    },
  },
  plugins: [],
} satisfies Config;
