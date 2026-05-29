import { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';

const NAMED_COLORS = [
  { name: 'Red', hex: '#ef4444' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Yellow', hex: '#eab308' },
  { name: 'Lime', hex: '#84cc16' },
  { name: 'Green', hex: '#22c55e' },
  { name: 'Teal', hex: '#14b8a6' },
  { name: 'Cyan', hex: '#06b6d4' },
  { name: 'Sky blue', hex: '#0ea5e9' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Indigo', hex: '#6366f1' },
  { name: 'Violet', hex: '#8b5cf6' },
  { name: 'Purple', hex: '#a855f7' },
  { name: 'Pink', hex: '#ec4899' },
  { name: 'Rose', hex: '#f43f5e' },
  { name: 'White', hex: '#ffffff' },
];

function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}

function normalizeHex(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^#([0-9a-f]{6})$/i.test(s)) return s.toLowerCase();
  const short = s.match(/^#([0-9a-f]{3})$/i);
  if (short) {
    const c = short[1].toLowerCase();
    return `#${c[0]}${c[0]}${c[1]}${c[1]}${c[2]}${c[2]}`;
  }
  return null;
}

function rgbToHex(r, g, b) {
  const toHex = (n) => Math.round(n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex) {
  const safe = normalizeHex(hex);
  if (!safe) return null;
  return {
    r: Number.parseInt(safe.slice(1, 3), 16),
    g: Number.parseInt(safe.slice(3, 5), 16),
    b: Number.parseInt(safe.slice(5, 7), 16),
  };
}

function hslToRgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp01(s / 100);
  const lig = clamp01(l / 100);
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lig - c / 2;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hue < 60) [r1, g1, b1] = [c, x, 0];
  else if (hue < 120) [r1, g1, b1] = [x, c, 0];
  else if (hue < 180) [r1, g1, b1] = [0, c, x];
  else if (hue < 240) [r1, g1, b1] = [0, x, c];
  else if (hue < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  return {
    r: (r1 + m) * 255,
    g: (g1 + m) * 255,
    b: (b1 + m) * 255,
  };
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h, s, l) {
  const { r, g, b } = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

function hexToHsl(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return rgbToHsl(rgb.r, rgb.g, rgb.b);
}

function distanceSq(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function getApproxColorName(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  let best = NAMED_COLORS[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const item of NAMED_COLORS) {
    const c = hexToRgb(item.hex);
    if (!c) continue;
    const d = distanceSq(rgb, c);
    if (d < bestDist) {
      bestDist = d;
      best = item;
    }
  }
  return best?.name || null;
}

/**
 * @param {{
 * value: string
 * onChange: (hex: string) => void
 * label?: string
 * className?: string
 * showTextInput?: boolean
 * showSwatches?: boolean
 * swatches?: string[]
 * disabled?: boolean
 * }} props
 */
export default function ColorPicker2D({
  value,
  onChange,
  label,
  className = '',
  showTextInput = true,
  showSwatches = true,
  swatches = [],
  disabled = false,
}) {
  const defaultHex = '#3b82f6';
  const normalized = normalizeHex(value) || defaultHex;
  const hslFromProp = hexToHsl(normalized) || { h: 210, s: 100, l: 50 };
  const [xy, setXy] = useState({
    x: clamp01(hslFromProp.h / 360),
    y: clamp01((hslFromProp.l - 50) / 50),
  });
  const mapRef = useRef(null);

  useEffect(() => {
    const next = hexToHsl(normalized);
    if (!next) return;
    setXy({
      x: clamp01(next.h / 360),
      y: clamp01((next.l - 50) / 50),
    });
  }, [normalized]);

  const markerLeft = `${xy.x * 100}%`;
  const markerTop = `${xy.y * 100}%`;
  const tooltipLabel = useMemo(() => {
    const name = getApproxColorName(normalized);
    return name ? `${name} · ${normalized.toUpperCase()}` : normalized.toUpperCase();
  }, [normalized]);

  const updateFromPointer = (clientX, clientY) => {
    if (disabled || !mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = clamp01((clientX - rect.left) / rect.width);
    const y = clamp01((clientY - rect.top) / rect.height);
    setXy({ x, y });
    const h = x * 360;
    const s = clamp01(1 - y) * 100;
    const l = 50 + y * 50;
    onChange(hslToHex(h, s, l));
  };

  const handlePointerDown = (e) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    updateFromPointer(e.clientX, e.clientY);
  };

  const handlePointerMove = (e) => {
    if (disabled || (e.buttons !== 1 && !e.currentTarget.hasPointerCapture?.(e.pointerId))) return;
    updateFromPointer(e.clientX, e.clientY);
  };

  const availableSwatches = swatches
    .map((s) => normalizeHex(s))
    .filter(Boolean);

  return (
    <div className={`space-y-2 ${className}`}>
      {label ? (
        <LabelLike>{label}</LabelLike>
      ) : null}
      <div className={`space-y-2 ${disabled ? 'opacity-60' : ''}`}>
        <div
          ref={mapRef}
          className="relative h-44 w-full rounded-md border border-border/80 shadow-inner cursor-crosshair overflow-hidden"
          style={{
            backgroundImage: `
              linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000),
              linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 100%)
            `,
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          role="application"
          aria-label="Seletor de cores 2D"
        >
          <div
            className="absolute -translate-x-1/2 -translate-y-[140%] pointer-events-none rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] shadow-sm text-slate-700 whitespace-nowrap"
            style={{ left: markerLeft, top: markerTop }}
          >
            {tooltipLabel}
          </div>
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-slate-900 bg-transparent shadow-[0_0_0_1px_rgba(255,255,255,0.9)] pointer-events-none"
            style={{ left: markerLeft, top: markerTop }}
            aria-hidden="true"
          />
        </div>

        {showTextInput ? (
          <div className="flex items-center gap-2">
            <Input
              value={normalized}
              onChange={(e) => {
                const next = normalizeHex(e.target.value);
                if (next) onChange(next);
              }}
              placeholder="#3b82f6"
              disabled={disabled}
              className="h-8 text-sm font-mono"
            />
            <span
              className="h-8 w-8 rounded border border-border/80"
              style={{ backgroundColor: normalized }}
              aria-hidden="true"
            />
          </div>
        ) : null}

        {showSwatches && availableSwatches.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {availableSwatches.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => onChange(hex)}
                disabled={disabled}
                className={`h-6 w-6 rounded border transition-transform hover:scale-105 ${
                  normalized === hex ? 'ring-2 ring-offset-1 ring-cyan-400' : 'border-border/70'
                }`}
                style={{ backgroundColor: hex }}
                aria-label={`Selecionar cor ${hex}`}
                title={hex}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LabelLike({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}
