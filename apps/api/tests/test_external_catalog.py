"""Apple adapter checks: no network, catalogue writes or payments."""
import asyncio
from dataclasses import replace
from pathlib import Path
import tempfile
import unittest
import httpx
from app.errors import AppError
from app.config import Settings
from app.db.connection import Database
from app.db.migrations import run_migrations
from app.db.seed import seed_from_fixtures
from app.repositories.catalog_repo import CatalogRepository
from app.services.cinema_media_service import CinemaMediaService

FILM = {
    "kind": "feature-movie", "trackId": 960891136, "trackName": "Interstellar",
    "artistName": "Christopher Nolan", "releaseDate": "2014-11-07T08:00:00Z",
    "trackTimeMillis": 10140000, "primaryGenreName": "Sci-Fi & Fantasy",
    "trackViewUrl": "https://itunes.apple.com/us/movie/interstellar/id960891136",
    "artworkUrl100": "https://is1-ssl.mzstatic.com/image/thumb/movie/100x100bb.jpg",
    "previewUrl": "https://video-ssl.itunes.apple.com/film-preview.m4v",
    "longDescription": "A journey through space.", "contentAdvisoryRating": "PG-13",
}

class ExternalCatalogTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.settings = Settings(database_path=Path(self.tmp.name) / "catalog.db", enable_external_media_network=True)
        self.db = Database(self.settings.database_path)
        run_migrations(self.db)
        self.requests, self.status, self.payload = [], 200, {"results": [FILM]}
        async def transport(request):
            self.requests.append(request)
            await asyncio.sleep(0)
            return httpx.Response(self.status, json=self.payload)
        self.client = httpx.AsyncClient(transport=httpx.MockTransport(transport))
        self.addAsyncCleanup(self.client.aclose)
        self.service = self.make_service(self.settings)
    def make_service(self, settings):
        return CinemaMediaService(db=self.db, settings=settings, catalog_repo=CatalogRepository(self.db), http_client=self.client)
    async def test_real_movies_deduplicated_with_exact_preview_and_source(self):
        self.payload = {"results": [FILM, {"kind": "song", "trackName": "song"}, FILM]}
        result = await self.service.search_external_catalog("Interstellar")
        self.assertEqual((result.status, len(result.items)), ("ok", 1))
        movie = result.items[0]
        self.assertEqual((movie.title, movie.duration_minutes, movie.year), ("Interstellar", 169, 2014))
        self.assertEqual(movie.playable_trailer_stream_url, FILM["previewUrl"])
        self.assertEqual(movie.source_url, FILM["trackViewUrl"])
        self.assertTrue(movie.poster_url.endswith("/400x600bb.jpg"))
        self.assertEqual(self.requests[0].url.host, "itunes.apple.com")
        self.assertEqual(self.requests[0].url.params["country"], "US")
        with self.db.read_connection() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0], 0)
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM movies").fetchone()[0], 0)
    async def test_empty_search_stays_empty_without_curated_fallback(self):
        self.payload = {"results": []}
        result = await self.service.search_external_catalog("nothing here")
        self.assertEqual((result.status, result.items), ("ok", []))
        await self.service.search_external_catalog("nothing here")
        self.assertEqual(len(self.requests), 1)
    async def test_russian_alias_and_concurrent_search_share_cache(self):
        left, right = await asyncio.gather(self.service.search_external_catalog("Интерстеллар"), self.service.search_external_catalog("Interstellar"))
        self.assertEqual(len(self.requests), 1)
        self.assertEqual(self.requests[0].url.params["term"], "Interstellar")
        self.assertEqual((left.query, right.query), ("Интерстеллар", "Interstellar"))
    async def test_disabled_network_never_calls_provider(self):
        service = self.make_service(replace(self.settings, enable_external_media_network=False))
        result = await service.search_external_catalog("Dune")
        self.assertEqual((result.status, result.items), ("disabled", []))
        self.assertEqual(len(self.requests), 0)
    async def test_failure_not_cached_as_empty_success(self):
        self.status = 503
        self.assertEqual((await self.service.search_external_catalog("Dune")).status, "unavailable")
        self.status = 200
        self.assertEqual((await self.service.search_external_catalog("Dune")).status, "ok")
        self.assertEqual(len(self.requests), 2)
    async def test_untrusted_urls_not_exposed(self):
        self.payload = {"results": [{**FILM, "trackId": 1, "trackViewUrl": "javascript:alert(1)"}, {**FILM, "trackId": 2, "previewUrl": "https://itunes.apple.com.evil.test/preview.m4v", "artworkUrl100": "http://127.0.0.1/private"}]}
        result = await self.service.search_external_catalog("Dune")
        self.assertEqual(len(result.items), 1)
        self.assertIsNone(result.items[0].playable_trailer_stream_url)
        self.assertIsNone(result.items[0].poster_url)
    async def test_shared_provider_budget(self):
        for i in range(18):
            self.assertEqual((await self.service.search_external_catalog("movie " + str(i))).status, "ok")
        self.assertEqual((await self.service.search_external_catalog("nineteenth movie")).status, "rate_limited")
        self.assertEqual(len(self.requests), 18)

    async def test_unbound_feature_never_inherits_another_films_trailer(self):
        with self.db.immediate_transaction() as conn:
            conn.execute("INSERT INTO movies (id, title, duration_minutes, age_rating) VALUES (?, ?, ?, ?)", ("movie_orbit", "Интерстеллар", 169, "12+"))
        with self.assertRaises(AppError) as caught:
            self.service.get_movie_trailer("movie_orbit")
        self.assertEqual(caught.exception.status_code, 404)
        with self.assertRaises(AppError):
            await self.service.get_movie_enrichment("movie_orbit")
        trailers = self.service.list_trailers().items
        self.assertTrue(trailers)
        self.assertNotIn("movie_orbit", [trailer.movie_id for trailer in trailers])
        self.assertEqual(self.service.get_movie_trailer("movie_nord").original_film_title, "Sintel")

    async def test_audio_profile_explicitly_uses_calibration_reel(self):
        seed_from_fixtures(self.db, self.settings.fixtures_dir)
        with self.db.read_connection() as conn:
            row = conn.execute("SELECT session_id, seat_id FROM session_seats LIMIT 1").fetchone()
        profile = self.service.compute_seat_audio_dsp(row["session_id"], row["seat_id"])
        self.assertEqual(profile.recommended_trailer_title, "Тестовый ролик · Sintel")
        self.assertIn("/movie_nord/stream", profile.recommended_trailer_stream_url)
