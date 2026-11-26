import { useId, type CSSProperties } from 'react';
import { itemById, stageOf, type Mood } from './model';

/**
 * Kettli – a little kettlebell creature. Signature features (for recognition):
 *  - the kettlebell handle arching over its head
 *  - its level stamped on the belly like a kettlebell's weight ("12 kg")
 *  - big round eyes, rosy cheeks, flat kettlebell base
 * It grows with its stage (baby → junior → athlete → legend) and wears the equipped skin,
 * accessory and background.
 */
export function Kettli({
  skin = 'skin-classic',
  accessory = 'acc-none',
  background = 'bg-none',
  level = 1,
  mood = 'happy',
  size = 220,
  animated = true,
  jumping = false,
  className,
  style,
}: {
  skin?: string;
  accessory?: string;
  background?: string;
  level?: number;
  mood?: Mood;
  size?: number;
  animated?: boolean;
  jumping?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const uid = useId().replace(/:/g, '');
  const [light, dark, belly] = itemById(skin)?.colors ?? ['#D8FF4A', '#8FD11A', '#F4FFD0'];
  const stage = stageOf(level);
  const scale = stage === 'baby' ? 0.82 : stage === 'junior' ? 0.92 : 1;
  const arms = stage !== 'baby';
  const buff = stage === 'athlete' || stage === 'legend';
  const ink = '#1B1C20';

  return (
    <svg viewBox="0 0 200 220" width={size} height={(size * 220) / 200} className={className} style={style} role="img" aria-label={`Kettli, Level ${level}`}>
      <defs>
        <linearGradient id={`b${uid}`} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
        <radialGradient id={`aura${uid}`}>
          <stop offset="0.55" stopColor="#FFE16A" stopOpacity="0.55" />
          <stop offset="1" stopColor="#FFE16A" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`clip${uid}`}>
          <rect width="200" height="220" rx="28" />
        </clipPath>
      </defs>

      <Background id={background} uid={uid} />

      {/* ground shadow */}
      <ellipse cx="100" cy="199" rx={46 * scale} ry="7" fill="#000" opacity="0.14" className={animated ? 'kettli-shadow' : undefined} />

      <g className={animated ? (jumping ? 'kettli-jump' : mood === 'ecstatic' ? 'kettli-bounce' : 'kettli-idle') : undefined} style={{ transformOrigin: '100px 198px' }}>
        <g transform={`translate(100 198) scale(${scale}) translate(-100 -198)`}>
          {stage === 'legend' && (
            <>
              <circle cx="100" cy="120" r="98" fill={`url(#aura${uid})`} className={animated ? 'kettli-glow' : undefined} />
              <Sparkle x={34} y={64} s={1} />
              <Sparkle x={168} y={84} s={0.8} />
              <Sparkle x={156} y={176} s={0.6} />
            </>
          )}

          {/* handle – the kettlebell arch */}
          <path d="M66 104 C58 34, 142 34, 134 104" fill="none" stroke={dark} strokeWidth="17" strokeLinecap="round" />
          <path d="M66 104 C58 34, 142 34, 134 104" fill="none" stroke={light} strokeOpacity="0.45" strokeWidth="5" strokeLinecap="round" transform="translate(-2 -3)" />

          {accessory === 'acc-headphones' && (
            <path d="M44 120 C40 22, 160 22, 156 120" fill="none" stroke="#2A2C33" strokeWidth="7" strokeLinecap="round" />
          )}

          {/* arms */}
          {arms && (
            <>
              <ellipse cx={buff ? 39 : 42} cy="142" rx={buff ? 12 : 9} ry={buff ? 17 : 14} fill={dark} transform={`rotate(${buff ? 28 : 18} ${buff ? 39 : 42} 142)`} />
              <ellipse cx={buff ? 161 : 158} cy="142" rx={buff ? 12 : 9} ry={buff ? 17 : 14} fill={dark} transform={`rotate(${buff ? -28 : -18} ${buff ? 161 : 158} 142)`} />
              {buff && (
                <>
                  <circle cx="33" cy="131" r="7" fill={light} opacity="0.55" />
                  <circle cx="167" cy="131" r="7" fill={light} opacity="0.55" />
                </>
              )}
            </>
          )}

          {/* base + body */}
          <ellipse cx="100" cy="190" rx="38" ry="8" fill={dark} />
          <circle cx="100" cy="132" r="62" fill={`url(#b${uid})`} />
          <ellipse cx="78" cy="98" rx="20" ry="12" fill="#fff" opacity="0.28" transform="rotate(-28 78 98)" />

          {/* belly: level stamped like a kettlebell weight */}
          <rect x="72" y="146" width="56" height="26" rx="13" fill={belly} opacity="0.92" />
          <text x="100" y="164.5" textAnchor="middle" fontSize="15" fontWeight="800" fill={dark} style={{ fontFamily: 'system-ui, sans-serif', letterSpacing: '-0.02em' }}>
            {level} kg
          </text>

          {/* cheeks */}
          <ellipse cx="70" cy="130" rx="9" ry="5" fill="#FF6FA0" opacity="0.4" />
          <ellipse cx="130" cy="130" rx="9" ry="5" fill="#FF6FA0" opacity="0.4" />

          <Face mood={mood} ink={ink} animated={animated} />

          {accessory === 'acc-headband' && (
            <g>
              <path d="M44 106 A62 62 0 0 1 156 106" fill="none" stroke="#E5432B" strokeWidth="11" />
              <path d="M44 106 A62 62 0 0 1 156 106" fill="none" stroke="#fff" strokeWidth="2" opacity="0.8" />
              <path d="M154 104 l14 -6 l-3 13 z" fill="#E5432B" />
              <path d="M155 108 l12 6 l-11 6 z" fill="#C7311C" />
            </g>
          )}
          {accessory === 'acc-cap' && (
            <g>
              <path d="M52 100 C56 66, 112 60, 126 82 L130 96 Z" fill="#2C86E0" />
              <path d="M120 92 C140 88, 160 92, 168 100 C150 104, 132 102, 120 100 Z" fill="#1F64AD" />
              <circle cx="90" cy="70" r="3.5" fill="#1F64AD" />
            </g>
          )}
          {accessory === 'acc-shades' && (
            <g>
              <rect x="63" y="104" width="32" height="20" rx="8" fill={ink} />
              <rect x="105" y="104" width="32" height="20" rx="8" fill={ink} />
              <path d="M95 110 h10" stroke={ink} strokeWidth="4" />
              <path d="M69 108 l8 -1" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
              <path d="M111 108 l8 -1" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
            </g>
          )}
          {accessory === 'acc-headphones' && (
            <g>
              <rect x="34" y="104" width="18" height="32" rx="8" fill="#2A2C33" />
              <rect x="148" y="104" width="18" height="32" rx="8" fill="#2A2C33" />
              <rect x="38" y="110" width="6" height="20" rx="3" fill="#FF5C9A" />
              <rect x="156" y="110" width="6" height="20" rx="3" fill="#FF5C9A" />
            </g>
          )}
          {accessory === 'acc-medal' && (
            <g>
              <path d="M126 96 L140 140 L148 138 L136 94 Z" fill="#2C86E0" />
              <circle cx="145" cy="148" r="11" fill="#F7C63A" stroke="#D99A12" strokeWidth="2.5" />
              <path d="M145 141 l2.2 4.6 5 .6 -3.7 3.4 1 5 -4.5 -2.5 -4.5 2.5 1 -5 -3.7 -3.4 5 -.6z" fill="#fff" opacity="0.9" />
            </g>
          )}
          {accessory === 'acc-crown' && (
            <g>
              <path d="M78 46 L84 22 L94 36 L100 16 L106 36 L116 22 L122 46 Z" fill="#F7C63A" stroke="#D99A12" strokeWidth="2.5" strokeLinejoin="round" />
              <circle cx="100" cy="38" r="3.5" fill="#E5432B" />
            </g>
          )}

          {mood === 'sleepy' && animated && (
            <g className="kettli-zzz" fill={ink} opacity="0.55" style={{ fontFamily: 'system-ui, sans-serif', fontWeight: 800 }}>
              <text x="146" y="70" fontSize="16">z</text>
              <text x="158" y="56" fontSize="12">z</text>
            </g>
          )}
          {mood === 'ecstatic' && (
            <>
              <Sparkle x={40} y={80} s={0.7} />
              <Sparkle x={164} y={70} s={0.9} />
            </>
          )}
        </g>
      </g>
    </svg>
  );
}

