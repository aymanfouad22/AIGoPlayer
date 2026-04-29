import Stone from './Stone'

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
  const blob = new Blob([header + moves + ')'], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'game.sgf'
  a.click()
  URL.revokeObjectURL(url)
}

export default function GameOverModal({ score, moveHistory, onNewGame }) {
  const blackWins = score.black_score > score.white_score
  const winner = blackWins ? 'Black' : 'White'
  const margin = Math.abs(score.black_score - score.white_score).toFixed(1)

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="winner-line">
          <Stone color={blackWins ? 1 : 2} size={20} />
          <span>{winner} Wins</span>
        </div>
        <div className="modal-score mono">{score.black_score} - {score.white_score}</div>

        <div className="breakdown-table">
          <div>
            <strong>Black</strong>
            <span>{score.black_stones} stones</span>
            <span>{score.black_territory} terr</span>
            <span>0 komi</span>
          </div>
          <div>
            <strong>White</strong>
            <span>{score.white_stones} stones</span>
            <span>{score.white_territory} terr</span>
            <span>+2.5 komi</span>
          </div>
        </div>

        <div className="modal-stats">
          <span>Total moves: {moveHistory.length}</span>
          <span>{winner} wins by {margin}</span>
        </div>

        <div className="modal-actions">
          <button className="btn-action" onClick={onNewGame}>New Game</button>
          <button className="btn-action" onClick={() => exportSGF(moveHistory)}>Export SGF</button>
        </div>
      </div>
    </div>
  )
}
