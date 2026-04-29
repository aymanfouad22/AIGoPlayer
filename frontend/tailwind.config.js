/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Cinzel', 'Georgia', 'serif'],
        sans:    ['EB Garamond', 'Georgia', 'serif'],
        mono:    ['Courier New', 'monospace'],
      },
      colors: {
        board: '#DEB887',
        // Backgrounds — same hue/saturation family as the board, just darker
        // Board surface sits at L:57–74%. UI goes L:17→46% so board still pops.
        coffee: {
          950: '#2A1A08',   // very dark (text on gold buttons)
          900: '#3D2510',   // body background — dark warm frame
          800: '#8A6030',   // sidebars — medium-dark board wood (L≈37%)
          700: '#A87840',   // card backgrounds — warm wood (L≈46%)
          600: '#C8A060',   // borders — board's own dark gradient stop (L≈57%)
          500: '#D4AC6C',   // hover
          400: '#DEB887',   // active area fill — the board face color itself
        },
        // Text — bright warm cream down to muted tan
        cream: {
          50:  '#FEFAF2',
          100: '#FDF5E8',   // primary text — bright warm white
          200: '#F0DDB8',   // secondary text
          300: '#DEB887',   // board face color — used for labels
          400: '#C09868',   // muted
          500: '#9B7848',   // very muted
        },
        // Highlights — the board's own three gradient stops, used for active states
        goldwood: {
          100: '#F8F0D8',
          200: '#F0D8A8',
          300: '#E8C87A',   // board's lightest color (L≈74%) — selected/active
          400: '#DEB887',   // board main face color (L≈70%)
          500: '#C8A060',   // board's dark gradient stop (L≈57%)
          600: '#8B6914',   // coordinate label color on board
          700: '#6B4C1E',   // grid line color on board
        },
      },
    },
  },
  plugins: [],
}