function Face({ mood, ink, animated }: { mood: Mood; ink: string; animated: boolean }) {
  // eyes
  const roundEyes = (
    <g className={animated ? 'kettli-blink' : undefined} style={{ transformOrigin: '100px 114px' }}>
      {[80, 120].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy="114" rx="11" ry="13" fill="#fff" />
          <circle cx={x + 1} cy="116" r="7" fill={ink} />
          <circle cx={x + 3.5} cy="112.5" r="2.6" fill="#fff" />
        </g>
      ))}
    </g>
  );
  let eyes = roundEyes;
  let mouth = <path d="M90 134 Q100 143 110 134" fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />;
  let brows = null;
  if (mood === 'ecstatic') {
    eyes = (
      <g fill="none" stroke={ink} strokeWidth="4.5" strokeLinecap="round">
        <path d="M70 117 Q80 104 90 117" />
        <path d="M110 117 Q120 104 130 117" />
      </g>
    );
    mouth = (
      <g>
        <path d="M86 131 Q100 152 114 131 Z" fill={ink} />
        <path d="M93 140 Q100 147 107 140" fill="#FF6F8E" />
      </g>
    );
  } else if (mood === 'neutral') {
    mouth = <path d="M92 136 Q100 139 108 136" fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />;
  } else if (mood === 'sleepy') {
    eyes = (
      <g fill="none" stroke={ink} strokeWidth="4" strokeLinecap="round">
        <path d="M71 115 Q80 121 89 115" />
        <path d="M111 115 Q120 121 129 115" />
      </g>
    );
    mouth = <ellipse cx="100" cy="137" rx="4.5" ry="5" fill={ink} opacity="0.85" />;
  } else if (mood === 'sad') {
    brows = (
      <g stroke={ink} strokeWidth="3.5" strokeLinecap="round">
        <path d="M70 105 L87 98" />
        <path d="M130 105 L113 98" />
      </g>
    );
    mouth = <path d="M90 140 Q100 131 110 140" fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />;
  }
  return (
    <g>
      {brows}
      {eyes}
      {mouth}
    </g>
  );
}

