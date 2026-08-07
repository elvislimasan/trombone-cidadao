/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    './app/**/*.{js,jsx}',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    screens: {
      xs: "480px",
      sm: "640px",
      md: "768px",
      lg: "980px",
      xl: "1200px",
      "2xl": "1380px",
      "3xl": "1520px",
      "4xl": "1800px",
    },
    container: {
      center: true,
      padding: "2rem",
     screens: {
        xs: "480px",
        sm: "640px",
        md: "768px",
        lg: "980px",
        xl: "1280px",
        "2xl": "1500px",
        '3xl': '1680px',
        '4xl': '1800px',
      },
    },
    extend: {
      fontFamily: {
        sans: ["InterVar", "Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "Noto Sans", "sans-serif"],
        display: ["Bricolage Grotesque", "InterVar", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Custom Trobone Cidadão colors
        'tc-black': '#1A1A1A',
        'tc-red': '#E53935',
        'tc-yellow': '#FFD700',
        'tc-white': '#FFFFFF',
        // === Design system (canal RGB) ===
        surface: {
          base:    "rgb(var(--surface-base) / <alpha-value>)",
          raised:  "rgb(var(--surface-raised) / <alpha-value>)",
          sunken:  "rgb(var(--surface-sunken) / <alpha-value>)",
          overlay: "rgb(var(--surface-overlay) / <alpha-value>)",
        },
        content: {
          primary:   "rgb(var(--text-primary) / <alpha-value>)",
          secondary: "rgb(var(--text-secondary) / <alpha-value>)",
          tertiary:  "rgb(var(--text-tertiary) / <alpha-value>)",
          onBrand:   "rgb(var(--text-on-brand) / <alpha-value>)",
        },
        edge: {
          subtle:  "rgb(var(--border-subtle) / <alpha-value>)",
          default: "rgb(var(--border-default) / <alpha-value>)",
          strong:  "rgb(var(--border-strong) / <alpha-value>)",
        },
        brand: {
          DEFAULT:   "rgb(var(--brand) / <alpha-value>)",
          hover:     "rgb(var(--brand-hover) / <alpha-value>)",
          subtleBg:  "rgb(var(--brand-subtle-bg) / <alpha-value>)",
          subtleFg:  "rgb(var(--brand-subtle-fg) / <alpha-value>)",
        },
        danger: {
          DEFAULT:  "rgb(var(--danger) / <alpha-value>)",
          subtleBg: "rgb(var(--danger-subtle-bg) / <alpha-value>)",
          subtleFg: "rgb(var(--danger-subtle-fg) / <alpha-value>)",
        },
        status: {
          pendingBg:      "rgb(var(--status-pending-bg) / <alpha-value>)",
          pendingFg:      "rgb(var(--status-pending-fg) / <alpha-value>)",
          pendingBorder:  "rgb(var(--status-pending-border) / <alpha-value>)",
          progressBg:     "rgb(var(--status-progress-bg) / <alpha-value>)",
          progressFg:     "rgb(var(--status-progress-fg) / <alpha-value>)",
          progressBorder: "rgb(var(--status-progress-border) / <alpha-value>)",
          resolvedBg:     "rgb(var(--status-resolved-bg) / <alpha-value>)",
          resolvedFg:     "rgb(var(--status-resolved-fg) / <alpha-value>)",
          resolvedBorder: "rgb(var(--status-resolved-border) / <alpha-value>)",
          duplicateBg:     "rgb(var(--status-duplicate-bg) / <alpha-value>)",
          duplicateFg:     "rgb(var(--status-duplicate-fg) / <alpha-value>)",
          duplicateBorder: "rgb(var(--status-duplicate-border) / <alpha-value>)",
        },
        signal: {
          hotBg:    "rgb(var(--signal-hot-bg) / <alpha-value>)",
          hotFg:    "rgb(var(--signal-hot-fg) / <alpha-value>)",
          risingBg: "rgb(var(--signal-rising-bg) / <alpha-value>)",
          risingFg: "rgb(var(--signal-rising-fg) / <alpha-value>)",
          freshBg:  "rgb(var(--signal-fresh-bg) / <alpha-value>)",
          freshFg:  "rgb(var(--signal-fresh-fg) / <alpha-value>)",
        },
        accentHighlight: "rgb(var(--accent-highlight) / <alpha-value>)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        'elevation-1': 'var(--elevation-1)',
        'elevation-2': 'var(--elevation-2)',
        'elevation-3': 'var(--elevation-3)',
      },
      fontSize: {
        '2xs': 'var(--text-2xs)',
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
