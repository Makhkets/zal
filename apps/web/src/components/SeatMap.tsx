import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import type { Availability, Hall, Seat } from '../lib/types';
import { money } from '../lib/format';

interface Props { hall: Hall; availability: Availability; selectedId: string | null; compareIds: string[]; onSelect: (seat: Seat) => void }
export default function SeatMap({ hall, availability, selectedId, compareIds, onSelect }: Props) {
  const [zoom, setZoom] = useState(1);
  const states = useMemo(() => new Map(availability.seats.map(s => [s.seat_id, s])), [availability]);
  const rows = useMemo(() => Array.from(new Set(hall.seats.map(s => s.row))), [hall]);
  const first = hall.seats.find(s => states.get(s.id)?.status === 'available')?.id;
  const width = 1280;
  const bounds = Math.max(...hall.seats.map(s => Math.abs(s.position.x) + s.width / 2));
  const scale = (width - 160) / (bounds * 2);
  const minZ = Math.min(...hall.seats.map(s => s.position.z));
  const projectX = (x: number) => width / 2 + x * scale;
  const projectZ = (z: number) => 108 + (z - minZ) * 40;
  const maxZ = Math.max(...hall.seats.map(s => s.position.z));
  const height = projectZ(maxZ) + 60;
  function keyboard(event: KeyboardEvent<SVGGElement>, seat: Seat) {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(seat); return; }
    if (!event.key.startsWith('Arrow')) return;
    event.preventDefault();
    const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    const candidates = hall.seats.filter(s => horizontal ? s.row === seat.row && (s.number - seat.number) * direction > 0 : s.row === seat.row + direction);
    candidates.sort((a, b) => Math.abs(a.position.x - seat.position.x) - Math.abs(b.position.x - seat.position.x));
    const next = candidates[0];
    if (next) { onSelect(next); document.getElementById('seat-' + next.id)?.focus(); }
  }
  return <div className="seat-map-shell">
    <div className="screen-label"><span/>ЭКРАН<span/></div>
    <div className="seat-map-scroll" tabIndex={0} role="region" aria-label="Схема зала. Используйте стрелки для перемещения между местами">
      <svg className="seat-map-svg" viewBox={'0 0 ' + width + ' ' + height} style={{ width: (zoom * 100) + '%' }} role="group" aria-label={hall.name + ', выбор места'}>
        <defs><linearGradient id="screen-line"><stop stopColor="#f6f3e9" stopOpacity=".06"/><stop offset=".5" stopColor="#f6f3e9" stopOpacity=".85"/><stop offset="1" stopColor="#f6f3e9" stopOpacity=".06"/></linearGradient></defs>
        <path d="M140 22Q640 70 1140 22" fill="none" stroke="url(#screen-line)" strokeWidth="4" strokeLinecap="round"/>
        <path d="M140 25Q640 73 1140 25L1120 52Q640 101 160 52Z" fill="var(--text)" opacity=".025"/>
        {rows.map(row => { const seats = hall.seats.filter(s => s.row === row); const y = projectZ(Math.min(...seats.map(s => s.position.z))); return <g key={row} className="row-labels" aria-hidden="true"><text x="28" y={y + 7}>{row}</text><text x={width - 28} y={y + 7}>{row}</text></g>; })}
        {hall.seats.map(seat => {
          const state = states.get(seat.id);
          const selected = seat.id === selectedId;
          const comparison = compareIds.indexOf(seat.id);
          const status = state?.status ?? 'held';
          const label = (seat.type === 'sofa' ? 'VIP, ' : seat.zone === 'front' ? 'Стандарт, ' : 'Premium, ') + 'Ряд ' + seat.row + ', ' + (seat.type === 'sofa' ? 'диван ' : 'место ') + seat.number + ', ' + (status === 'available' ? 'свободно' : status === 'held' ? 'забронировано' : 'занято') + (state ? ', ' + money(state.price_minor) : '');
          const w = seat.width * scale;
          return <g key={seat.id} id={'seat-' + seat.id} role="button" aria-label={label} aria-pressed={selected} tabIndex={selected || (!selectedId && seat.id === first) ? 0 : -1} onClick={() => onSelect(seat)} onKeyDown={e => keyboard(e, seat)} className={'seat seat-zone-' + seat.zone + ' seat--' + status + (selected ? ' is-selected' : '') + (comparison >= 0 ? ' is-compared' : '')} transform={'translate(' + projectX(seat.position.x) + ' ' + projectZ(seat.position.z) + ') rotate(' + (-seat.rotation_y * 180 / Math.PI) + ')'}>
            <title>{label}</title><rect className="seat-hit" x={-w / 2 - 2} y="-22" width={w + 4} height="44" rx="9"/>
            <rect className="seat-back" x={-w / 2} y="-16" width={w} height="25" rx="5"/>
            <path className="seat-bottom" d={'M' + (-w / 2 + 4) + ' 7H' + (w / 2 - 4)} strokeLinecap="round"/>
            {selected ? <path d="m-5-4 4 4 7-8" className="seat-check" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/> : comparison >= 0 ? <text className="seat-letter" y="1">{comparison === 0 ? 'A' : 'B'}</text> : status === 'held' ? <circle className="seat-held-dot" r="2" cy="-3"/> : null}
          </g>;
        })}
      </svg>
    </div>
    <div className="map-bottom"><div className="seat-legend"><span><i className="legend-free"/>Свободно</span><span><i className="legend-sold"/>Занято</span><span><i className="legend-held"/>Бронь</span><span><i className="legend-selected"/>Ваше место</span></div><div className="map-zoom"><button className="icon-button" aria-label="Уменьшить схему" onClick={() => setZoom(z => Math.max(1, z - .25))} disabled={zoom <= 1}><Minus size={16}/></button><button className="icon-button" aria-label="Сбросить масштаб" onClick={() => setZoom(1)}><RotateCcw size={14}/></button><button className="icon-button" aria-label="Увеличить схему" onClick={() => setZoom(z => Math.min(2, z + .25))} disabled={zoom >= 2}><Plus size={16}/></button></div></div>
    <p className="map-hint">Выберите кресло, чтобы увидеть цену и посмотреть на экран с этого места.</p>
  </div>;
}
