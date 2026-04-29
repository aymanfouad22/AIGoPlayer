import { useEffect, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

function moveLabel(entry) {
  const [r, c] = entry.move
  const col = String.fromCharCode(65 + c)
  const row = 9 - r
  const player = entry.player === 1 ? 'B' : 'W'
  return `${entry.move_number}. ${player}(${col}${row})`
}

export default function MoveHistory({ moveHistory = [], winRateHistory = [] }) {
  const listRef = useRef(null)

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [moveHistory.length])

  const chartData = winRateHistory.map((d) => ({
    move: d.move,
    winProb: Math.round(d.winProb * 100),
  }))

  return (
    <div className="flex flex-col gap-3">
      <h2
        className="text-xs text-cream-400 uppercase tracking-widest"
        style={{ fontFamily: "'Cinzel', serif" }}
      >
        Move History
      </h2>

      {/* Win rate sparkline */}
      {chartData.length > 1 && (
        <div className="bg-coffee-700 rounded-lg p-3 border border-coffee-600">
          <div className="text-xs text-cream-400 mb-2" style={{ fontFamily: "'Cinzel', serif" }}>Win Rate — Black %</div>
          <ResponsiveContainer width="100%" height={70}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
              <XAxis dataKey="move" tick={{ fontSize: 10, fill: '#8C6040' }} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#8C6040' }} />
              <ReferenceLine y={50} stroke="#3F2010" strokeDasharray="3 3" />
              <Tooltip
                contentStyle={{ background: '#1E0E08', border: '1px solid #3F2010', borderRadius: 4, fontSize: 11 }}
                labelStyle={{ color: '#C8A070' }}
                itemStyle={{ color: '#DEB87A' }}
                formatter={(v) => [`${v}%`, 'Win%']}
              />
              <Line
                type="monotone" dataKey="winProb"
                stroke="#C8964A" strokeWidth={2} dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Move list */}
      <div
        ref={listRef}
        className="bg-coffee-700 rounded-lg p-3 overflow-y-auto border border-coffee-600"
        style={{ maxHeight: 200 }}
      >
        {moveHistory.length === 0 ? (
          <div className="text-cream-500 text-sm">No moves yet.</div>
        ) : (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {moveHistory.map((entry) => (
              <span
                key={entry.move_number}
                className={`text-sm font-mono whitespace-nowrap ${entry.player === 1 ? 'text-cream-200' : 'text-cream-400'}`}
              >
                {moveLabel(entry)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
