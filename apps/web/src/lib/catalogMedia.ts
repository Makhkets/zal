import type { Movie } from './types';

export interface CinemaTrailer { src: string; title: string; poster?: string; credit?: string; sourceUrl?: string }
export interface MovieMedia { year?: number; genres?: string[]; synopsis?: string; backdrop?: string; poster?: string; trailer?: CinemaTrailer }

/** Open-licensed calibration trailer, explicitly separate from the booked feature. */
export const DEMO_TRAILER: CinemaTrailer = {
  src: '/media/trailers/sintel-trailer.mp4?v=2',
  title: 'Sintel — тестовый трейлер',
  poster: '/media/trailers/sintel-still.jpg?v=3',
  credit: 'Sintel © Blender Foundation · durian.blender.org · CC BY 3.0',
};
export const CINEMA_HERO = '/media/cinema-hero.jpg';
// Exact film and release-year matches, verified against Apple TV on 2026-11-07.
const trailers: Record<string, CinemaTrailer> = {
  "movie_orbit": {
    "src": "https://video-ssl.itunes.apple.com/itunes-assets/Video111/v4/54/b7/37/54b737f0-63c2-77ed-44b3-4f7e2d34f386/mzvf_806821658861734960.640x354.h264lc.U.p.m4v",
    "title": "Interstellar — видеопревью",
    "sourceUrl": "https://itunes.apple.com/us/movie/interstellar/id960891136?uo=4",
    "credit": "Apple TV · Interstellar (2014)",
    "poster": "https://is1-ssl.mzstatic.com/image/thumb/Video123/v4/b7/12/48/b712487a-aa8c-09bd-4353-433b2da80aa0/PAR_INTERSTELLAR_WW_ARTWORK_EN_3840x2160_1MDPJX000000CH.lsr/1280x720.jpg"
  },
  "movie_dune": {
    "src": "https://video-ssl.itunes.apple.com/itunes-assets/Video126/v4/63/8a/25/638a25e9-67b7-241f-3604-1e1167db8d8a/mzvf_15647338716229668008.640x450.h264lc.U.p.m4v",
    "title": "Dune: Part Two — видеопревью",
    "sourceUrl": "https://itunes.apple.com/us/movie/dune-part-two/id1725365997?uo=4",
    "credit": "Apple TV · Dune: Part Two (2024)",
    "poster": "https://is1-ssl.mzstatic.com/image/thumb/Video211/v4/78/b1/52/78b15200-df9f-624c-75b9-d586d9801c9c/cd6db9a4-7489-4ea3-a5c6-012d3512a3e0_DUNE_PART2_H_DD_KA_TT_CVRART_3840x2160_300dpi_EN-p3.lsr/1280x720.jpg"
  },
  "movie_batman": {
    "src": "https://video-ssl.itunes.apple.com/itunes-assets/Video126/v4/5a/be/1c/5abe1cca-8045-8243-ce9b-135dc3ddbac2/mzvf_17557480539273521219.640x356.h264lc.U.p.m4v",
    "title": "The Batman — видеопревью",
    "sourceUrl": "https://itunes.apple.com/us/movie/the-batman/id1606824145?uo=4",
    "credit": "Apple TV · The Batman (2022)",
    "poster": "https://is1-ssl.mzstatic.com/image/thumb/Video126/v4/ef/39/c3/ef39c312-2ab2-f244-1fe4-400140928ad1/pr_source.lsr/1280x720.jpg"
  },
  "movie_spiderverse": {
    "src": "https://video-ssl.itunes.apple.com/itunes-assets/Video126/v4/24/ca/41/24ca41ac-d116-30da-b0d4-6c02477b6094/mzvf_3996586131801090583.640x354.h264lc.U.p.m4v",
    "title": "Spider-Man: Across the Spider-Verse — видеопревью",
    "sourceUrl": "https://itunes.apple.com/us/movie/spider-man-across-the-spider-verse/id1688506685?uo=4",
    "credit": "Apple TV · Spider-Man: Across the Spider-Verse (2023)",
    "poster": "https://is1-ssl.mzstatic.com/image/thumb/Video221/v4/76/7b/08/767b08d5-b65f-2537-9a97-2c642138a3b4/DP_10232694_SPIDER-MANACROSSTHESPIDER-VERSE_3840x2160_PURPLEHUEKeyArt.jpg/1280x720.jpg"
  },
  "movie_city": {
    "src": "https://video-ssl.itunes.apple.com/itunes-assets/Video118/v4/c1/50/a4/c150a48d-a025-9326-9ab0-557031ce4891/mzvf_5206956947050818113.640x354.h264lc.U.p.m4v",
    "title": "Blade Runner 2049 — видеопревью",
    "sourceUrl": "https://itunes.apple.com/us/movie/blade-runner-2049/id1288813671?uo=4",
    "credit": "Apple TV · Blade Runner 2049 (2017)",
    "poster": "https://is1-ssl.mzstatic.com/image/thumb/K_eocWIGYMIAREa8wP3NbQ/1280x720.jpg"
  },
  "movie_inception": {
    "src": "https://video-ssl.itunes.apple.com/itunes-assets/Video117/v4/37/15/e0/3715e067-3886-70eb-c34c-6ae2189ec91f/mzvf_7105735405365380478.640x356.h264lc.U.p.m4v",
    "title": "Inception — видеопревью",
    "sourceUrl": "https://itunes.apple.com/us/movie/inception/id400763833?uo=4",
    "credit": "Apple TV · Inception (2010)",
    "poster": "https://is1-ssl.mzstatic.com/image/thumb/Video114/v4/e7/82/10/e78210ee-606a-14f2-8a04-d568c4e6368e/pr_source.lsr/1280x720.jpg"
  },
  "movie_insideout": {
    "src": "https://video-ssl.itunes.apple.com/itunes-assets/Video221/v4/f9/65/f1/f965f157-2f1f-152b-5c85-0082b7257274/mzvf_11650727971082496645.640x356.h264lc.U.p.m4v",
    "title": "Inside Out 2 — видеопревью",
    "sourceUrl": "https://itunes.apple.com/us/movie/inside-out-2/id1757560069?uo=4",
    "credit": "Apple TV · Inside Out 2 (2024)",
    "poster": "https://is1-ssl.mzstatic.com/image/thumb/Video211/v4/5d/8b/ee/5d8beeb8-1dc6-7a67-128c-7b44972eb7e1/DIS_INSIDE_OUT_2_TH_ITUNES_ARTWORK_169_WW_ARTWORK_EN_3840x2160_4FCCEU00000AYS-R1.lsr/1280x720.jpg"
  },
  "movie_oppenheimer": {
    "src": "https://video-ssl.itunes.apple.com/itunes-assets/Video126/v4/d4/04/b1/d404b15c-a1f6-288f-0ac7-7ebb1033fdb0/mzvf_18263202868535868733.640x386.h264lc.U.p.m4v",
    "title": "Oppenheimer — видеопревью",
    "sourceUrl": "https://itunes.apple.com/us/movie/oppenheimer/id1710495188?uo=4",
    "credit": "Apple TV · Oppenheimer (2023)",
    "poster": "https://is1-ssl.mzstatic.com/image/thumb/Video116/v4/b2/b1/fa/b2b1fae3-d240-c528-e2ce-8b8bfbfa7806/UNI_OPPENHEIMER_TH_ITUNES_MLNA_WW_ARTWORK_EN_3840x2160_41H6TS000000WR.lsr/1280x720.jpg"
  }
};
const media: Record<string, MovieMedia> = {
  movie_orbit: { year: 2014, genres: ['Фантастика', 'Драма'], synopsis: 'Путешествие за пределы Солнечной системы ради будущего человечества.', poster: '/media/posters/interstellar.jpg' },
  movie_city: { year: 2017, genres: ['Фантастика', 'Триллер'], synopsis: 'Детективная история о памяти, человечности и тайне, способной изменить будущее.', poster: '/media/posters/blade-runner-2049.jpg' },
  movie_dune: { year: 2024, genres: ['Фантастика', 'Приключения'], synopsis: 'Пол Атрейдес возвращается в пески Арракиса, где решается судьба целой вселенной.', poster: '/media/posters/dune-part-two.jpg' },
  movie_inception: { year: 2010, genres: ['Фантастика', 'Триллер'], synopsis: 'Команда специалистов отправляется в мир сновидений, чтобы изменить одну идею.', poster: '/media/posters/inception.jpg' },
  movie_batman: { year: 2022, genres: ['Детектив', 'Боевик'], synopsis: 'Бэтмен идёт по следу загадочного преступника в дождливом Готэме.', poster: '/media/posters/the-batman.jpg' },
  movie_spiderverse: { year: 2023, genres: ['Анимация', 'Приключения'], synopsis: 'Майлз Моралес пересекает мультивселенную и встречает новых героев.', poster: '/media/posters/spider-verse.jpg' },
  movie_oppenheimer: { year: 2023, genres: ['Драма', 'Биография'], synopsis: 'История физика, чья работа изменила мир и его собственную жизнь.', poster: '/media/posters/oppenheimer.jpg' },
  movie_insideout: { year: 2024, genres: ['Анимация', 'Семейное'], synopsis: 'В мире эмоций Райли появляются новые соседи — и новые правила.', poster: '/media/posters/inside-out-2.jpg' },
};
export function getMovieMedia(movie: Movie): MovieMedia {
  // Unknown backend films still render using their server-provided poster.
  const item = media[movie.id];
  if (!item) return {};
  const trailer = trailers[movie.id];
  return { ...item, trailer: trailer ? { ...trailer, title: `${movie.title} — видеопревью`, poster: trailer.poster ?? item.poster } : undefined };
}
