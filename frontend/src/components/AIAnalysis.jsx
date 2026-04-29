export default function AIAnalysis({ aiStats, thinking }) {
  return (
    <div className="flex flex-col gap-3">
      <h2
        className="text-xs text-cream-400 uppercase tracking-widest"
        style={{ fontFamily: "'Cinzel', serif" }}
      >
        AI Analysis
      </h2>

      {thinking && !aiStats && (
        <div className="text-goldwood-300 text-sm animate-pulse">Searching…</div>
      )}

      {aiStats && (
        <>
          {/* Simulations */}
          <div className="bg-coffee-700 rounded-lg p-3 border border-coffee-600">
            <div className="text-xs text-cream-400 mb-1" style={{ fontFamily: "'Cinzel', serif" }}>Simulations</div>
            {aiStats.opening_book ? (
              <div className="text-sm font-semibold text-goldwood-400">Opening book</div>
            ) : (
              <>
                <div className="text-xl font-bold text-cream-100">{aiStats.simulations.toLocaleString()}</div>
                <div className="text-xs text-cream-400">{aiStats.time}s · {Math.round(aiStats.simulations / Math.max(aiStats.time, 0.1)).toLocaleString()} /s</div>
              </>
            )}
          </div>

          {/* Win probability bar */}
          <div className="bg-coffee-700 rounded-lg p-3 border border-coffee-600">
            <div className="text-xs text-cream-400 mb-2" style={{ fontFamily: "'Cinzel', serif" }}>Win Probability</div>
            <div className="relative h-5 rounded-full overflow-hidden bg-coffee-600">
              <div
                className="absolute inset-y-0 left-0 rounded-l-full transition-all duration-500"
                style={{
                  width: `${Math.round(aiStats.win_probability * 100)}%`,
                  background: 'linear-gradient(to right, #1a1a1a, #444)',
                }}
              />
              <div
                className="absolute inset-y-0 right-0 rounded-r-full"
                style={{
                  width: `${Math.round((1 - aiStats.win_probability) * 100)}%`,
                  background: 'linear-gradient(to left, #f0e8d8, #c0a888)',
                }}
              />
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span className="text-cream-400">B {Math.round(aiStats.win_probability * 100)}%</span>
              <span className="text-cream-400">W {Math.round((1 - aiStats.win_probability) * 100)}%</span>
            </div>
          </div>

          {/* Top moves */}
          {aiStats.top_moves?.length > 0 && (
            <div className="bg-coffee-700 rounded-lg p-3 border border-coffee-600">
              <div className="text-xs text-cream-400 mb-2" style={{ fontFamily: "'Cinzel', serif" }}>Top Candidate Moves</div>
              <div className="flex flex-col gap-2">
                {aiStats.top_moves.map((m, i) => {
                  const [r, c] = m.move
                  const col = String.fromCharCode(65 + c)
                  const row = 9 - r
                  const wr = Math.round(m.winrate * 100)
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-goldwood-500 text-coffee-950 text-xs font-bold flex items-center justify-center flex-shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-cream-200 font-mono text-sm w-10">{col}{row}</span>
                      <div className="flex-1 bg-coffee-600 rounded-full h-1.5">
                        <div
                          className="bg-goldwood-400 h-1.5 rounded-full"
                          style={{ width: `${wr}%` }}
                        />
                      </div>
                      <span className="text-cream-300 text-xs w-10 text-right">{wr}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {!aiStats && !thinking && (
        <div className="text-cream-500 text-sm">Play a move to see AI analysis.</div>
      )}
    </div>
  )
}
