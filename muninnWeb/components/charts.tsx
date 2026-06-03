"use client";
import React from "react";

// Lightweight SVG charts: Line, Bar, Donut, Heatmap

const NAV_COLOR = "var(--primary-50)";

function LineChart({ series, w = 720, h = 240, labels, yTicks = 4 }: any) {
  const padL = 36, padB = 28, padT = 12, padR = 12;
  const cw = w - padL - padR;
  const ch = h - padT - padB;
  const all = series.flatMap(s => s.data);
  const max = Math.max(...all);
  const niceMax = Math.ceil(max / 100) * 100 || 10;
  const min = 0;
  const xs = (i, n) => padL + (i / (n - 1)) * cw;
  const ys = v => padT + ch - ((v - min) / (niceMax - min)) * ch;
  const colors = ["var(--primary-50)", "var(--whalegreen-50)", "var(--bookmark-50)"];
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{display:"block"}}>
      {/* y grid */}
      {Array.from({length: yTicks + 1}).map((_, i) => {
        const v = (niceMax / yTicks) * (yTicks - i);
        const y = padT + (ch / yTicks) * i;
        return (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={y} y2={y} stroke="var(--border-subtle)" strokeWidth="1" strokeDasharray={i === yTicks ? "" : "3 3"}/>
            <text x={padL - 6} y={y + 3} fontSize="10" fill="var(--on-surface-muted)" textAnchor="end" fontFamily="var(--font-mono)">{Math.round(v).toLocaleString()}</text>
          </g>
        );
      })}
      {/* x labels */}
      {labels && labels.map((l, i) => (
        <text key={i} x={xs(i, labels.length)} y={h - 8} fontSize="10" fill="var(--on-surface-muted)" textAnchor="middle">{l}</text>
      ))}
      {/* lines */}
      {series.map((s, si) => {
        const c = s.color || colors[si % colors.length];
        const id = "lc-" + si;
        const d = s.data.map((v, i) => `${i === 0 ? "M" : "L"}${xs(i, s.data.length).toFixed(1)},${ys(v).toFixed(1)}`).join(" ");
        const fillD = `${d} L${xs(s.data.length - 1, s.data.length).toFixed(1)},${padT + ch} L${padL},${padT + ch} Z`;
        return (
          <g key={si}>
            <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={c} stopOpacity={si === 0 ? "0.18" : "0.0"}/>
              <stop offset="100%" stopColor={c} stopOpacity="0"/>
            </linearGradient></defs>
            {si === 0 && <path d={fillD} fill={`url(#${id})`} />}
            <path d={d} fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            {s.data.map((v, i) => <circle key={i} cx={xs(i, s.data.length)} cy={ys(v)} r="2.5" fill="var(--surface)" stroke={c} strokeWidth="1.6"/>)}
          </g>
        );
      })}
    </svg>
  );
}

function BarChart({ data, labels, w = 720, h = 220, color = "var(--primary-50)" }: any) {
  const padL = 36, padB = 28, padT = 12, padR = 12;
  const cw = w - padL - padR;
  const ch = h - padT - padB;
  const max = Math.max(...data);
  const niceMax = Math.ceil(max / 100) * 100 || 10;
  const bw = (cw / data.length) * 0.6;
  const gap = (cw / data.length) * 0.4;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{display:"block"}}>
      {Array.from({length: 5}).map((_, i) => {
        const y = padT + (ch / 4) * i;
        const v = (niceMax / 4) * (4 - i);
        return (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={y} y2={y} stroke="var(--border-subtle)" strokeDasharray={i === 4 ? "" : "3 3"}/>
            <text x={padL - 6} y={y + 3} fontSize="10" fill="var(--on-surface-muted)" textAnchor="end" fontFamily="var(--font-mono)">{Math.round(v).toLocaleString()}</text>
          </g>
        );
      })}
      {data.map((v, i) => {
        const x = padL + i * (cw / data.length) + gap / 2;
        const bh = (v / niceMax) * ch;
        const y = padT + ch - bh;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={bh} fill={color} rx="4" />
            {labels && <text x={x + bw / 2} y={h - 8} fontSize="10" fill="var(--on-surface-muted)" textAnchor="middle">{labels[i]}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function Donut({ segments, size = 160, thickness = 22 }: any) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const cx = size / 2, cy = size / 2;
  let acc = 0;
  const arcs = segments.map((s, i) => {
    const start = (acc / total) * Math.PI * 2 - Math.PI / 2;
    acc += s.value;
    const end = (acc / total) * Math.PI * 2 - Math.PI / 2;
    const large = end - start > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
    return <path key={i} d={`M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`} fill="none" stroke={s.color} strokeWidth={thickness} strokeLinecap="butt" />;
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-container)" strokeWidth={thickness}/>
      {arcs}
    </svg>
  );
}

function Heatmap({ data, w, h }: any) {
  // data: 2D array of numbers
  const rows = data.length, cols = data[0].length;
  const cw = (w || 480) / cols;
  const rh = (h || 100) / rows;
  const max = Math.max(...data.flat());
  return (
    <svg width="100%" viewBox={`0 0 ${cols * cw} ${rows * rh}`} style={{display:"block"}}>
      {data.map((row, r) => row.map((v, c) => {
        const op = v / max;
        return <rect key={`${r}-${c}`} x={c * cw + 1} y={r * rh + 1} width={cw - 2} height={rh - 2} rx="2" fill="var(--primary-50)" fillOpacity={op * 0.85 + 0.05} />;
      }))}
    </svg>
  );
}

export { LineChart, BarChart, Donut, Heatmap };
