// Standalone stone for use outside the SVG board (e.g. captured count icons)
export default function Stone({ color, size = 16, style = {} }) {
  const bg = color === 1
    ? 'radial-gradient(circle at 35% 30%, #777, #111)'
    : 'radial-gradient(circle at 35% 30%, #fff, #ccc)'
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        border: color === 2 ? '1px solid #444' : 'none',
        boxShadow: '1px 2px 3px rgba(0,0,0,0.5)',
        flexShrink: 0,
        ...style,
      }}
    />
  )
}
