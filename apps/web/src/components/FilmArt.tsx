import { useId, useState } from 'react';

export default function FilmArt({ variant = 0, title, poster }: { variant?: number; title: string; poster?: string | null }) {
  const id = useId().replace(/:/g, '');
  const [failedPoster, setFailedPoster] = useState<string | null>(null);
  if (poster && poster !== failedPoster) return <img className="film-poster-image" src={poster} alt={'Постер фильма «' + title + '»'} loading="lazy" onError={() => setFailedPoster(poster)} />;
  return <svg className="film-art" viewBox="0 0 520 640" role="img" aria-label={'Авторская иллюстрация к фильму «' + title + '»'}>
    <defs>
      <linearGradient id={id + 'bg'} x2="0.8" y2="1"><stop stopColor={variant % 2 ? '#203b3e' : '#342217'}/><stop offset="1" stopColor="#070908"/></linearGradient>
      <radialGradient id={id + 'light'}><stop stopColor={variant % 2 ? '#b9cbb9' : '#ffb76a'}/><stop offset=".62" stopColor={variant % 2 ? '#617a74' : '#cf6235'}/><stop offset="1" stopColor={variant % 2 ? '#243d3e' : '#43241c'}/></radialGradient>
      <linearGradient id={id + 'fade'} x2="0" y2="1"><stop offset=".3" stopColor="#111" stopOpacity="0"/><stop offset="1" stopColor="#111" stopOpacity=".95"/></linearGradient>
      <filter id={id + 'glow'}><feGaussianBlur stdDeviation="20"/></filter>
    </defs>
    <rect width="520" height="640" fill={'url(#' + id + 'bg)'}/>
    {variant % 2 === 0 ? <>
      <circle cx="310" cy="240" r="152" fill="#e49a53" opacity=".15" filter={'url(#' + id + 'glow)'}/>
      <circle cx="310" cy="240" r="117" fill={'url(#' + id + 'light)'}/>
      <circle cx="334" cy="217" r="105" fill="#16130f"/>
      <ellipse cx="290" cy="250" rx="204" ry="26" transform="rotate(-26 290 250)" fill="none" stroke="#e8b28a" strokeWidth="2" opacity=".6"/>
      <ellipse cx="290" cy="250" rx="215" ry="31" transform="rotate(-26 290 250)" fill="none" stroke="#ae6f4e" strokeWidth=".7"/>
      {Array.from({ length: 30 }, (_, i) => <circle key={i} cx={(i * 97 + 22) % 520} cy={(i * 53 + 40) % 480} r={i % 5 === 0 ? 1.4 : .7} fill="#f7e6d1" opacity={.2 + (i % 4) * .12}/>)}
      <path d="M0 520 90 426 180 480 290 390 430 490 520 442V640H0Z" fill="#151612"/>
      <path d="M0 560 140 480 270 550 360 466 520 532V640H0Z" fill="#0a0c0b"/>
      <path d="M248 525v-18q8-20 16 0v18m-16-12h16m-9 12-3 17m9-17 3 17" stroke="#e3c9ab" strokeWidth="3" fill="none"/>
    </> : <>
      <circle cx="257" cy="188" r="94" fill={'url(#' + id + 'light)'} opacity=".8"/>
      <path d="M0 400V180h65v220h20V258h42v142h20V128h58v272h30V305h32v95h18V218h70v182h20V110h43v290h23V267h59v373H0Z" fill="#101e20"/>
      {Array.from({ length: 42 }, (_, i) => <rect key={i} x={(i * 37 + 20) % 500} y={240 + (i * 31) % 230} width="3" height="8" fill={i % 3 ? '#b49767' : '#bd7c49'} opacity=".6"/>)}
      <path d="M0 640 235 368h50L520 640" fill="#172223"/>
      <path d="m258 394-30 246m40-246 30 246" stroke="#bfa273" strokeWidth="1.5" opacity=".6"/>
      <path d="M0 480h520M0 520h520M0 575h520" stroke="#8ba09a" opacity=".08"/>
      <path d="M257 448v-27q6-16 12 0v27m-11-3-3 15m13-15 3 15" stroke="#d7b58b" strokeWidth="3"/>
    </>}
    <rect width="520" height="640" fill={'url(#' + id + 'fade)'}/>
  </svg>;
}
