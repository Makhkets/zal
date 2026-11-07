import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, Clock3, Eye, MapPin, MoveUpRight, Pause, Play, ScanLine, Ticket } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useApp } from '../lib/AppContext';
import { api } from '../lib/api';
import { money, sessionDate, sessionTime } from '../lib/format';
import type { Availability, Hall, Session } from '../lib/types';
import FilmArt from '../components/FilmArt';
import { EmptyState, ErrorState, Loading } from '../components/Feedback';

const CinemaScene = lazy(() => import('../components/CinemaScene'));

export default function HomePage() {
  const { cinemas, loading: catalogLoading, error: catalogError, reload } = useApp();
  const [cinemaId, setCinemaId] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [hall, setHall] = useState<Hall | null>(null);
  const [availability, setAvailability] = useState<Availability>();
  const [paused, setPaused] = useState(false);
  const reduce = useReducedMotion();
  const selectedCinema = cinemas.find(c => c.id === cinemaId);
  useEffect(() => { if (cinemas.length && !cinemas.some(c => c.id === cinemaId)) setCinemaId(cinemas[0].id); }, [cinemas, cinemaId]);
  useEffect(() => {
    if (!cinemaId) return;
    const controller = new AbortController();
    setLoading(true); setError(''); setSessions([]); setHall(null); setAvailability(undefined);
    api.sessions(cinemaId, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      const future = data.items.filter(item => new Date(item.starts_at).getTime() > Date.now());
      setSessions(future);
      if (future[0]) {
        void Promise.all([api.hall(future[0].hall_id, controller.signal), api.seats(future[0].id, controller.signal)])
          .then(([geometry, seats]) => { if (!controller.signal.aborted) { setHall(geometry); setAvailability(seats); } })
          .catch(() => { /* The catalog stays usable if its optional hero preview is unavailable. */ });
      }
    }).catch((e: Error) => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [cinemaId, version]);
  const films = useMemo(() => Array.from(new Map(sessions.map(s => [s.movie.id, s.movie])).values()), [sessions]);
  const heroSeat = hall?.seats.find(seat => seat.row === 6 && seat.number === 8) ?? hall?.seats[0];
  const fromPrice = sessions.length ? Math.min(...sessions.map(s => s.price_from_minor)) : null;
  return <>
    <section className="hero" aria-labelledby="hero-title">
      <div className="wrap hero-layout">
        <div className="hero-copy">
          <p className="eyebrow"><span className="status-dot"/>КИНО НАЧИНАЕТСЯ С ВАШЕГО МЕСТА</p>
          <h1 id="hero-title">Билет с видом<br/>на <span className="hero-accent">ваше кино<span className="accent-period">.</span></span></h1>
          <p className="hero-description">Окажитесь в зале ещё до покупки.<br/>Посмотрите на экран со своего места —<br className="desktop-break"/> и выбирайте по ощущениям.</p>
          <div className="hero-actions">
            <a className="button button--primary button--large" href="#sessions">Выбрать сеанс<ArrowUpRight size={20}/></a>
            <a className="hero-text-link" href="#how-it-works"><span className="play-ring"><Play size={12} fill="currentColor"/></span>Как это работает</a>
          </div>
          <div className="hero-footnote"><span className="mini-seats" aria-hidden="true"><i/><i/><i/></span><span>У каждого места — свой ракурс{fromPrice !== null && <>.<br/>Билеты от <strong>{money(fromPrice)}</strong></>}</span></div>
        </div>
        <div className="hero-visual">
          <div className="scene-orbit orbit-one"/><div className="scene-orbit orbit-two"/>
          <div className="hero-visual-label"><span className="tiny-square"/>ВАШ БУДУЩИЙ ВЕЧЕР · В ОБЪЁМЕ</div>
          <div className="hero-canvas-frame">
            {hall ? <Suspense fallback={<div className="scene-placeholder"><span className="loader"/><span>Зажигаем экран</span></div>}><CinemaScene hall={hall} seat={heroSeat} availability={availability} overview paused={paused || !!reduce} className="hero-canvas"/></Suspense> : <div className="scene-placeholder"><div className="fallback-chair"><span/><i/><b/></div><span>{error || catalogError ? 'Зал появится после подключения' : 'Зажигаем экран'}</span></div>}
          </div>
          <motion.div className="hero-seat-note" initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', bounce: 0, duration: .4 }}>
            <span className="seat-note-icon"><Eye size={20}/></span><span><strong>Сначала почувствуйте разницу</strong><small>Тот самый вид. С того самого места.</small></span><ArrowUpRight size={17}/>
          </motion.div>
          <div className="hero-visual-bottom"><span><span className="status-dot"/>Живой 3D-обзор</span><button className="icon-button motion-toggle" onClick={() => setPaused(v => !v)} aria-label={paused ? 'Продолжить анимацию зала' : 'Остановить анимацию зала'} aria-pressed={paused} disabled={!!reduce}>{paused || reduce ? <Play size={14}/> : <Pause size={14}/>}</button></div>
        </div>
      </div>
      <div className="wrap hero-bottom"><span>МЕНЬШЕ СЛУЧАЙНОСТЕЙ. БОЛЬШЕ КИНО.</span><a href="#sessions" aria-label="Перейти к афише"><ArrowDown size={18}/></a><span>01 / ВЫБЕРИТЕ СВОЙ ВЕЧЕР</span></div>
    </section>
    <section className="catalog-section" id="sessions" aria-labelledby="catalog-title">
      <div className="wrap">
        <div className="section-heading"><div><p className="eyebrow">НА БОЛЬШОМ ЭКРАНЕ</p><h2 id="catalog-title">Ваш следующий <span>сеанс.</span></h2></div><div className="cinema-control"><MapPin size={17}/><label className="sr-only" htmlFor="cinema">Кинотеатр</label><select id="cinema" value={cinemaId} onChange={e => setCinemaId(e.target.value)} disabled={!cinemas.length}>{!cinemas.length && <option value="">Выберите кинотеатр</option>}{cinemas.map(cinema => <option key={cinema.id} value={cinema.id}>{cinema.name}</option>)}</select><ChevronDown size={15}/></div></div>
        <div className="catalog-meta"><p>{sessions[0] ? <><span className="status-dot"/>{sessionDate(sessions[0].starts_at, selectedCinema?.timezone)} · {selectedCinema?.name}</> : 'Выберите кинотеатр и удобное время'}</p><span><Eye size={15}/>3D-примерка места в каждом сеансе</span></div>
        {catalogError ? <ErrorState message={catalogError} onRetry={reload}/> : error ? <ErrorState message={error} onRetry={() => setVersion(v => v + 1)}/> : catalogLoading || loading ? <div className="film-grid" aria-busy="true"><div className="film-skeleton"/><div className="film-skeleton"/></div> : films.length ? <div className="film-grid">{films.map((film, index) => {
          const options = sessions.filter(s => s.movie.id === film.id);
          return <article className="film-card" key={film.id}>
            <Link className="film-art-link" to={'/sessions/' + options[0].id} aria-label={'Выбрать место на фильм «' + film.title + '»'}>
              <FilmArt title={film.title} variant={index} poster={film.poster_url}/>
              <div className="film-topline"><span className="film-badge">{film.age_rating}</span><span className="film-top-label">БОЛЬШОЙ ЭКРАН</span><span className="film-badge">{options[0].format}</span></div>
              <div className="film-poster-caption"><span className="film-poster-small">ZAL / ОСОБЫЙ РАКУРС</span><h3>{film.title}</h3><span className="poster-arrow"><ArrowUpRight size={26}/></span></div>
            </Link>
            <div className="film-details"><div className="film-info"><span><Clock3 size={14}/>{film.duration_minutes} мин</span><span>от {money(Math.min(...options.map(s => s.price_from_minor)))}</span></div><div className="session-options">{options.map(session => <Link className="session-chip" key={session.id} to={'/sessions/' + session.id}><span>{sessionTime(session.starts_at, selectedCinema?.timezone)}</span><small>{sessionDate(session.starts_at, selectedCinema?.timezone)}</small><ArrowUpRight size={16}/></Link>)}<Link className="film-seat-link" to={'/sessions/' + options[0].id}>Выбрать место<ArrowRight size={16}/></Link></div></div>
          </article>;
        })}</div> : <EmptyState title="Новые сеансы уже скоро">Попробуйте выбрать другой кинотеатр.</EmptyState>}
      </div>
    </section>
    <section className="how-section" id="how-it-works" aria-labelledby="how-title"><div className="wrap how-layout">
      <div className="how-heading"><p className="eyebrow">СНАЧАЛА ПОСМОТРЕТЬ. ПОТОМ КУПИТЬ.</p><h2 id="how-title">Больше никаких<br/>«а вдруг<br/><span>неудобно?»</span></h2><p>Знакомая покупка билета.<br/>Один новый взгляд перед ней.</p><a href="#sessions" className="text-link">Найти своё место<MoveUpRight size={18}/></a></div>
      <div className="how-steps">
        <div className="how-step"><span className="step-num">01</span><div><span className="how-icon"><Ticket size={24}/></span><h3>Выберите свой вечер</h3><p>Кинотеатр, фильм и время.<br/>Всё начинается как обычно.</p></div><ArrowUpRight className="step-arrow" size={22}/></div>
        <div className="how-step"><span className="step-num">02</span><div><span className="how-icon"><Eye size={24}/></span><h3>Присядьте. Виртуально.</h3><p>Оцените экран с любого места.<br/>Сравните ракурсы и послушайте зал.</p></div><ArrowUpRight className="step-arrow" size={22}/></div>
        <div className="how-step"><span className="step-num">03</span><div><span className="how-icon"><ScanLine size={24}/></span><h3>Билет — и вы в кино</h3><p>Оплата по СБП. Билет с QR-кодом<br/>появится после подтверждения.</p></div><Check className="step-arrow" size={22}/></div>
      </div>
    </div></section>
    <section className="closing-section"><div className="wrap closing-inner"><p className="eyebrow">ВЕЧЕР, КОТОРЫЙ ВЫ ВЫБРАЛИ САМИ</p><h2>Кино большое.<br/>Место — <span>ваше.</span></h2><a className="button button--primary button--large" href="#sessions">Выбрать сеанс<ArrowUpRight size={20}/></a><span className="closing-ticket" aria-hidden="true"><Ticket size={120} strokeWidth={.7}/></span></div></section>
  </>;
}
