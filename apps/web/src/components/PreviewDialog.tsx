import { lazy, Suspense, useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, Check, Eye, Headphones, Volume2, VolumeX, X } from 'lucide-react';
import type { Availability, Hall, Seat } from '../lib/types';
import { money, seatLabel } from '../lib/format';
import { useSeatAudio } from '../hooks/useSeatAudio';
import { Loading } from './Feedback';

const CinemaScene = lazy(() => import('./CinemaScene'));
interface Props { hall: Hall; availability: Availability; seats: Seat[]; onClose: () => void; onSelect: (seat: Seat) => void; onBuy?: (seat: Seat) => void }
export default function PreviewDialog({ hall, availability, seats, onClose, onSelect, onBuy }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const compare = seats.length > 1;
  const audio = useSeatAudio(hall, compare ? null : seats[0]);
  const free = (seat: Seat) => availability.seats.find(s => s.seat_id === seat.id)?.status === 'available';
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { element?.close(); document.body.style.overflow = previous; };
  }, []);
  return <dialog ref={dialog} className={'preview-dialog' + (compare ? ' preview-dialog--compare' : '')} aria-labelledby="preview-title" onCancel={onClose} onClick={e => { if (e.target === dialog.current) onClose(); }}>
    <div className="preview-header"><div><p className="eyebrow">{compare ? 'ДВА МЕСТА. ДВА ВПЕЧАТЛЕНИЯ.' : 'ВАШ ВИД НА БОЛЬШОЙ ЭКРАН'}</p><h2 id="preview-title">{compare ? 'Какой ракурс — ваш?' : seatLabel(seats[0].row, seats[0].number, seats[0].type)}</h2></div><button className="icon-button" onClick={onClose} aria-label="Вернуться к схеме"><X size={23}/></button></div>
    <div className="preview-scenes">{seats.map((seat, index) => {
      const price = availability.seats.find(s => s.seat_id === seat.id)?.price_minor;
      const distance = Math.hypot(seat.position.x - hall.screen.center.x, seat.position.z - hall.screen.center.z);
      const angle = Math.round(Math.atan2(Math.abs(seat.position.x - hall.screen.center.x), Math.abs(seat.position.z - hall.screen.center.z)) * 180 / Math.PI);
      return <div className="preview-panel" key={seat.id}><div className="preview-canvas-wrap"><Suspense fallback={<Loading label="Занимаем ваше место…"/>}><CinemaScene hall={hall} seat={seat} availability={availability} className="seat-preview-canvas"/></Suspense><span className="preview-eye"><Eye size={14}/>{compare ? (index ? 'РАКУРС B' : 'РАКУРС A') : 'НА УРОВНЕ ВАШИХ ГЛАЗ'}</span></div><div className="preview-panel-info"><div><h3>{seatLabel(seat.row, seat.number, seat.type)}</h3><p>{distance.toFixed(1)} м<span>·</span>{angle}° от центра<span>·</span>{price === undefined ? 'Цена уточняется' : money(price)}</p></div>{compare && <button className="button button--secondary" onClick={() => { onSelect(seat); onClose(); }}><Check size={16}/>Выбрать {index ? 'B' : 'A'}</button>}</div></div>;
    })}</div>
    <div className="preview-footer"><button className="button button--ghost" onClick={onClose}><ArrowLeft size={16}/>К схеме зала</button>{!compare && <><button className={'button button--secondary audio-button' + (audio.enabled ? ' is-on' : '')} onClick={audio.toggle} aria-pressed={audio.enabled}>{audio.enabled ? <Volume2 size={17}/> : <VolumeX size={17}/>}<span>{audio.enabled ? 'Выключить звук' : 'Послушать с места'}</span></button><button className="button button--primary" disabled={!free(seats[0]) || !onBuy} onClick={() => { onClose(); onBuy?.(seats[0]); }}>{free(seats[0]) ? 'Купить билет' : 'Место недоступно'}<ArrowRight size={16}/></button></>}</div>
    {!compare && <p className="audio-note">{audio.error || <><Headphones size={14}/>Лучше в наушниках. Синтезированный звук показывает баланс колонок и расстояние.</>}</p>}
  </dialog>;
}
