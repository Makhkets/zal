import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Clapperboard, LoaderCircle, Play, Search, X } from 'lucide-react';
import { searchExternalMovies, type ExternalMovie, type ExternalSearchResult } from '../lib/externalMedia';
import '../styles/external-catalog.css';

function StoreLink({ movie }: { movie: ExternalMovie }) {
  return movie.source_url ? <a className="external-store-link" href={movie.source_url} target="_blank" rel="noopener noreferrer" aria-label={'Открыть «' + movie.title + '» в iTunes, новая вкладка'}><img src="/media/itunes-badge.png" width="138" height="40" alt="Get it on iTunes"/></a> : null;
}
function Poster({ movie }: { movie: ExternalMovie }) {
  const [failed, setFailed] = useState(false);
  return movie.poster_url && !failed ? <img src={movie.poster_url} alt={'Постер «' + movie.title + '»'} loading="lazy" decoding="async" onError={() => setFailed(true)}/> : <span className="external-poster-fallback"><Clapperboard size={24}/></span>;
}
function MovieDetails({ movie, play, onClose }: { movie: ExternalMovie; play: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const media = useRef<HTMLVideoElement>(null);
  const [videoError, setVideoError] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    const video = media.current;
    const focused = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    if (play) void video?.play().catch(() => {});
    return () => { video?.pause(); element?.close(); document.body.style.overflow = overflow; focused?.focus({ preventScroll: true }); };
  }, [play]);
  return <dialog className="external-dialog" ref={dialog} aria-labelledby="external-film-title" onCancel={onClose} onClick={event => { if (event.target === dialog.current) onClose(); }}>
    <header><div><span>APPLE ITUNES · КАТАЛОГ США</span><h2 id="external-film-title">{movie.title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Закрыть информацию о фильме"><X size={22}/></button></header>
    {movie.playable_trailer_stream_url && !videoError ? <video ref={media} src={movie.playable_trailer_stream_url} controls playsInline preload="metadata" onError={() => setVideoError(true)} aria-label={'Трейлер «' + movie.title + '» из iTunes'}/> : videoError ? <p className="external-video-error" role="status">Трейлер сейчас недоступен. Страницу фильма можно открыть в iTunes.</p> : null}
    <div className="external-details-copy"><p className="external-film-meta">{[movie.year, movie.genre, movie.duration_minutes ? movie.duration_minutes + ' мин' : null, movie.content_rating].filter(Boolean).join(' · ')}</p>{movie.cast_summary && <p className="external-creator">{movie.cast_summary}</p>}{movie.description && <p className="external-description">{movie.description}</p>}<footer><div><p>Данные и видеопревью предоставлены iTunes.</p><span>Доступность фильма зависит от региона магазина.</span></div><StoreLink movie={movie}/></footer></div>
  </dialog>;
}

