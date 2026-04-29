function sgfCoord(v) {
  return String.fromCharCode(97 + v)
}

function exportSGF(moveHistory) {
  const header = '(;GM[1]FF[4]CA[UTF-8]SZ[9]KM[2.5]\n'
  const moves = moveHistory
    .map((e) => {
      const player = e.player === 1 ? 'B' : 'W'
      const [r, c] = e.move
      return `;${player}[${sgfCoord(c)}${sgfCoord(r)}]`
    })
    .join('\n')
  const sgf = header + moves + ')'
  const blob = new Blob([sgf], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'game.sgf'
  a.click()
  URL.revokeObjectURL(url)
}

export default function GameOverModal({ score, moveHistory, onNewGame }) {
  const totalCaptures = (moveHistory || []).length > 0
    ? `${moveHistory.length} moves`
    : 'No moves'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="bg-coffee-800 border border-coffee-600 rounded-2xl p-8 max-w-sm w-full shadow-2xl">
        <div className="text-center mb-6">
          <div
            className="text-3xl font-bold text-goldwood-300 mb-1 tracking-wide"
            style={{ fontFamily: "'Cinzel', serif" }}
          >
            {score.winner} Wins
          </div>
          <div className="text-cream-400 text-sm">{totalCaptures} played</div>
        </div>

        {/* Score breakdown */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {[
            { label: 'Black', s: score.black_score, t: score.black_territory, stones: score.black_stones },
            { label: 'White', s: score.white_score, t: score.white_territory, stones: score.white_stones },
          ].map(({ label, s, t, stones }) => (
            <div key={label} className="bg-coffee-700 border border-coffee-600 rounded-xl p-4 text-center">
              <div className="font-semibold text-cream-300 mb-1">{label}</div>
              <div className="text-3xl font-bold text-cream-100">{s}</div>
              <div className="text-xs text-cream-400 mt-1">{stones} stones · {t} territory</div>
            </div>
          ))}
        </div>

        <div className="text-center text-sm text-cream-400 mb-6">
          Komi: 2.5 · {score.white_score - score.black_score > 0
            ? `White wins by ${(score.white_score - score.black_score).toFixed(1)}`
            : `Black wins by ${(score.black_score - score.white_score).toFixed(1)}`}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onNewGame}
            className="flex-1 py-2.5 rounded-xl bg-goldwood-400 hover:bg-goldwood-300 text-coffee-950 font-semibold transition-colors"
          >
            New Game
          </button>
          <button
            onClick={() => exportSGF(moveHistory)}
            className="flex-1 py-2.5 rounded-xl bg-coffee-700 hover:bg-coffee-600 text-cream-200 border border-coffee-500 font-semibold transition-colors"
          >
            Export SGF
          </button>
        </div>
      </div>
    </div>
  )
}
