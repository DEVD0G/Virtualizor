interface Props {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  max?: number;
}

export default function Sparkline({ data, width = 80, height = 28, color = '#6366f1', max }: Props) {
  if (data.length < 2) {
    return <svg width={width} height={height} />;
  }
  const peak = max ?? Math.max(...data, 1);
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - (v / peak) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" points={pts} />
    </svg>
  );
}
