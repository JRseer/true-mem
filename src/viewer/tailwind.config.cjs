module.exports = {
  content: ['./src/viewer/index.html', './src/viewer/ui/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        mint: {
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
        },
      },
      boxShadow: {
        soft: '0 18px 80px rgba(0, 0, 0, 0.28)',
      },
    },
  },
  plugins: [],
};
