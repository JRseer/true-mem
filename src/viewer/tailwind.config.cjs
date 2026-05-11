module.exports = {
  content: ['./src/viewer/index.html', './src/viewer/ui/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        mint: {
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
        },
        accent: {
          blue: '#60a5fa',
          purple: '#a78bfa',
          amber: '#fbbf24',
          rose: '#fb7185',
        },
        dark: {
          950: '#020617',
          900: '#0f172a',
          800: '#1e293b',
        },
      },
      boxShadow: {
        soft: '0 18px 80px rgba(0, 0, 0, 0.28)',
        glow: '0 0 20px rgba(52, 211, 153, 0.15)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