function Sparkle({ x, y, s }: { x: number; y: number; s: number }) {
  return <path className="kettli-sparkle" d={`M${x} ${y - 10 * s} L${x + 3 * s} ${y - 3 * s} L${x + 10 * s} ${y} L${x + 3 * s} ${y + 3 * s} L${x} ${y + 10 * s} L${x - 3 * s} ${y + 3 * s} L${x - 10 * s} ${y} L${x - 3 * s} ${y - 3 * s} Z`} fill="#FFD54A" />;
}

function Background({ id, uid }: { id: string; uid: string }) {
  if (id === 'bg-none') return null;
  const clip = `url(#clip${uid})`;
  if (id === 'bg-gym')
    return (
      <g clipPath={clip}>
        <rect width="200" height="220" fill="#E9E4DC" />
        <rect y="168" width="200" height="52" fill="#B9AD9B" />
        <rect y="166" width="200" height="4" fill="#9C8F7C" />
        {[24, 176].map((x) => (
          <g key={x} opacity="0.55">
            <rect x={x - 3} y="60" width="6" height="108" fill="#8A8F99" />
            <circle cx={x} cy="96" r="16" fill="#3B3E46" />
            <circle cx={x} cy="96" r="4" fill="#8A8F99" />
            <circle cx={x} cy="134" r="13" fill="#3B3E46" />
          </g>
        ))}
      </g>
    );
  if (id === 'bg-beach')
    return (
      <g clipPath={clip}>
        <defs>
          <linearGradient id={`sky${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7DD3FC" />
            <stop offset="1" stopColor="#E0F7FF" />
          </linearGradient>
        </defs>
        <rect width="200" height="220" fill={`url(#sky${uid})`} />
        <circle cx="160" cy="44" r="20" fill="#FFD54A" />
        <path d="M0 150 Q50 138 100 150 T200 150 V172 H0 Z" fill="#38BDF8" opacity="0.6" />
        <rect y="168" width="200" height="52" fill="#F5DDA4" />
      </g>
    );
  if (id === 'bg-sunset')
    return (
      <g clipPath={clip}>
        <defs>
          <linearGradient id={`sun${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7C3AED" />
            <stop offset="0.55" stopColor="#F472B6" />
            <stop offset="1" stopColor="#FDBA74" />
          </linearGradient>
        </defs>
        <rect width="200" height="220" fill={`url(#sun${uid})`} />
        <circle cx="100" cy="168" r="44" fill="#FDE68A" opacity="0.85" />
        <rect y="168" width="200" height="52" fill="#4C1D95" opacity="0.55" />
      </g>
    );
  if (id === 'bg-space')
    return (
      <g clipPath={clip}>
        <rect width="200" height="220" fill="#12133A" />
        {[
          [20, 30],
          [60, 18],
          [150, 26],
          [178, 70],
          [30, 92],
          [172, 140],
          [14, 160],
          [120, 12],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i % 3 ? 1.4 : 2.2} fill="#fff" className="kettli-sparkle" style={{ animationDelay: `${i * 0.4}s` }} />
        ))}
        <circle cx="166" cy="40" r="14" fill="#F472B6" />
        <ellipse cx="166" cy="40" rx="24" ry="5" fill="none" stroke="#FDE68A" strokeWidth="2.5" transform="rotate(-18 166 40)" />
        <ellipse cx="100" cy="214" rx="140" ry="34" fill="#2E2F7A" />
      </g>
    );
  return null;
}
