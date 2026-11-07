import type { Movie } from './types';

export interface CinemaTrailer { src: string; title: string; poster?: string; credit?: string }
export interface MovieMedia { year?: number; genres?: string[]; synopsis?: string; backdrop?: string; poster?: string; trailer?: CinemaTrailer }

/** Open-licensed calibration trailer, explicitly separate from the booked feature. */
export const DEMO_TRAILER: CinemaTrailer = {
  src: '/media/trailers/sintel-trailer.mp4?v=2',
  title: 'Sintel — тестовый трейлер',
  poster: '/media/trailers/sintel-still.jpg?v=3',
  credit: 'Sintel © Blender Foundation · durian.blender.org · CC BY 3.0',
};
export const CINEMA_HERO = '/media/cinema-hero.jpg';
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
  return media[movie.id] ?? {};
}
