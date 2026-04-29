import { useEffect, useRef } from 'react'
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J']

function moveText(entry) {
  const [r, c] = entry.move
  const player = entry.player === 1 ? 'B' : 'W'
  return `${entry.move_number}. ${player} ${COLS[c] ?? '?'}${9 - r}`
}

export default function MoveHistory({ moveHistory = [], winRateHistory = [] }) {
  const listRef = useRef(null)

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [moveHistory.length])

  const chartData = winRateHistory.map((d) => ({
    move: d.move,
    winProb: Math.round(d.winProb * 100),
  }))

  return (
    <section className="history-stack">
      <div className="panel-card">
        <div className="panel-card-header">Win Rate</div>
        <div className="chart-wrap">
          {chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={100}>
              <AreaChart data={chartData} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="winArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(26,26,26,0.35)" />
                    <stop offset="100%" stopColor="rgba(242,240,236,0.08)" />
                  </linearGradient>
                </defs>
                <XAxis dataKey="move" tick={{ fontSize: 10, fill: '#6B5F52', fontFamily: 'JetBrains Mono' }} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#6B5F52', fontFamily: 'JetBrains Mono' }} />
                <ReferenceLine y={50} stroke="#3A322A" strokeDasharray="3 3" />
                <Tooltip
                  contentStyle={{ background: '#241E18', border: '1px solid #3A322A', borderRadius: 6, fontSize: 11 }}
                  labelStyle={{ color: '#9B8E7E' }}
                  itemStyle={{ color: '#C97B3A' }}
                  formatter={(v) => [`${v}%`, 'Black']}
                />
                <Area type="monotone" dataKey="winProb" stroke="#C97B3A" strokeWidth={2} fill="url(#winArea)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-chart mono">50%</div>
          )}
        </div>
      </div>

      <div className="panel-card move-list-card">
        <div className="panel-card-header">Moves</div>
        <div ref={listRef} className="move-list">
          {moveHistory.length === 0 ? (
            <div className="empty-panel-text">No moves yet.</div>
          ) : (
            moveHistory.map((entry) => (
              <button
                type="button"
                key={entry.move_number}
                className={`move-pill mono ${entry.player === 1 ? 'black' : 'white'}`}
                title="Move review is available with the arrow controls below the board."
              >
                {moveText(entry)}
              </button>
            ))
          )}
        </div>
      </div>
    </section>
  )
}
