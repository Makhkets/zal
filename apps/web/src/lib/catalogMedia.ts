import type { Movie } from './types';

export interface CinemaTrailer { src: string; title: string; poster?: string; credit?: string }
export interface MovieMedia { year?: number; genres?: string[]; synopsis?: string; backdrop?: string; poster?: string; trailer?: CinemaTrailer }

/** Open-licensed screen example when a film has no own trailer. */
export const DEMO_TRAILER: CinemaTrailer = {
  src: '/media/trailers/sintel-trailer.mp4?v=2',
  title: 'Пример изображения на экране',
  poster: '/media/trailers/sintel-still.jpg?v=3',
  credit: 'Sintel © Blender Foundation · durian.blender.org · CC BY 3.0',
};
export const CINEMA_HERO = '/media/cinema-hero.jpg';

const screen = (title: string, poster: string, src: string, credit: string): CinemaTrailer => ({ src, title, poster, credit });
const elephants = '/api/v1/media/trailers/movie_orbit/stream';
const bunny = '/api/v1/media/trailers/movie_spiderverse/stream';
const sintel = '/api/v1/media/trailers/movie_inception/stream';
const tears = '/api/v1/media/trailers/movie_city/stream';

const media: Record<string, MovieMedia> = {
  movie_orbit: { year: 2014, genres: ['Фантастика', 'Драма'], synopsis: 'Путешествие за пределы Солнечной системы ради будущего человечества.', poster: '/media/posters/interstellar.jpg', trailer: screen('Интерстеллар', '/media/posters/interstellar.jpg', elephants, 'Открытый фильм Elephants Dream · Blender Foundation · CC BY 2.5') },
  movie_city: { year: 2017, genres: ['Фантастика', 'Триллер'], synopsis: 'Детективная история о памяти, человечности и тайне, способной изменить будущее.', poster: '/media/posters/blade-runner-2049.jpg', trailer: screen('Бегущий по лезвию 2049', '/media/posters/blade-runner-2049.jpg', tears, 'Открытый фильм Tears of Steel · Blender Institute · CC BY 3.0') },
  movie_dune: { year: 2024, genres: ['Фантастика', 'Приключения'], synopsis: 'Пол Атрейдес возвращается в пески Арракиса, где решается судьба целой вселенной.', poster: '/media/posters/dune-part-two.jpg', trailer: screen('Дюна: Часть вторая', '/media/posters/dune-part-two.jpg', bunny, 'Открытый фильм Big Buck Bunny · Blender Foundation · CC BY 3.0') },
  movie_inception: { year: 2010, genres: ['Фантастика', 'Триллер'], synopsis: 'Команда специалистов отправляется в мир сновидений, чтобы изменить одну идею.', poster: '/media/posters/inception.jpg', trailer: screen('Начало', '/media/posters/inception.jpg', sintel, 'Открытый фильм Sintel · Blender Foundation · CC BY 3.0') },
  movie_batman: { year: 2022, genres: ['Детектив', 'Боевик'], synopsis: 'Бэтмен идёт по следу загадочного преступника в дождливом Готэме.', poster: '/media/posters/the-batman.jpg', trailer: screen('Бэтмен', '/media/posters/the-batman.jpg', tears, 'Открытый фильм Tears of Steel · Blender Institute · CC BY 3.0') },
  movie_spiderverse: { year: 2023, genres: ['Анимация', 'Приключения'], synopsis: 'Майлз Моралес пересекает мультивселенную и встречает новых героев.', poster: '/media/posters/spider-verse.jpg', trailer: screen('Человек-паук: Паутина вселенных', '/media/posters/spider-verse.jpg', bunny, 'Открытый фильм Big Buck Bunny · Blender Foundation · CC BY 3.0') },
  movie_oppenheimer: { year: 2023, genres: ['Драма', 'Биография'], synopsis: 'История физика, чья работа изменила мир и его собственную жизнь.', poster: '/media/posters/oppenheimer.jpg', trailer: screen('Оппенгеймер', '/media/posters/oppenheimer.jpg', sintel, 'Открытый фильм Sintel · Blender Foundation · CC BY 3.0') },
  movie_insideout: { year: 2024, genres: ['Анимация', 'Семейное'], synopsis: 'В мире эмоций Райли появляются новые соседи — и новые правила.', poster: '/media/posters/inside-out-2.jpg', trailer: screen('Головоломка 2', '/media/posters/inside-out-2.jpg', elephants, 'Открытый фильм Elephants Dream · Blender Foundation · CC BY 2.5') },
};

export function getMovieMedia(movie: Movie): MovieMedia {
  return media[movie.id] ?? {};
}

export function screenTrailer(movie: Movie): CinemaTrailer {
  return getMovieMedia(movie).trailer ?? { ...DEMO_TRAILER, title: 'Пример изображения на экране' };
}