export default function ExternalCatalog() {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('Дюна');
  const [search, setSearch] = useState('');
  const [result, setResult] = useState<ExternalSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [page, setPage] = useState(0);
  const [details, setDetails] = useState<{ movie: ExternalMovie; play: boolean } | null>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!expanded || !search) return;
    const controller = new AbortController();
    setLoading(true); setError(''); setResult(null); setPage(0);
    searchExternalMovies(search, controller.signal).then(data => { if (!controller.signal.aborted) setResult(data); })
      .catch((reason: Error) => { if (!controller.signal.aborted) setError(reason.name === 'TimeoutError' ? 'Каталог отвечает дольше обычного. Попробуйте ещё раз.' : reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [expanded, search, version]);
  function runSearch(event?: FormEvent) {
    event?.preventDefault();
    const cleaned = query.trim();
    if (cleaned.length < 2) { setError('Введите хотя бы два символа.'); return; }
    setSearch(cleaned); setVersion(value => value + 1);
  }
  function open() { setExpanded(true); setSearch(query); requestAnimationFrame(() => form.current?.querySelector('input')?.focus({ preventScroll: true })); }
  const pageCount = Math.ceil((result?.items.length ?? 0) / 3);
  const shown = result?.items.slice(page * 3, page * 3 + 3) ?? [];
  return <section className="external-catalog" aria-labelledby="external-catalog-title"><div className="wrap">
    <div className="external-heading"><div><p className="reel-eyebrow">ЗА ПРЕДЕЛАМИ АФИШИ</p><h2 id="external-catalog-title">Фильмы и трейлеры.</h2><p>Ищите по названию или режиссёру. Открывайте фильм в iTunes.</p></div>{!expanded && <button className="button button--secondary" onClick={open} aria-expanded={false} aria-controls="external-search-panel"><Search size={18}/>Открыть каталог<ArrowUpRight size={18}/></button>}</div>
    {expanded && <div id="external-search-panel" className="external-search-panel">
      <form className="external-search-form" ref={form} onSubmit={runSearch}><label><Search size={20}/><span className="sr-only">Название или режиссёр во внешнем каталоге</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} minLength={2} maxLength={120} placeholder="Например, Dune или Nolan" required/></label><button type="submit" className="button button--primary" disabled={loading}>{loading ? <LoaderCircle className="external-spinner" size={18}/> : <ArrowRight size={18}/>}Найти</button></form>
      <div className="external-suggestions"><span>Попробуйте:</span>{['Интерстеллар', 'Дюна', 'Нолан'].map(term => <button key={term} type="button" onClick={() => { setQuery(term); setSearch(term); setVersion(value => value + 1); }} disabled={loading}>{term}</button>)}<span className="external-source-label">Apple iTunes · США</span></div>
      <div className="external-result-status" role="status" aria-live="polite">{loading ? 'Ищем фильмы…' : error ? error : result?.status !== 'ok' ? result?.notice : result && !result.items.length ? 'Фильмы не найдены. Попробуйте оригинальное название или фамилию режиссёра.' : result ? 'Найдено фильмов: ' + result.items.length : ''}</div>
      {(error || (result && result.status !== 'ok')) && <button className="external-retry" onClick={() => setVersion(value => value + 1)}>Попробовать ещё раз<ArrowRight size={16}/></button>}
      {loading && <div className="external-results" aria-hidden="true">{[0, 1, 2].map(index => <div className="external-skeleton" key={index}/>)}</div>}
      {!!shown.length && <div className="external-results">{shown.map(movie => <article className="external-movie" key={movie.external_id}><button className="external-poster" onClick={() => setDetails({ movie, play: false })} aria-label={'Информация о фильме «' + movie.title + '»'}><Poster movie={movie}/></button><div className="external-movie-copy"><p>{[movie.year, movie.duration_minutes ? movie.duration_minutes + ' мин' : null].filter(Boolean).join(' · ')}</p><h3><button onClick={() => setDetails({ movie, play: false })}>{movie.title}</button></h3><span>{movie.genre || movie.cast_summary}</span>{movie.playable_trailer_stream_url && <button className="external-preview" onClick={() => setDetails({ movie, play: true })}><Play size={13} fill="currentColor"/>Трейлер</button>}<StoreLink movie={movie}/></div></article>)}</div>}
      {pageCount > 1 && <div className="external-pagination"><span>{page + 1} / {pageCount}</span><button aria-label="Предыдущие фильмы из iTunes" disabled={page === 0} onClick={() => setPage(value => value - 1)}><ArrowLeft size={18}/></button><button aria-label="Следующие фильмы из iTunes" disabled={page === pageCount - 1} onClick={() => setPage(value => value + 1)}><ArrowRight size={18}/></button></div>}
      <p className="external-footnote">Каталог для знакомства с фильмами. Сеансы ZAL — в афише выше. Названия и описания источника могут быть на английском.</p>
    </div>}
    {details && <MovieDetails movie={details.movie} play={details.play} onClose={() => setDetails(null)}/>}
  </div></section>;
}
