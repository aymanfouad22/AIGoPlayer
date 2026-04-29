const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J']

function coord(move) {
  const [r, c] = move
  return `${COLS[c] ?? '?'}${9 - r}`
}

export default function AIAnalysis({ aiStats, thinking }) {
  const winProb = aiStats?.win_probability ?? 0.5
  const blackPct = Math.round(winProb * 100)
  const whitePct = 100 - blackPct
  const sims = aiStats?.simulations ?? 0
  const elapsed = aiStats?.time ?? 0
  const simsPerSec = Math.round(sims / Math.max(elapsed, 0.1))

  return (
    <section className="analysis-stack">
      <div className="panel-card">
        <div className="panel-card-header">AI Analysis</div>
        {aiStats?.opening_book ? (
          <div className="analysis-main">Opening book</div>
        ) : (
          <>
            <div className="analysis-main mono">{sims.toLocaleString()} simulations</div>
            <div className="thin-progress">
              <span style={{ width: thinking ? '72%' : '100%' }} />
            </div>
            <div className="analysis-sub mono">{simsPerSec.toLocaleString()} sims/sec</div>
          </>
        )}
        {thinking && <div className="thinking-caption soft-pulse">Thinking...</div>}
      </div>

      <div className="panel-card">
        <div className="panel-card-header">Win Probability</div>
        <div className="win-prob-row">
          <span className={blackPct >= 60 ? 'hot' : ''}>B {blackPct}%</span>
          <div className="win-prob-bar">
            <div className="win-black" style={{ width: `${blackPct}%` }} />
            <div className="win-white" style={{ width: `${whitePct}%` }} />
          </div>
          <span className={whitePct >= 60 ? 'hot' : ''}>{whitePct}% W</span>
        </div>
      </div>

      <div className="panel-card">
        <div className="panel-card-header">Top Moves</div>
        {aiStats?.top_moves?.length ? (
          <div className="top-moves">
            {aiStats.top_moves.slice(0, 3).map((m, i) => {
              const wr = Math.round((m.winrate ?? 0) * 100)
              return (
                <div className="top-move-row" key={`${i}-${coord(m.move)}`}>
                  <span className="candidate-rank">{i + 1}</span>
                  <span className="candidate-coord mono">{coord(m.move)}</span>
                  <span className="candidate-visits mono">{(m.visits ?? 0).toLocaleString()} visits</span>
                  <span className={`candidate-rate mono ${wr > 60 ? 'good' : wr < 40 ? 'bad' : ''}`}>{wr}%</span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="empty-panel-text">Play a move to see candidates.</div>
        )}
      </div>
    </section>
  )
}
