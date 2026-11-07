import test from 'node:test';
import assert from 'node:assert/strict';
import { getMovieMedia, DEMO_TRAILER } from '../src/lib/catalogMedia.ts';

test('each catalog film resolves to its own identified video, never the calibration trailer', () => {
  const sources = new Set();
  const expected = {
    movie_orbit: ['960891136', 2014], movie_city: ['1288813671', 2017],
    movie_dune: ['1725365997', 2024], movie_inception: ['400763833', 2010],
    movie_batman: ['1606824145', 2022], movie_spiderverse: ['1688506685', 2023],
    movie_oppenheimer: ['1710495188', 2023], movie_insideout: ['1757560069', 2024],
  };
  for (const [id, [providerId, year]] of Object.entries(expected)) {
    const { trailer, year: actualYear } = getMovieMedia({ id, title: id });
    assert.equal(actualYear, year);
    assert.ok(trailer?.src.startsWith('https://video-ssl.itunes.apple.com/'));
    assert.ok(trailer.sourceUrl.includes(providerId), `${id}: expected provider ${providerId}`);
    assert.ok(trailer.title.startsWith(id));
    assert.ok(trailer.poster?.startsWith('https://is1-ssl.mzstatic.com/'));
    assert.notEqual(trailer.src, DEMO_TRAILER.src);
    sources.add(trailer.src);
  }
  assert.equal(sources.size, Object.keys(expected).length);
});

test('unknown films do not silently inherit an unrelated trailer', () => {
  assert.equal(getMovieMedia({ id: 'new-film', title: 'Новый фильм' }).trailer, undefined);
});
