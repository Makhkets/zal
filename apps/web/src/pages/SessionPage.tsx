import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Box, Clock3, Eye, GitCompareArrows, Grid2X2, MapPin, MousePointer2, RotateCcw, ShieldCheck, Ticket, Users, Volume2, X } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../lib/AppContext';
import type { Availability, Hall, Seat, Session } from '../lib/types';
import { money, sessionDate, sessionTime } from '../lib/format';
import { getMovieMedia, screenTrailer } from '../lib/catalogMedia';
import '../styles/session-v2.css';
import SeatMap from '../components/SeatMap';
import SeatFinder from '../components/SeatFinder';
import RoomChat from '../components/RoomChat';
import PreviewDialog from '../components/PreviewDialog';
import CheckoutDialog from '../components/CheckoutDialog';
import FullscreenButton from '../components/FullscreenButton';
import { useFullscreen } from '../hooks/useFullscreen';
import { ErrorState, Loading } from '../components/Feedback';

const CinemaScene = lazy(() => import('../components/CinemaScene'));

export default function SessionPage() {
  const { sessionId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const requestedSeat = searchParams.get('seat');
  const requestedPreview = searchParams.get('preview') === '1';
  const { cinemas, mode } = useApp();
  const [session, setSession] = useState<Session | null>(null);
  const [hall, setHall] = useState<Hall | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [previewIds, setPreviewIds] = useState<string[]>([]);
  const [checkout, setCheckout] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshError, setRefreshError] = useState(false);
  const [version, setVersion] = useState(0);
  const [hallMode, setHallMode] = useState<'3d' | '2d'>('3d');
  const [cameraView, setCameraView] = useState<'overview' | 'front' | 'back' | 'top' | 'sofas'>('overview');
  const [cameraRevision, setCameraRevision] = useState(0);
  const [sceneError, setSceneError] = useState(false);
  const [audience, setAudience] = useState(true);
  const [hoveredSeat, setHoveredSeat] = useState<Seat | null>(null);
  const hallFullscreenRef = useRef<HTMLDivElement>(null);
  const hallFullscreen = useFullscreen(hallFullscreenRef);
  const availabilityRequest = useRef(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setSession(null); setHall(null); setAvailability(null);
    setSelectedId(null); setCompareIds([]); setPreviewIds([]); setCheckout(false);
    api.session(sessionId, controller.signal).then(async info => {
      const [geometry, states] = await Promise.all([api.hall(info.hall_id, controller.signal), api.seats(info.id, controller.signal)]);
      if (!controller.signal.aborted) {
        setSession(info); setHall(geometry); setAvailability(states);
        const requested = geometry.seats.find(seat => seat.id === requestedSeat);
        if (requested) { setSelectedId(requested.id); if (requestedPreview) setPreviewIds([requested.id]); }
      }
    }).catch((e: Error) => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [sessionId, version, requestedSeat, requestedPreview]);
  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    let inFlight = false;
    const refresh = () => {
      if (document.hidden || inFlight) return;
      inFlight = true;
      const request = ++availabilityRequest.current;
      api.seats(session.id, controller.signal).then(data => {
        if (!controller.signal.aborted && request === availabilityRequest.current) {
          setAvailability(current => current && Date.parse(data.updated_at) < Date.parse(current.updated_at) ? current : data);
          setRefreshError(false);
        }
      }).catch(() => { if (!controller.signal.aborted && request === availabilityRequest.current) setRefreshError(true); })
        .finally(() => { inFlight = false; });
    };
    const timer = window.setInterval(refresh, 10000);
    const stopStream = mode === 'live' && typeof EventSource !== 'undefined' ? api.watchSeats(session.id, refresh) : undefined;
    window.addEventListener('focus', refresh);
    return () => { controller.abort(); clearInterval(timer); stopStream?.(); window.removeEventListener('focus', refresh); };
  }, [session, mode]);
  const selected = hall?.seats.find(s => s.id === selectedId) ?? null;
  const selectedState = availability?.seats.find(s => s.seat_id === selectedId);
  const hoveredState = availability?.seats.find(s => s.seat_id === hoveredSeat?.id);
  const centerSeat = hall?.seats.filter(seat => seat.row === 6 && availability?.seats.some(s => s.seat_id === seat.id && s.status === 'available')).sort((a, b) => Math.abs(a.position.x) - Math.abs(b.position.x))[0];
  const cinema = cinemas.find(c => c.id === session?.cinema_id);
  const availableCount = availability?.seats.filter(s => s.status === 'available').length ?? 0;
  const tiers = useMemo(() => hall && availability ? Array.from(new Set(hall.seats.map(s => s.zone))).map(zone => {
    const ids = new Set(hall.seats.filter(s => s.zone === zone).map(s => s.id));
    const prices = availability.seats.filter(s => ids.has(s.seat_id)).map(s => s.price_minor);
    return { zone, price: Math.min(...prices) };
  }) : [], [hall, availability]);
  const select = useCallback((seat: Seat) => setSelectedId(seat.id), []);
  function addCompare() {
    if (!selected) return;
    setCompareIds(ids => ids.includes(selected.id) ? ids.filter(id => id !== selected.id) : ids.length < 2 ? [...ids, selected.id] : [ids[0], selected.id]);
  }
  async function conflict() {
    setCheckout(false);
    const request = ++availabilityRequest.current;
    setSelectedId(null);
    try {
      const data = await api.seats(sessionId);
      if (request === availabilityRequest.current) setAvailability(current => current && Date.parse(data.updated_at) < Date.parse(current.updated_at) ? current : data);
    } catch { if (request === availabilityRequest.current) setRefreshError(true); }
  }
  if (loading) return <div className="page-shell"><Loading label="Открываем двери в зал…"/></div>;
  if (error || !session || !hall || !availability) return <div className="page-shell"><Link className="back-link" to="/#sessions"><ArrowLeft size={16}/>К афише</Link><ErrorState message={error || 'Этот сеанс не найден.'} onRetry={() => setVersion(v => v + 1)}/></div>;
  const expired = new Date(session.starts_at).getTime() <= Date.now();
  return <div className="page-shell session-page session-v2">
    <div className="session-topline"><Link className="back-link" to="/#sessions"><ArrowLeft size={16}/>К афише</Link><ol className="booking-steps" aria-label="Этапы покупки"><li className="is-current" aria-current="step">01<span>Место</span></li><li>02<span>Оплата</span></li><li>03<span>Билет</span></li></ol></div>
    <div className="session-title"><img className="session-poster" src={getMovieMedia(session.movie).poster ?? session.movie.poster_url ?? undefined} alt=""/><div><p className="eyebrow">ВЫБЕРИТЕ МЕСТО. ПРИМЕРЬТЕ ВПЕЧАТЛЕНИЕ.</p><h1>{session.movie.title}</h1><div className="session-subtitle"><span><MapPin size={15}/>{cinema?.name ?? hall.name}</span><span><Clock3 size={15}/>{sessionDate(session.starts_at, cinema?.timezone)}, {sessionTime(session.starts_at, cinema?.timezone)}</span><span>{session.movie.age_rating}</span><span>{session.format}</span></div></div><span className="availability-chip"><span className="status-dot"/>{availableCount} свободных мест</span></div>
    {expired && <div className="inline-notice" role="alert">Этот сеанс уже начался. <Link to="/#sessions">Выберите другое время.</Link></div>}
    {refreshError && <div className="inline-notice" role="status">Не удалось обновить места. Доступность проверится ещё раз при покупке.</div>}
    <div className="booking-layout">
      <div ref={hallFullscreenRef} className={'hall-panel' + (hallFullscreen.active ? ' is-fullscreen' : '')} data-fullscreen-mode={hallFullscreen.mode} role={hallFullscreen.active ? 'dialog' : undefined} aria-modal={hallFullscreen.active || undefined} aria-label={hallFullscreen.active ? 'Зал на весь экран' : undefined}>
        <div className="hall-panel-head"><div><h2>{hall.name}</h2><span className="hall-name">{hall.seats.length} мест · 3 ценовые зоны</span></div><div className="hall-panel-actions"><div className="hall-mode-toggle" role="group" aria-label="Отображение зала"><button aria-pressed={hallMode === '3d'} onClick={() => setHallMode('3d')}><Box size={16}/>3D-зал</button><button aria-pressed={hallMode === '2d'} onClick={() => setHallMode('2d')}><Grid2X2 size={16}/>Схема</button></div><FullscreenButton active={hallFullscreen.active} busy={hallFullscreen.busy} onToggle={hallFullscreen.toggle} label="Развернуть зал на весь экран" /></div></div>
        {hallMode === '3d' ? <div className="interactive-hall">
          <div className="hall-interaction-hint"><MousePointer2 size={13}/><span>Перетаскивайте для обзора · выберите кресло</span></div>
          <Suspense fallback={<Loading label="Включаем свет в зале…"/>}><CinemaScene key={cameraRevision} hall={hall} seat={selected} availability={availability} overview interactive videoPoster="/media/screen-still.jpg" onSeatSelect={select} onHoverSeat={setHoveredSeat} audience={audience} view={cameraView} paused={previewIds.length > 0 || checkout} onError={() => { setSceneError(true); setHallMode('2d'); }}/></Suspense>
          {hoveredSeat && <div className="hall-hover-card" aria-hidden="true"><strong>Ряд {hoveredSeat.row} · {hoveredSeat.type === 'sofa' ? 'диван' : 'место'} {hoveredSeat.number}</strong><span>{hoveredState ? money(hoveredState.price_minor) : ''} · {hoveredState?.status === 'available' ? 'Свободно' : hoveredState?.status === 'held' ? 'Бронь' : 'Занято'}</span></div>}
          <button className="audience-toggle" aria-pressed={audience} onClick={() => setAudience(value => !value)}><Users size={15}/><span>Зрители</span><i/></button>
          <div className="hall-camera-bar" role="group" aria-label="Ракурс камеры">{([{ value: 'overview', label: 'Весь зал' }, { value: 'front', label: 'От экрана' }, { value: 'back', label: 'Сзади' }, { value: 'top', label: 'Сверху' }, { value: 'sofas', label: 'Диваны' }] as const).map(view => <button key={view.value} aria-pressed={cameraView === view.value} onClick={() => setCameraView(view.value)}>{view.label}</button>)}<button className="camera-reset" aria-label="Сбросить камеру" onClick={() => { setCameraView('overview'); setCameraRevision(v => v + 1); }}><RotateCcw size={16}/></button></div>
        </div> : <><SeatMap hall={hall} availability={availability} selectedId={selectedId} compareIds={compareIds} onSelect={select}/>{sceneError && <p className="map-hint" role="status">3D недоступен в этом браузере. Все места можно выбрать на схеме.</p>}</>}
        <div className="price-tiers">{tiers.map(t => <div key={t.zone}><span className={'tier-symbol tier-' + t.zone}/><div><strong>{money(t.price)}</strong><span>{t.zone === 'front' ? 'Стандарт · ткань' : t.zone === 'middle' ? 'Premium · кожа' : 'VIP · диваны'}</span></div></div>)}</div>
        {hallFullscreen.active && <div className="fullscreen-seat-bar">{selected && selectedState ? <><div><strong>Ряд {selected.row} · {selected.type === 'sofa' ? 'диван' : 'место'} {selected.number}</strong><span>{money(selectedState.price_minor)}{selectedState.status !== 'available' ? ' · Занято' : ''}</span></div><button className="button button--primary" onClick={async () => { await hallFullscreen.exit(); setPreviewIds([selected.id]); }}><Eye size={17} aria-hidden="true"/>Вид и звук с места</button></> : <p>Выберите кресло, чтобы посмотреть на экран со своего места.</p>}</div>}
      </div>
      <aside className="booking-sidebar" aria-label="Выбранное место">
        <AnimatePresence mode="wait" initial={false}>{selected && selectedState ? <motion.div className="selection-card" key="selected-seat" initial={reduce ? false : { opacity: .3, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: .3 }} transition={{ duration: .12 }}>
          <div className="selection-kicker"><span className="eyebrow">ТО САМОЕ МЕСТО</span><span className="selected-dot"/></div>
          <div className="seat-numbers"><div><span>Ряд</span><strong>{String(selected.row).padStart(2, '0')}</strong></div><i/><div><span>{selected.type === 'sofa' ? 'Диван' : 'Место'}</span><strong>{String(selected.number).padStart(2, '0')}</strong></div><div className="selection-chair" aria-hidden="true"><Ticket size={36} strokeWidth={1}/></div></div>
          <div className="selection-price"><span>{selected.type === 'sofa' ? 'Один диван' : 'Один билет'}</span><strong>{money(selectedState.price_minor)}</strong></div>
          {selectedState.status !== 'available' && <p className="seat-unavailable" role="status">{selectedState.status === 'held' ? 'Это место временно забронировано.' : 'Это место уже купили.'} Посмотреть ракурс всё равно можно.</p>}
          <button className="button button--light preview-cta" onClick={() => setPreviewIds([selected.id])}><Eye size={19}/>Вид и звук с места<ArrowUpRight size={18}/></button>
          <button className="button button--primary buy-cta" disabled={selectedState.status !== 'available' || expired} onClick={() => setCheckout(true)}>Купить билет<ArrowRight size={18}/></button>
          <button className={'compare-button' + (compareIds.includes(selected.id) ? ' is-active' : '')} onClick={() => compareIds.length === 2 ? setPreviewIds(compareIds) : addCompare()}><GitCompareArrows size={17}/>{compareIds.length === 2 ? 'Сравнить два места' : compareIds.includes(selected.id) ? 'Убрать из сравнения' : 'Добавить к сравнению'}</button>
          <p className="booking-trust"><ShieldCheck size={14}/>Место бронируется при оформлении</p>
        </motion.div> : <div className="selection-card selection-empty" key="empty"><div className="empty-seat-illustration"><div className="fallback-chair"><span/><i/><b/></div></div><h3>Где сядем?</h3><p>Выберите кресло в зале.<br/>Посмотрите трейлер, оглядитесь<br/>и послушайте звук со своего места.</p>{centerSeat && <button className="button button--primary center-preview" onClick={() => { select(centerSeat); setPreviewIds([centerSeat.id]); }}><Eye size={17}/>Примерить центр зала</button>}<span className="empty-selection-hint"><Volume2 size={15}/>Ближе к колонкам — громче</span></div>}</AnimatePresence>
        <div className="seat-tip"><span>СНАЧАЛА ПОСМОТРЕТЬ</span><p>Включите трейлер и смените кресло.<br/>Картинка и звук изменятся вместе с ним.</p></div>
      </aside>
    </div>
    <div className="reference-views"><span className="eyebrow">ПОЧУВСТВУЙТЕ РАЗНИЦУ</span><div>{[{ row: 1, number: 3, label: 'Близко к экрану' }, { row: 6, number: 12, label: 'В середине зала' }, { row: 10, number: 7, label: 'На заднем ряду' }].map(preset => {
      const seat = hall.seats.find(s => s.row === preset.row && s.number === preset.number);
      return seat ? <button key={seat.id} onClick={() => { select(seat); setPreviewIds([seat.id]); }}><Eye size={17}/><span>{preset.label}<small>Ряд {seat.row}, {seat.type === 'sofa' ? 'диван' : 'место'} {seat.number}</small></span><ArrowUpRight size={17}/></button> : null;
    })}</div></div>
    <SeatFinder hall={hall} availability={availability} selectedId={selectedId} onSelect={select} onPreview={seat => { select(seat); setPreviewIds([seat.id]); }} onCompare={seats => { const ids = seats.map(seat => seat.id); setCompareIds(ids); setPreviewIds(ids); }}/>
    {compareIds.length > 0 && <div className="compare-dock" role="region" aria-label="Сравнение мест"><div className="compare-dock-label"><GitCompareArrows size={18}/><span>Сравнение мест</span></div><div className="compare-slots">{[0, 1].map(index => {
      const seat = hall.seats.find(s => s.id === compareIds[index]);
      return <div className={'compare-slot' + (!seat ? ' is-empty' : '')} key={index}><b>{index ? 'B' : 'A'}</b>{seat ? <><span>Ряд {seat.row} · место {seat.number}</span><button aria-label={'Убрать место ' + (index ? 'B' : 'A')} onClick={() => setCompareIds(ids => ids.filter(id => id !== seat.id))}><X size={14}/></button></> : <span>Выберите ещё одно</span>}</div>;
    })}</div><button className="button button--primary" disabled={compareIds.length !== 2} onClick={() => setPreviewIds(compareIds)}>Сравнить ракурсы<ArrowRight size={16}/></button></div>}
    <RoomChat sessionId={session.id}/>
    {previewIds.length > 0 && <PreviewDialog trailer={screenTrailer(session.movie)} hall={hall} availability={availability} seats={previewIds.flatMap(id => { const seat = hall.seats.find(s => s.id === id); return seat ? [seat] : []; })} onClose={() => setPreviewIds([])} onSelect={select} onBuy={expired ? undefined : seat => { select(seat); setCheckout(true); }}/>}
    {checkout && selected && selectedState && <CheckoutDialog session={session} seat={selected} priceMinor={selectedState.price_minor} cinema={cinema} onClose={() => setCheckout(false)} onConflict={conflict}/>}
    {selected && selectedState && <div className="mobile-seat-bar"><button className="mobile-seat-detail" onClick={() => setPreviewIds([selected.id])}><Eye size={18}/><span><strong>Ряд {selected.row} · {selected.type === 'sofa' ? 'диван' : 'место'} {selected.number}</strong><small>Посмотреть с места</small></span></button><button className="button button--primary" disabled={selectedState.status !== 'available' || expired} onClick={() => setCheckout(true)}>{selectedState.status === 'available' ? money(selectedState.price_minor) : 'Занято'}<ArrowRight size={17}/><span className="sr-only"> — Купить билет</span></button></div>}
  </div>;
}
