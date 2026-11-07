import { useId, useState, type CSSProperties } from 'react';
import { AudioLines, ChevronDown, Headphones, LoaderCircle, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import type { CinemaMedia } from '../hooks/useCinemaMedia';
import '../styles/cinema-media.css';

const time = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

export default function CinemaMediaControls({ media, title, credit, sourceUrl, listeningLabel }: { media: CinemaMedia; title: string; credit?: string; sourceUrl?: string; listeningLabel: string }) {
  const [details, setDetails] = useState(false);
  const id = useId();
  const busy = media.starting || (media.playing && media.loading);
  const quiet = media.muted || media.volume === 0;
  return <section className="cinema-media-controls" aria-label="Трейлер и звук">
    <div className="cinema-media-heading"><div><span className="cinema-media-kicker">НА ЭКРАНЕ ЗАЛА</span><strong>{title}</strong></div><span className={'cinema-media-state' + (media.playing ? ' is-playing' : '')}><i />{busy ? 'Загружаем…' : media.playing ? media.sample ? 'Фрагмент · 10 сек' : 'Идёт трейлер' : media.ready ? 'Нажмите ▶ для просмотра' : 'Загружаем трейлер'}</span></div>
    {media.error && <div className="cinema-media-error" role="alert"><span>{media.error}</span><button type="button" onClick={media.retry}>Загрузить заново</button></div>}
    <div className="cinema-media-timeline"><span>{time(media.currentTime)}</span><input type="range" min="0" max={media.duration || 1} step="0.1" value={Math.min(media.currentTime, media.duration || 1)} disabled={!media.ready} onChange={(event) => media.seek(Number(event.target.value))} aria-label="Позиция в трейлере" aria-valuetext={`${time(media.currentTime)} из ${time(media.duration)}`} style={{ '--media-progress': `${media.duration ? media.currentTime / media.duration * 100 : 0}%` } as CSSProperties}/><span>{time(media.duration)}</span></div>
    <div className="cinema-media-transport">
      <button className="button button--primary cinema-media-play" onClick={media.toggle} disabled={media.starting || !media.videoElement} aria-label={media.playing ? 'Пауза трейлера' : 'Включить трейлер со звуком'}>
        {busy ? <LoaderCircle size={18} className="media-spin" aria-hidden="true"/> : media.playing ? <Pause size={18} fill="currentColor" aria-hidden="true"/> : <Play size={18} fill="currentColor" aria-hidden="true"/>}<span>{media.playing ? 'Пауза' : media.currentTime > 0 ? 'Продолжить' : 'Включить трейлер'}</span>
      </button>
      <button className="cinema-media-icon" onClick={media.replay} disabled={!media.ready} aria-label="Начать трейлер сначала" title="Начать сначала"><RotateCcw size={18} aria-hidden="true"/></button>
      <button className={'cinema-media-sample' + (media.sample && media.playing ? ' is-active' : '')} onClick={media.playSample} disabled={!media.ready || media.starting}><Headphones size={17} aria-hidden="true"/><span>Тест звука · 10 сек</span></button>
      <div className="cinema-media-volume"><button className="cinema-media-icon" onClick={media.toggleMute} aria-label={quiet ? 'Включить звук' : 'Выключить звук'} aria-pressed={quiet}>{quiet ? <VolumeX size={19} aria-hidden="true"/> : <Volume2 size={19} aria-hidden="true"/>}</button><label className="sr-only" htmlFor={id + '-volume'}>Громкость трейлера</label><input id={id + '-volume'} type="range" min="0" max="100" step="1" value={Math.round(media.volume * 100)} onChange={(event) => media.setVolume(Number(event.target.value) / 100)} style={{ '--media-progress': `${media.volume * 100}%` } as CSSProperties}/><span>{quiet ? '0' : Math.round(media.volume * 100)}%</span></div>
    </div>
    <div className="cinema-media-listening">
      <div className="cinema-media-listener"><Headphones size={16} aria-hidden="true"/><span>Слушаете: <strong>{listeningLabel}</strong></span></div>
      <div className="cinema-stereo-meters" aria-hidden="true"><span>L<i><b style={{ transform: `scaleX(${media.levels[0]})` }}/></i></span><span>R<i><b style={{ transform: `scaleX(${media.levels[1]})` }}/></i></span></div>
      <button className="cinema-media-details-button" onClick={() => setDetails((value) => !value)} aria-expanded={details} aria-controls={id + '-acoustics'}><AudioLines size={15} aria-hidden="true"/>Акустика места<ChevronDown size={14} className={details ? 'is-open' : ''} aria-hidden="true"/></button>
    </div>
    {details && <div className="cinema-acoustics" id={id + '-acoustics'}><div className="cinema-speaker-distances">{media.speakerMix.map((speaker, index) => <div key={speaker.id}><span>{speaker.id === 'left' ? 'Левая колонка' : speaker.id === 'right' ? 'Правая колонка' : `Колонка ${index + 1}`}</span><strong>{speaker.distance.toFixed(1)} <small>м</small></strong><i aria-hidden="true"><b style={{ width: `${Math.min(100, speaker.gain * media.speakerMix.length * 100)}%` }}/></i></div>)}</div><p>Звук настоящего трейлера меняет громкость и баланс по расстоянию до колонок. Это упрощённая модель акустики. Лучше слушать в наушниках.</p></div>}
    {credit && <p className="cinema-media-credit">{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer">{credit}</a> : credit}<span>·</span>Видеопревью выбранного фильма</p>}
  </section>;
}
