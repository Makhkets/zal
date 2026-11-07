import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, Eye, Headphones, MapPin, Pause, Play, Search, X } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { useApp } from '../lib/AppContext';
import { api } from '../lib/api';
import { money, sessionDate, sessionTime } from '../lib/format';
import { CINEMA_HERO, DEMO_TRAILER, getMovieMedia } from '../lib/catalogMedia';
import type { Availability, Hall, Movie, Session } from '../lib/types';
import FilmArt from '../components/FilmArt';
import { EmptyState, ErrorState, Loading } from '../components/Feedback';
import '../styles/home-v2.css';

const CinemaScene = lazy(() => import('../components/CinemaScene'));
type Trailer = { src: string; title: string; poster?: string; credit?: string };

function TrailerDialog({ trailer, session, onClose }: { trailer: Trailer; session?: Session; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    const focused = document.activeElement as HTMLElement | null;
    const media = video.current;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    // Also restart after React's development effect cleanup; native controls remain the fallback.
    void media?.play().catch(() => {});
    return () => {
      media?.pause();
      element?.close();
      document.body.style.overflow = overflow;
      focused?.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={dialog} className="home-trailer-dialog" aria-labelledby="home-trailer-title" onCancel={onClose} onClick={event => { if (event.target === dialog.current) onClose(); }}>
    <div className="home-trailer-heading"><div><span>ТРЕЙЛЕР</span><h2 id="home-trailer-title">{trailer.title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Закрыть трейлер"><X size={22}/></button></div>
    {error ? <div className="home-trailer-error" role="alert"><p>Не получилось загрузить трейлер.</p><button className="button button--secondary" onClick={() => setError(false)}>Попробовать ещё раз</button></div> : <video ref={video} src={trailer.src} poster={trailer.poster} controls autoPlay playsInline preload="metadata" onError={() => setError(true)} aria-label={'Трейлер: ' + trailer.title}/>}
    {trailer.credit && <p className="home-trailer-credit">{trailer.credit}</p>}
    <div className="home-trailer-footer"><p><Headphones size={17}/>В 3D-зале можно послушать этот ролик с разных мест.</p>{session && <Link className="button button--primary" to={'/sessions/' + session.id} onClick={onClose}>Войти в зал<ArrowUpRight size={18}/></Link>}</div>
  </dialog>;
}

function FilmCard({ movie, sessions, timezone, onTrailer }: { movie: Movie; sessions: Session[]; timezone?: string; onTrailer: (trailer: Trailer, session: Session) => void }) {
  const media = getMovieMedia(movie);
  return <article className="reel-card">
    <div className="reel-poster">
      <Link className="reel-poster-link" to={'/sessions/' + sessions[0].id} aria-label={'Выбрать место на фильм «' + movie.title + '»'}>
        <FilmArt title={movie.title} poster={media?.poster || movie.poster_url}/>
        <span className="reel-poster-shade"/>
      </Link>
      {media?.trailer && <button className="reel-play" onClick={() => onTrailer(media.trailer!, sessions[0])} aria-label={'Смотреть трейлер «' + movie.title + '»'}><Play size={17} fill="currentColor"/></button>}
    </div>
    <div className="reel-caption"><h3><Link to={'/sessions/' + sessions[0].id}>{movie.title}</Link></h3><p>{media?.genres?.slice(0, 2).join(' · ') || 'Кино'}<span>·</span>{movie.duration_minutes} мин<span>·</span>{movie.age_rating}</p></div>
    <div className="reel-sessions">{sessions.slice(0, 3).map(session => <Link key={session.id} to={'/sessions/' + session.id} aria-label={movie.title + ', ' + sessionDate(session.starts_at, timezone) + ', ' + sessionTime(session.starts_at, timezone)}><strong>{sessionTime(session.starts_at, timezone)}</strong><span>{sessionDate(session.starts_at, timezone)}</span></Link>)}</div>
    <div className="reel-bottom"><span>от {money(Math.min(...sessions.map(session => session.price_from_minor)))}</span><Link to={'/sessions/' + sessions[0].id}><Eye size={14}/>Выбор места в 3D</Link></div>
  </article>;
}

export default function HomePage() {
  const { cinemas, loading: catalogLoading, error: catalogError, reload } = useApp();
  const [cinemaId, setCinemaId] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [hall, setHall] = useState<Hall | null>(null);
  const [availability, setAvailability] = useState<Availability>();
  const [previewPosition, setPreviewPosition] = useState<'front' | 'middle' | 'back'>('middle');
  const [genre, setGenre] = useState('Все фильмы');
  const [query, setQuery] = useState('');
  const [trailer, setTrailer] = useState<{ media: Trailer; session?: Session } | null>(null);
  const [heroPaused, setHeroPaused] = useState(false);
  const [page, setPage] = useState(0);
  const reduce = useReducedMotion();
  const selectedCinema = cinemas.find(cinema => cinema.id === cinemaId);

  useEffect(() => { if (cinemas.length && !cinemas.some(cinema => cinema.id === cinemaId)) setCinemaId(cinemas[0].id); }, [cinemas, cinemaId]);
  useEffect(() => {
    if (!cinemaId) return;
    const controller = new AbortController();
    setLoading(true); setError(''); setSessions([]); setHall(null); setAvailability(undefined); setGenre('Все фильмы');
    api.sessions(cinemaId, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      const future = data.items.filter(item => new Date(item.starts_at).getTime() > Date.now()).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
      setSessions(future);
      if (future[0]) void Promise.all([api.hall(future[0].hall_id, controller.signal), api.seats(future[0].id, controller.signal)])
        .then(([geometry, states]) => { if (!controller.signal.aborted) { setHall(geometry); setAvailability(states); } })
        .catch(() => {});
    }).catch((reason: Error) => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [cinemaId, version]);
  useEffect(() => { setPage(0); }, [genre, query, cinemaId]);

  const films = useMemo(() => Array.from(new Map(sessions.map(session => [session.movie.id, session.movie])).values()), [sessions]);
  const genres = useMemo(() => ['Все фильмы', ...new Set(films.flatMap(movie => getMovieMedia(movie)?.genres ?? []))], [films]);
  const visibleFilms = films.filter(movie => (genre === 'Все фильмы' || getMovieMedia(movie)?.genres?.includes(genre)) && movie.title.toLocaleLowerCase('ru-RU').includes(query.trim().toLocaleLowerCase('ru-RU')));
  const pageCount = Math.ceil(visibleFilms.length / 3);
  const shownFilms = visibleFilms.slice(Math.min(page, Math.max(0, pageCount - 1)) * 3, Math.min(page, Math.max(0, pageCount - 1)) * 3 + 3);
  const firstSession = sessions[0];
  const positions = [{ id: 'front', label: 'У экрана', row: 1, number: 3 }, { id: 'middle', label: 'В центре', row: 6, number: 12 }, { id: 'back', label: 'Подальше', row: 10, number: 7 }] as const;
  const position = positions.find(item => item.id === previewPosition)!;
  const previewSeat = hall?.seats.find(seat => seat.row === position.row && seat.number === position.number) ?? hall?.seats[0];
  const seatHref = firstSession ? '/sessions/' + firstSession.id + (previewSeat ? '?seat=' + encodeURIComponent(previewSeat.id) + '&preview=1' : '') : '#sessions';

  return <div className="home-v2">
    <section className="cinema-hero cinema-hero--split" aria-labelledby="cinema-hero-title">
      <div className="wrap hero-split-layout">
        <div className="cinema-hero-copy">
          <p className="cinema-hero-kicker"><span/>СНАЧАЛА — ВАШЕ МЕСТО</p>
          <h1 id="cinema-hero-title">Билет с видом<br/>на <em>ваше кино.</em></h1>
          <p>Примерьте кресло до покупки.<br/>Посмотрите на экран, включите трейлер<br className="cinema-desktop-break"/> и выберите свой лучший ракурс.</p>
          <div className="cinema-hero-actions"><a className="button button--primary" href="#sessions">Выбрать фильм<ArrowUpRight size={21}/></a><button className="cinema-hero-secondary" onClick={() => setTrailer({ media: DEMO_TRAILER, session: firstSession })} aria-label="Смотреть тестовый трейлер Sintel"><span><Play size={15} fill="currentColor"/></span>Смотреть трейлер</button></div>
          <div className="hero-benefits"><span><Eye size={15}/>Вид с любого кресла</span><span><Headphones size={15}/>Звук с вашего места</span></div>
        </div>
        <div className="hero-cinema-stage">
          <div className="hero-stage-top"><span><span/>ВАШ БУДУЩИЙ ВЕЧЕР</span><span>{hall ? hall.seats.length + ' места' : '3D-кинозал'}</span></div>
          <div className="hero-stage-scene">{hall ? <Suspense fallback={<Loading label="Зажигаем экран…"/>}><CinemaScene hall={hall} seat={previewSeat} availability={availability} videoPoster="/media/screen-still.jpg" overview paused={heroPaused || !!trailer || !!reduce}/></Suspense> : <img src={CINEMA_HERO} alt="Интерьер кинозала"/>}<div className="hero-stage-vignette"/></div>
          <div className="hero-stage-bottom"><button className="hero-stage-pause" aria-label={heroPaused || reduce ? 'Продолжить анимацию зала' : 'Остановить анимацию зала'} aria-pressed={heroPaused || !!reduce} disabled={!!reduce} onClick={() => setHeroPaused(value => !value)}>{heroPaused || reduce ? <Play size={14}/> : <Pause size={14}/>}</button><span>Зал, который можно почувствовать</span>{firstSession && <Link to={'/sessions/' + firstSession.id}>Войти в зал<ArrowUpRight size={18}/></Link>}</div>
        </div>
      </div>
    </section>

    <section className="reel-section" id="sessions" aria-labelledby="reel-title">
      <div className="wrap">
        <div className="reel-heading"><div><p className="reel-eyebrow">НА БОЛЬШОМ ЭКРАНЕ</p><h2 id="reel-title">Что посмотрим?</h2></div><div className="reel-cinema-control"><MapPin size={20}/><div><label htmlFor="cinema">Кинотеатр</label><select id="cinema" value={cinemaId} onChange={event => setCinemaId(event.target.value)} disabled={!cinemas.length}>{!cinemas.length && <option value="">Загружаем кинотеатры</option>}{cinemas.map(cinema => <option key={cinema.id} value={cinema.id}>{cinema.name}</option>)}</select></div><ChevronDown size={17}/></div></div>
        <div className="reel-toolbar"><div className="reel-filters" role="group" aria-label="Жанр фильма">{genres.map(item => <button key={item} onClick={() => setGenre(item)} aria-pressed={genre === item}>{item}</button>)}</div><label className="reel-search"><Search size={18}/><span className="sr-only">Найти фильм</span><input type="search" placeholder="Найти фильм" value={query} onChange={event => setQuery(event.target.value)}/>{query && <button onClick={() => setQuery('')} aria-label="Очистить поиск"><X size={16}/></button>}</label></div>
        <div className="reel-meta"><p><span/>{firstSession ? 'С ' + sessionDate(firstSession.starts_at, selectedCinema?.timezone) : 'Ближайшие сеансы'}<i/>Все места можно посмотреть в 3D</p><span>{visibleFilms.length} {visibleFilms.length === 1 ? 'фильм' : visibleFilms.length > 1 && visibleFilms.length < 5 ? 'фильма' : 'фильмов'}</span></div>
        {catalogError ? <ErrorState message={catalogError} onRetry={reload}/> : error ? <ErrorState message={error} onRetry={() => setVersion(value => value + 1)}/> : catalogLoading || loading ? <div className="reel-grid" aria-label="Загрузка фильмов" aria-busy="true">{[0, 1, 2].map(index => <div className="reel-skeleton" key={index}/>)}</div> : visibleFilms.length ? <div className="reel-grid">{shownFilms.map(movie => <FilmCard key={movie.id} movie={movie} sessions={sessions.filter(session => session.movie.id === movie.id)} timezone={selectedCinema?.timezone} onTrailer={(media, session) => setTrailer({ media, session })}/>)}</div> : films.length ? <EmptyState title="Не нашли такой фильм"><span>Попробуйте другой запрос или жанр.</span><button className="button button--secondary" onClick={() => { setQuery(''); setGenre('Все фильмы'); }}>Показать все фильмы</button></EmptyState> : <EmptyState title="Новые сеансы уже скоро">Выберите другой кинотеатр, чтобы посмотреть его афишу.</EmptyState>}
      </div>
    </section>

    {pageCount > 1 && <div className="reel-pagination wrap"><span>Подборка {page + 1} из {pageCount}</span><div><button aria-label="Предыдущие фильмы" onClick={() => setPage(value => Math.max(0, value - 1))} disabled={page === 0}><ArrowLeft size={19}/></button><button aria-label="Следующие фильмы" onClick={() => setPage(value => Math.min(pageCount - 1, value + 1))} disabled={page >= pageCount - 1}><ArrowRight size={19}/></button></div></div>}

    <section className="seat-discovery" id="how-it-works" aria-labelledby="discovery-title">
      <div className="wrap seat-discovery-inner"><div className="seat-discovery-copy"><p className="reel-eyebrow">ПЕРЕД ПОКУПКОЙ — ПРИСЯДЬТЕ</p><h2 id="discovery-title">У каждого места<br/>своё кино.</h2><p>Размер экрана. Расстояние до колонок.<br/>Зрители впереди. Проверьте всё,<br/>что меняет впечатление от сеанса.</p><div className="discovery-features"><span><Eye size={19}/>Настоящий вид из кресла</span><span><Headphones size={19}/>Звук с учётом расстояния</span><span><Check size={19}/>Сравнение двух ракурсов</span></div><Link className="button button--primary" to={seatHref}>Открыть этот ракурс<ArrowUpRight size={20}/></Link></div>
        <div className="seat-discovery-product"><div className="discovery-tabs" role="group" aria-label="Попробуйте разные места">{positions.map(item => <button key={item.id} aria-pressed={previewPosition === item.id} onClick={() => setPreviewPosition(item.id)}>{item.label}</button>)}</div><div className="discovery-scene">{hall && previewSeat ? <Suspense fallback={<Loading label="Открываем вид из кресла…"/>}><CinemaScene hall={hall} seat={previewSeat} availability={availability} videoPoster="/media/screen-still.jpg" paused={!!trailer}/></Suspense> : <div className="discovery-scene-fallback"><img src={CINEMA_HERO} alt="Интерьер кинозала" loading="lazy"/><Eye size={32}/></div>}<div className="discovery-seat-label"><Eye size={15}/>{previewSeat ? 'Ряд ' + previewSeat.row + ' · ' + (previewSeat.type === 'sofa' ? 'диван ' : 'место ') + previewSeat.number : 'Вид из кресла'}</div></div><div className="discovery-scene-footer"><span>Как будто вы уже в зале</span><Link to={seatHref}>Попробовать<ArrowUpRight size={17}/></Link></div></div>
      </div>
    </section>
    <div className="home-final-line wrap"><span>Хорошее кино начинается с хорошего места.</span><a href="#sessions">Выбрать своё<ArrowUpRight size={20}/></a></div>
    {trailer && <TrailerDialog trailer={trailer.media} session={trailer.session} onClose={() => setTrailer(null)}/>}
  </div>;
}
