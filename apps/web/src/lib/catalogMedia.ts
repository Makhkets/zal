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
const media: Record<string, MovieMedia> = {
  movie_orbit: { year: 2014, genres: ['Фантастика', 'Драма'], synopsis: 'Путешествие за пределы Солнечной системы ради будущего человечества.', poster: '/media/posters/interstellar.jpg', trailer: { src: '/media/trailers/sintel-trailer.mp4?v=2', title: 'Интерстеллар', poster: '/media/posters/interstellar.jpg', credit: 'Пример изображения на экране · Sintel © Blender Foundation · CC BY 3.0' } },
  movie_city: { year: 2017, genres: ['Фантастика', 'Триллер'], synopsis: 'Детективная история о памяти, человечности и тайне, способной изменить будущее.', poster: '/media/posters/blade-runner-2049.jpg', trailer: { src: '/media/trailers/sintel-trailer.mp4?v=2', title: 'Бегущий по лезвию 2049', poster: '/media/posters/blade-runner-2049.jpg', credit: 'Пример изображения на экране · Sintel © Blender Foundation · CC BY 3.0' } },
  movie_dune: { year: 2024, genres: ['Фантастика', 'Приключения'], synopsis: 'Пол Атрейдес возвращается в пески Арракиса, где решается судьба целой вселенной.', poster: '/media/posters/dune-part-two.jpg', trailer: { src: '/media/trailers/sintel-trailer.mp4?v=2', title: 'Дюна: Часть вторая', poster: '/media/posters/dune-part-two.jpg', credit: 'Пример изображения на экране · Sintel © Blender Foundation · CC BY 3.0' } },
  movie_inception: { year: 2010, genres: ['Фантастика', 'Триллер'], synopsis: 'Команда специалистов отправляется в мир сновидений, чтобы изменить одну идею.', poster: '/media/posters/inception.jpg', trailer: { src: '/media/trailers/sintel-trailer.mp4?v=2', title: 'Начало', poster: '/media/posters/inception.jpg', credit: 'Пример изображения на экране · Sintel © Blender Foundation · CC BY 3.0' } },
  movie_batman: { year: 2022, genres: ['Детектив', 'Боевик'], synopsis: 'Бэтмен идёт по следу загадочного преступника в дождливом Готэме.', poster: '/media/posters/the-batman.jpg', trailer: { src: '/media/trailers/sintel-trailer.mp4?v=2', title: 'Бэтмен', poster: '/media/posters/the-batman.jpg', credit: 'Пример изображения на экране · Sintel © Blender Foundation · CC BY 3.0' } },
  movie_spiderverse: { year: 2023, genres: ['Анимация', 'Приключения'], synopsis: 'Майлз Моралес пересекает мультивселенную и встречает новых героев.', poster: '/media/posters/spider-verse.jpg', trailer: { src: '/media/trailers/sintel-trailer.mp4?v=2', title: 'Человек-паук: Паутина вселенных', poster: '/media/posters/spider-verse.jpg', credit: 'Пример изображения на экране · Sintel © Blender Foundation · CC BY 3.0' } },
  movie_oppenheimer: { year: 2023, genres: ['Драма', 'Биография'], synopsis: 'История физика, чья работа изменила мир и его собственную жизнь.', poster: '/media/posters/oppenheimer.jpg', trailer: { src: '/media/trailers/sintel-trailer.mp4?v=2', title: 'Оппенгеймер', poster: '/media/posters/oppenheimer.jpg', credit: 'Пример изображения на экране · Sintel © Blender Foundation · CC BY 3.0' } },
  movie_insideout: { year: 2024, genres: ['Анимация', 'Семейное'], synopsis: 'В мире эмоций Райли появляются новые соседи — и новые правила.', poster: '/media/posters/inside-out-2.jpg', trailer: { src: '/media/trailers/sintel-trailer.mp4?v=2', title: 'Головоломка 2', poster: '/media/posters/inside-out-2.jpg', credit: 'Пример изображения на экране · Sintel © Blender Foundation · CC BY 3.0' } },
};

export function getMovieMedia(movie: Movie): MovieMedia {
  // Unknown backend films still render using their server-provided poster.
  return media[movie.id] ?? {};
}

export function screenTrailer(movie: Movie): CinemaTrailer {
  return getMovieMedia(movie).trailer ?? { ...DEMO_TRAILER, title: 'Пример изображения на экране' };
}
