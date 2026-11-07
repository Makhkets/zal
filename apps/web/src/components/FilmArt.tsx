import { useState } from 'react';
import { Clapperboard } from 'lucide-react';

/** Use the film's real key art; a failed asset never turns into a made-up poster. */
export default function FilmArt({ title, poster }: { variant?: number; title: string; poster?: string | null }) {
  const [failedPoster, setFailedPoster] = useState<string | null>(null);
  if (poster && poster !== failedPoster) return <img className="film-poster-image" src={poster} alt={'Постер фильма «' + title + '»'} loading="lazy" decoding="async" onError={() => setFailedPoster(poster)} />;
  return <div className="film-poster-fallback" role="img" aria-label={'Фильм «' + title + '». Постер недоступен'}><Clapperboard size={34} strokeWidth={1}/><strong>{title}</strong><span>Постер скоро появится</span></div>;
}
