/**
 * Signature illustration: one stem, nine leaves — one per grade,
 * from 1st primary (bottom) to 3rd intermediate (top).
 */
const LEAVES = [
  { g: "الأول", y: 470 }, { g: "الثاني", y: 425 }, { g: "الثالث", y: 380 },
  { g: "الرابع", y: 335 }, { g: "الخامس", y: 290 }, { g: "السادس", y: 245 },
  { g: "أول متوسط", y: 195 }, { g: "ثاني متوسط", y: 150 }, { g: "ثالث متوسط", y: 105 },
];

export function Seedling() {
  const stemLen = 470;
  return (
    <svg viewBox="0 0 360 560" direction="ltr" className="h-auto w-full max-w-[290px] md:max-w-[380px]" role="img"
      aria-label="نبتة بتسع أوراق، كل ورقة صف دراسي من الأول الابتدائي إلى الثالث المتوسط">
      {/* soil */}
      <ellipse cx="180" cy="530" rx="120" ry="16" fill="#efeafd" />
      <path d="M90 528c30-10 150-10 180 0" stroke="#dcd2fa" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* stage divider: primary vs intermediate */}
      <line x1="30" y1="220" x2="330" y2="220" stroke="#dcd2fa" strokeDasharray="4 7" strokeWidth="1.5" />
      <text x="30" y="238" textAnchor="start" fontSize="13" fill="#6b6488" fontFamily="var(--font-sans)">ابتدائي ↓</text>
      <text x="30" y="210" textAnchor="start" fontSize="13" fill="#6b6488" fontFamily="var(--font-sans)">متوسط ↑</text>

      {/* stem */}
      <path
        className="stem-path"
        style={{ ["--len" as string]: stemLen }}
        d="M180 528 C 172 450, 190 400, 180 330 S 172 200, 182 80"
        stroke="#5b45b0" strokeWidth="5" strokeLinecap="round" fill="none"
      />

      {LEAVES.map((l, i) => {
        const left = i % 2 === 0;
        const intermediate = i >= 6;
        const fill = intermediate ? "#8ed1f2" : i % 2 ? "#a994ee" : "#c2b3f4";
        const size = 34 + i * 2.2;
        const x = left ? 178 : 184;
        const d = left
          ? `M${x} ${l.y} c ${-size * 0.35} ${-size * 0.75}, ${-size * 1.25} ${-size * 0.85}, ${-size * 1.55} ${-size * 0.35} c ${size * 0.45} ${size * 0.5}, ${size * 1.15} ${size * 0.62}, ${size * 1.55} ${size * 0.35} Z`
          : `M${x} ${l.y} c ${size * 0.35} ${-size * 0.75}, ${size * 1.25} ${-size * 0.85}, ${size * 1.55} ${-size * 0.35} c ${-size * 0.45} ${size * 0.5}, ${-size * 1.15} ${size * 0.62}, ${-size * 1.55} ${size * 0.35} Z`;
        const delay = `${0.9 + i * 0.13}s`;
        return (
          <g key={l.g}>
            <path d={d} fill={fill} className="leaf"
              style={{ animationDelay: delay, transformOrigin: left ? "right bottom" : "left bottom" }} />
            <text
              x={left ? x - size * 1.7 : x + size * 1.7}
              y={l.y - size * 0.3}
              textAnchor={left ? "end" : "start"}
              fontSize="14" fill="#2a2350" fontFamily="var(--font-sans)"
              className="leaf-label" style={{ animationDelay: `${1.1 + i * 0.13}s` }}
            >
              {l.g}
            </text>
          </g>
        );
      })}
      {/* bud */}
      <circle cx="182" cy="76" r="9" fill="#5b45b0" className="leaf" style={{ animationDelay: "2.2s", transformOrigin: "center" }} />
    </svg>
  );
}
