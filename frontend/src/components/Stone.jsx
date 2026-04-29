// Standalone stone for use outside the SVG board (e.g. captured count icons)
export default function Stone({ color, size = 16, style = {} }) {
  const bg = color === 1
    ? 'radial-gradient(circle at 35% 30%, #333 0%, #111 100%)'
    : 'radial-gradient(circle at 35% 30%, #FAFAFA 0%, #E0DDD8 100%)'
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        border: color === 2 ? '1px solid #C8C4BC' : 'none',
        boxShadow: color === 1 ? '1px 2px 3px rgba(0,0,0,0.5)' : '1px 2px 2px rgba(0,0,0,0.15)',
        flexShrink: 0,
        ...style,
      }}
    />
  )
}
