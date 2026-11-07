"""External Apple movie discovery and explicit open-film media assets.

The read-only catalog uses the official, keyless Apple iTunes Search API.
Artwork and preview URLs are attributed to Apple; media is streamed by the browser.
Legacy enrichment is limited to explicitly bound open-film presets. Network access
is optional, and availability in any particular country is not guaranteed.
"""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from datetime import datetime, timedelta
import hashlib
import html
import json
import math
import re
from typing import Any
from urllib.parse import quote, urlsplit
import uuid

from fastapi.responses import Response, StreamingResponse
import httpx

from app.config import Settings
from app.db.connection import Database, to_iso_utc, utc_now, utc_now_iso
from app.domain.cyber_models import (
    ExternalCatalogSearchResponse,
    ExternalMovieCatalogItem,
    ImportExternalSessionRequest,
    ImportExternalSessionResponse,
    MovieEnrichmentResponse,
    MovieTrailerAsset,
    PlatformRatingBadge,
    RealAudienceReview,
    SeatWebAudioDSPProfile,
    TrailerCatalogResponse,
    TrailerCuePoint,
)
from app.errors import not_found_error, validation_error
from app.repositories.catalog_repo import CatalogRepository
from app.security import SlidingWindowRateLimiter

SPEED_OF_SOUND_M_S = 343.0
USER_AGENT = "ZAL-Cinema-3D/1.0 (+https://github.com/Makhkets/zal)"

CURATED_OPEN_TRAILERS: dict[str, dict[str, Any]] = {
    "movie_orbit": {
        "trailer_id": "elephants_dream",
        "original_film_title": "Elephants Dream",
        "letterboxd_slug": "elephants-dream",
        "archive_id": "ElephantsDream",
        "wiki_ru_title": "Elephants Dream",
        "subtitle_ru": "Открытый фантастический фильм для экрана зала",
        "license": "CC BY 2.5 · Blender Foundation",
        "duration_seconds": 654,
        "aspect_ratio": 1.85,
        "direct_mp4_url": "https://archive.org/download/ElephantsDream/ed_1024_512kb.mp4",
        "poster_url": "https://archive.org/download/ElephantsDream/__ia_thumb.jpg",
        "default_start_sec": 20.0,
        "genres": ["фантастика", "драма"],
        "director": "Бас Мент",
        "year": 2006,
        "synopsis_fallback_ru": "Двое исследователей идут по странной машине, которая кажется живой.",
        "cue_points": [TrailerCuePoint(label_ru="Вход в машину", timestamp_sec=20.0, acoustic_focus="wide_ambience", description_ru="Пространственный гул и эхо.")],
    },
    "movie_city": {
        "trailer_id": "tears_of_steel_hd",
        "original_film_title": "Tears of Steel",
        "letterboxd_slug": "tears-of-steel",
        "archive_id": "Tears-of-Steel",
        "wiki_ru_title": "Слёзы стали",
        "subtitle_ru": "Научно-фантастический открытый фильм",
        "license": "CC BY 3.0 · Blender Institute",
        "duration_seconds": 734,
        "aspect_ratio": 2.40,
        "direct_mp4_url": "https://archive.org/download/Tears-of-Steel/tears_of_steel_720p.mp4",
        "poster_url": "https://archive.org/download/Tears-of-Steel/__ia_thumb.jpg",
        "default_start_sec": 38.0,
        "genres": ["фантастика", "триллер"],
        "director": "Иэн Хьюберт",
        "year": 2012,
        "synopsis_fallback_ru": "Под куполом будущего группа пытается остановить катастрофу.",
        "cue_points": [TrailerCuePoint(label_ru="Ночной город", timestamp_sec=38.0, acoustic_focus="dialogue_center", description_ru="Речь на фоне города.")],
    },
    "movie_dune": {
        "trailer_id": "cosmos_laundromat",
        "original_film_title": "Cosmos Laundromat",
        "letterboxd_slug": "cosmos-laundromat",
        "archive_id": "CosmosLaundromatFirstCycle",
        "wiki_ru_title": "Cosmos Laundromat",
        "subtitle_ru": "Открытый фильм о путешествии между мирами",
        "license": "CC BY 4.0 · Blender Studio",
        "duration_seconds": 730,
        "aspect_ratio": 2.00,
        "direct_mp4_url": "https://archive.org/download/CosmosLaundromatFirstCycle/Cosmos%20Laundromat%20-%20First%20Cycle%20%281080p%29.mp4",
        "poster_url": "https://archive.org/download/CosmosLaundromatFirstCycle/__ia_thumb.jpg",
        "default_start_sec": 60.0,
        "genres": ["фантастика", "приключения"],
        "director": "Матьё Овре",
        "year": 2015,
        "synopsis_fallback_ru": "На ветреном острове герою предлагают прожить другую жизнь.",
        "cue_points": [TrailerCuePoint(label_ru="Шторм", timestamp_sec=60.0, acoustic_focus="wide_ambience", description_ru="Ветер и гром по ширине зала.")],
    },
    "movie_inception": {
        "trailer_id": "sintel_cinemascope",
        "original_film_title": "Sintel",
        "letterboxd_slug": "sintel",
        "archive_id": "Sintel",
        "wiki_ru_title": "Синтел",
        "subtitle_ru": "Широкоэкранный открытый фильм",
        "license": "CC BY 3.0 · Blender Foundation",
        "duration_seconds": 888,
        "aspect_ratio": 2.35,
        "direct_mp4_url": "https://archive.org/download/Sintel/sintel-2048-stereo_512kb.mp4",
        "poster_url": "https://archive.org/download/Sintel/__ia_thumb.jpg",
        "default_start_sec": 42.0,
        "genres": ["фантастика", "триллер"],
        "director": "Колин Леви",
        "year": 2010,
        "synopsis_fallback_ru": "Путешественница ищет спутника среди гор и храмов.",
        "cue_points": [TrailerCuePoint(label_ru="Перевал", timestamp_sec=42.0, acoustic_focus="wide_ambience", description_ru="Ветер между каналами.")],
    },
    "movie_batman": {
        "trailer_id": "glass_half",
        "original_film_title": "Glass Half",
        "letterboxd_slug": "glass-half",
        "archive_id": "GlassHalf",
        "wiki_ru_title": "Glass Half",
        "subtitle_ru": "Короткий открытый детективный ролик",
        "license": "CC BY 3.0 · Blender Foundation",
        "duration_seconds": 420,
        "aspect_ratio": 1.78,
        "direct_mp4_url": "https://archive.org/download/GlassHalf/Glass.Half.mp4",
        "poster_url": "https://archive.org/download/GlassHalf/__ia_thumb.jpg",
        "default_start_sec": 8.0,
        "genres": ["детектив", "боевик"],
        "director": "Blender Foundation",
        "year": 2015,
        "synopsis_fallback_ru": "Короткий нуарный ролик для проверки тёмного зала.",
        "cue_points": [TrailerCuePoint(label_ru="Начало", timestamp_sec=8.0, acoustic_focus="dialogue_center", description_ru="Тихий центр сцены.")],
    },
    "movie_spiderverse": {
        "trailer_id": "big_buck_bunny",
        "original_film_title": "Big Buck Bunny",
        "letterboxd_slug": "big-buck-bunny",
        "archive_id": "BigBuckBunny_124",
        "wiki_ru_title": "Большой Бак",
        "subtitle_ru": "Яркий открытый анимационный фильм",
        "license": "CC BY 3.0 · Blender Foundation",
        "duration_seconds": 596,
        "aspect_ratio": 1.78,
        "direct_mp4_url": "https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4",
        "poster_url": "https://archive.org/download/BigBuckBunny_124/__ia_thumb.jpg",
        "default_start_sec": 12.0,
        "genres": ["анимация", "приключения"],
        "director": "Саша Годез",
        "year": 2008,
        "synopsis_fallback_ru": "Большой кролик устраивает весёлую погоню по лесу.",
        "cue_points": [TrailerCuePoint(label_ru="Лес", timestamp_sec=12.0, acoustic_focus="stereo_pan", description_ru="Птицы и движение по сторонам.")],
    },
    "movie_oppenheimer": {
        "trailer_id": "caminandes_llama",
        "original_film_title": "Caminandes: Llama Drama",
        "letterboxd_slug": "caminandes-llama-drama",
        "archive_id": "CaminandesLlamaDrama",
        "wiki_ru_title": "Caminandes",
        "subtitle_ru": "Короткий открытый фильм",
        "license": "CC BY 4.0 · Blender Studio",
        "duration_seconds": 120,
        "aspect_ratio": 1.78,
        "direct_mp4_url": "https://archive.org/download/CaminandesLlamaDrama/CaminandesLlamaDrama.mp4",
        "poster_url": "https://archive.org/download/CaminandesLlamaDrama/__ia_thumb.jpg",
        "default_start_sec": 4.0,
        "genres": ["драма", "биография"],
        "director": "Blender Studio",
        "year": 2013,
        "synopsis_fallback_ru": "Короткий открытый ролик с чистым звуком.",
        "cue_points": [TrailerCuePoint(label_ru="Начало", timestamp_sec=4.0, acoustic_focus="dialogue_center", description_ru="Короткая сцена для сравнения мест.")],
    },
    "movie_insideout": {
        "trailer_id": "sprite_fright",
        "original_film_title": "Sprite Fright",
        "letterboxd_slug": "sprite-fright",
        "archive_id": "SpriteFright",
        "wiki_ru_title": "Sprite Fright",
        "subtitle_ru": "Семейный открытый анимационный ролик",
        "license": "CC BY 4.0 · Blender Studio",
        "duration_seconds": 600,
        "aspect_ratio": 1.78,
        "direct_mp4_url": "https://archive.org/download/SpriteFright/SpriteFright.mp4",
        "poster_url": "https://archive.org/download/SpriteFright/__ia_thumb.jpg",
        "default_start_sec": 6.0,
        "genres": ["анимация", "семейное"],
        "director": "Blender Studio",
        "year": 2021,
        "synopsis_fallback_ru": "Яркий открытый ролик для семейного сеанса.",
        "cue_points": [TrailerCuePoint(label_ru="Начало", timestamp_sec=6.0, acoustic_focus="stereo_pan", description_ru="Живая стереосцена.")],
    },
    "movie_nord": {
        "trailer_id": "sintel_cinemascope",
        "original_film_title": "Sintel",
        "letterboxd_slug": "sintel",
        "archive_id": "Sintel",
        "wiki_ru_title": "Синтел",
        "subtitle_ru": "Широкоэкранный 2.35:1 демо-ролик снежных хребтов, ветра и оркестровой панорамы",
        "license": "CC BY 3.0 · Blender Foundation",
        "duration_seconds": 888,
        "aspect_ratio": 2.35,
        "direct_mp4_url": "https://archive.org/download/Sintel/sintel-2048-surround_512kb.mp4",
        "poster_url": "https://archive.org/download/Sintel/__ia_thumb.jpg",
        "default_start_sec": 42.0,
        "genres": ["приключения", "фэнтези", "драма"],
        "director": "Колин Леви",
        "year": 2010,
        "synopsis_fallback_ru": (
            "Одинокая путешественница пересекает ледяные северные перевалы в поисках крылатого спутника. "
            "Эталонный широкоэкранный кадр 2.35:1 и богатое стереопанорамирование ветра идеально раскрывают разницу мест в зале."
        ),
        "cue_points": [
            TrailerCuePoint(
                label_ru="Северный шторм на перевале",
                timestamp_sec=42.0,
                acoustic_focus="wide_ambience",
                description_ru="Широкая стереопанорама ледяного ветра между левым и правым каналами экрана.",
            ),
            TrailerCuePoint(
                label_ru="Диалог в тишине храма",
                timestamp_sec=128.0,
                acoustic_focus="dialogue_center",
                description_ru="Проверка фантомного центрального канала речи и задержки Хааса с боковых мест.",
            ),
            TrailerCuePoint(
                label_ru="Пролёт над пиками и удар баса",
                timestamp_sec=315.0,
                acoustic_focus="bass_lfe",
                description_ru="Мощный оркестровый всплеск и низкочастотный отклик зала.",
            ),
        ],
    },
    "movie_lights": {
        "trailer_id": "tears_of_steel_hd",
        "original_film_title": "Tears of Steel",
        "letterboxd_slug": "tears-of-steel",
        "archive_id": "Tears-of-Steel",
        "wiki_ru_title": "Слёзы стали",
        "subtitle_ru": "Sci-Fi 2.40:1 в 720p HD: неоновый купол, диалоги и динамическое сведение спецэффектов",
        "license": "CC BY 3.0 · Blender Institute Amsterdam",
        "duration_seconds": 734,
        "aspect_ratio": 2.40,
        "direct_mp4_url": "https://archive.org/download/Tears-of-Steel/tears_of_steel_720p.mp4",
        "poster_url": "https://archive.org/download/Tears-of-Steel/__ia_thumb.jpg",
        "default_start_sec": 38.0,
        "genres": ["фантастика", "киберпанк", "драма"],
        "director": "Иэн Хьюберт",
        "year": 2012,
        "synopsis_fallback_ru": (
            "Под куполом ночного города будущего группа учёных и бойцов пытается предотвратить катастрофу. "
            "Контрастный неоновый свет и резкие переходы звука слева направо позволяют мгновенно оценить угол обзора и акустику кресла."
        ),
        "cue_points": [
            TrailerCuePoint(
                label_ru="Мост в огнях ночного города",
                timestamp_sec=38.0,
                acoustic_focus="dialogue_center",
                description_ru="Чистая речь в центре экрана на фоне городской атмосферы.",
            ),
            TrailerCuePoint(
                label_ru="Запуск голографического купола",
                timestamp_sec=195.0,
                acoustic_focus="stereo_pan",
                description_ru="Движение звуковых импульсов по всей ширине полотна экрана.",
            ),
            TrailerCuePoint(
                label_ru="Кульминация в машинном зале",
                timestamp_sec=440.0,
                acoustic_focus="bass_lfe",
                description_ru="Максимальная плотность спецэффектов, суббаса и контрастных бликов.",
            ),
        ],
    },
    "preset_cosmos": {
        "trailer_id": "cosmos_laundromat_1080p",
        "original_film_title": "Cosmos Laundromat",
        "letterboxd_slug": "cosmos-laundromat",
        "archive_id": "CosmosLaundromatFirstCycle",
        "wiki_ru_title": "Космическая прачечная",
        "subtitle_ru": "Атмосферный 1080p HD-фильм с громом, штормом и глубокой пространственной сценой",
        "license": "CC BY 4.0 · Blender Studio",
        "duration_seconds": 730,
        "aspect_ratio": 2.00,
        "direct_mp4_url": "https://archive.org/download/CosmosLaundromatFirstCycle/Cosmos%20Laundromat%20-%20First%20Cycle%20%281080p%29.mp4",
        "poster_url": "https://archive.org/download/CosmosLaundromatFirstCycle/__ia_thumb.jpg",
        "default_start_sec": 60.0,
        "genres": ["фантастика", "притча", "анимация"],
        "director": "Матьё Овре",
        "year": 2015,
        "synopsis_fallback_ru": (
            "На пустынном ветреном острове загадочный незнакомец предлагает герою прожить любую жизнь во Вселенной."
        ),
        "cue_points": [
            TrailerCuePoint(
                label_ru="Штормовой остров и раскат грома",
                timestamp_sec=60.0,
                acoustic_focus="wide_ambience",
                description_ru="Проверка объёма зала и затухания высоких частот на дальних рядах.",
            ),
            TrailerCuePoint(
                label_ru="Квантовый переход миров",
                timestamp_sec=310.0,
                acoustic_focus="stereo_pan",
                description_ru="Быстрое вращение звуковой сцены между левым и правым спикерами.",
            ),
        ],
    },
    "preset_fast_trailer": {
        "trailer_id": "classic_cinema_trailer_fast",
        "original_film_title": "Sita Sings the Blues (Theatrical Trailer)",
        "letterboxd_slug": "sita-sings-the-blues",
        "archive_id": "SitaSingsTheBluesTrailer2008-640x360",
        "wiki_ru_title": "Сита поёт блюз",
        "subtitle_ru": "Лёгкий музыкальный кинотеатральный трейлер (7 МБ) для мгновенного старта в 3D",
        "license": "CC0 / Public Domain · Nina Paley",
        "duration_seconds": 100,
        "aspect_ratio": 1.78,
        "direct_mp4_url": "https://archive.org/download/SitaSingsTheBluesTrailer2008-640x360/SitaTrailer2008H264_512kb.mp4",
        "poster_url": "https://archive.org/download/SitaSingsTheBluesTrailer2008-640x360/__ia_thumb.jpg",
        "default_start_sec": 4.0,
        "genres": ["мюзикл", "комедия", "анимация"],
        "director": "Нина Пэйли",
        "year": 2008,
        "synopsis_fallback_ru": "Яркий музыкальный кинотрейлер с джазовым вокалом 1920-х годов для теста акустики кресел.",
        "cue_points": [
            TrailerCuePoint(
                label_ru="Джазовое вступление и вокал",
                timestamp_sec=8.0,
                acoustic_focus="dialogue_center",
                description_ru="Тёплый вокал в центре акустической сцены зала.",
            ),
        ],
    },
}

_SLUG_CLEAN_RE = re.compile(r"[^a-z0-9]+")
_HTML_TAG_RE = re.compile(r"<[^>]+>")


def _apple_media_url(value: Any, kind: str) -> str | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = urlsplit(value)
        host = parsed.hostname or ""
        allowed = (host.endswith(".mzstatic.com") if kind == "image" else
                   host == "itunes.apple.com" or host.endswith(".itunes.apple.com") or (kind == "source" and host == "tv.apple.com"))
        if parsed.scheme != "https" or not allowed or parsed.username or parsed.password:
            return None
    except ValueError:
        return None
    return value


def _slugify_english(title: str) -> str:
    return _SLUG_CLEAN_RE.sub("-", title.lower()).strip("-")


def _strip_html(raw_html: str) -> str:
    clean = _HTML_TAG_RE.sub(" ", raw_html)
    clean = html.unescape(clean)
    return re.sub(r"\s+", " ", clean).strip()


class CinemaMediaService:
    def __init__(
        self,
        *,
        db: Database,
        settings: Settings,
        catalog_repo: CatalogRepository,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._db = db
        self._settings = settings
        self._catalog_repo = catalog_repo
        self._external_client = http_client
        self._catalog_search_lock = asyncio.Lock()
        self._catalog_limiter = SlidingWindowRateLimiter(18, 60.0)
        self._ensure_tables()

    def _ensure_tables(self) -> None:
        with self._db.immediate_transaction() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS movie_media_bindings (
                    movie_id TEXT PRIMARY KEY,
                    preset_key TEXT NOT NULL,
                    imdb_id TEXT,
                    letterboxd_slug TEXT,
                    kinopoisk_id INTEGER,
                    custom_mp4_url TEXT,
                    updated_at TEXT NOT NULL
                );
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS external_api_cache (
                    cache_key TEXT PRIMARY KEY,
                    payload_json TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """
            )
            now_iso = utc_now_iso()
            for movie_id in ("movie_nord", "movie_lights"):
                conn.execute(
                    """
                    INSERT INTO movie_media_bindings (movie_id, preset_key, imdb_id, letterboxd_slug, updated_at)
                    VALUES (?, ?, NULL, ?, ?)
                    ON CONFLICT(movie_id) DO NOTHING;
                    """,
                    (
                        movie_id,
                        movie_id,
                        CURATED_OPEN_TRAILERS[movie_id]["letterboxd_slug"],
                        now_iso,
                    ),
                )

    def _resolve_preset(self, movie_or_trailer_id: str) -> tuple[str, dict[str, Any], dict[str, Any] | None]:
        with self._db.read_connection() as conn:
            binding = conn.execute(
                "SELECT * FROM movie_media_bindings WHERE movie_id = ?;",
                (movie_or_trailer_id,),
            ).fetchone()
            movie_row = conn.execute(
                "SELECT id, title, poster_url FROM movies WHERE id = ?;",
                (movie_or_trailer_id,),
            ).fetchone()

        if binding is not None:
            preset_key = str(binding["preset_key"])
            if preset_key not in CURATED_OPEN_TRAILERS:
                raise not_found_error("Трейлер для этого фильма не подключён.")
            preset = dict(CURATED_OPEN_TRAILERS[preset_key])
            if binding["custom_mp4_url"]:
                preset["direct_mp4_url"] = str(binding["custom_mp4_url"])
            if binding["letterboxd_slug"]:
                preset["letterboxd_slug"] = str(binding["letterboxd_slug"])
            if binding["imdb_id"]:
                preset["imdb_id"] = str(binding["imdb_id"])
            if binding["kinopoisk_id"]:
                preset["kinopoisk_id"] = int(binding["kinopoisk_id"])
            title = str(movie_row["title"]) if movie_row else preset["original_film_title"]
            if movie_row and movie_row["poster_url"]:
                preset["poster_url"] = str(movie_row["poster_url"])
            return movie_or_trailer_id, preset, {"title": title}

        if movie_or_trailer_id in CURATED_OPEN_TRAILERS:
            preset = dict(CURATED_OPEN_TRAILERS[movie_or_trailer_id])
            return movie_or_trailer_id, preset, {"title": preset["original_film_title"]}

        for key, item in CURATED_OPEN_TRAILERS.items():
            if item["trailer_id"] == movie_or_trailer_id:
                return key, dict(item), {"title": item["original_film_title"]}

        raise not_found_error("Трейлер для этого фильма не подключён.")

    def list_trailers(self) -> TrailerCatalogResponse:
        with self._db.read_connection() as conn:
            movie_rows = conn.execute(
                "SELECT movies.id FROM movies JOIN movie_media_bindings bindings "
                "ON bindings.movie_id = movies.id WHERE bindings.preset_key IN (" +
                ",".join("?" for _ in CURATED_OPEN_TRAILERS) + ") ORDER BY movies.id;",
                tuple(CURATED_OPEN_TRAILERS),
            ).fetchall()
        seen: set[str] = set()
        items: list[MovieTrailerAsset] = []
        for r in movie_rows:
            mid = str(r["id"])
            seen.add(mid)
            items.append(self.get_movie_trailer(mid))
        for key in CURATED_OPEN_TRAILERS:
            if key not in seen:
                items.append(self.get_movie_trailer(key))
        return TrailerCatalogResponse(items=items)

    def get_movie_trailer(self, movie_id: str) -> MovieTrailerAsset:
        resolved_id, preset, meta = self._resolve_preset(movie_id)
        title = (meta or {}).get("title") or preset["original_film_title"]
        proxy_url = f"/api/v1/media/trailers/{quote(resolved_id)}/stream"
        return MovieTrailerAsset(
            movie_id=resolved_id,
            trailer_id=str(preset["trailer_id"]),
            title=str(title),
            original_film_title=str(preset["original_film_title"]),
            subtitle_ru=str(preset["subtitle_ru"]),
            license=str(preset["license"]),
            duration_seconds=int(preset["duration_seconds"]),
            aspect_ratio=float(preset["aspect_ratio"]),
            audio_layout="stereo",
            stream_proxy_url=proxy_url,
            direct_mp4_url=str(preset["direct_mp4_url"]),
            poster_url=preset.get("poster_url"),
            default_start_sec=float(preset.get("default_start_sec", 0.0)),
            webgl_cors_ready=True,
            cue_points=list(preset["cue_points"]),
        )

    async def proxy_trailer_stream(
        self,
        movie_id: str,
        range_header: str | None,
    ) -> Response:
        """Streams HTTP 206 Partial Content video chunks with full WebGL/WebAudio CORS headers."""
        asset = self.get_movie_trailer(movie_id)
        upstream_url = asset.direct_mp4_url

        cors_headers = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "Range, Accept, Origin",
            "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type",
            "Cross-Origin-Resource-Policy": "cross-origin",
            "Accept-Ranges": "bytes",
        }

        if not self._settings.enable_external_media_network:
            return Response(
                status_code=503,
                content=b"",
                headers=cors_headers,
            )

        req_headers = {"User-Agent": USER_AGENT}
        if range_header and range_header.startswith("bytes="):
            req_headers["Range"] = range_header
        else:
            # Cap initial un-ranged probe chunk to 2 MB so browsers immediately switch to Range streaming
            req_headers["Range"] = "bytes=0-2097151"

        client = self._external_client or httpx.AsyncClient(
            timeout=httpx.Timeout(connect=6.0, read=25.0, write=10.0, pool=10.0),
            follow_redirects=True,
        )
        owns_client = self._external_client is None

        try:
            req = client.build_request("GET", upstream_url, headers=req_headers)
            upstream_resp = await client.send(req, stream=True)
        except httpx.HTTPError:
            if owns_client:
                await client.aclose()
            return Response(
                status_code=502,
                content=json.dumps(
                    {
                        "error": {
                            "code": "MEDIA_UPSTREAM_UNAVAILABLE",
                            "message": "Видеопоток трейлера временно недоступен.",
                            "retryable": True,
                        }
                    },
                    ensure_ascii=False,
                ).encode("utf-8"),
                media_type="application/json",
                headers=cors_headers,
            )

        status_code = upstream_resp.status_code
        out_headers = dict(cors_headers)
        for h_name in ("Content-Type", "Content-Length", "Content-Range"):
            val = upstream_resp.headers.get(h_name)
            if val:
                out_headers[h_name] = val
        out_headers.setdefault("Content-Type", "video/mp4")

        async def _iter_chunks() -> AsyncIterator[bytes]:
            try:
                async for chunk in upstream_resp.aiter_bytes(chunk_size=65536):
                    yield chunk
            finally:
                await upstream_resp.aclose()
                if owns_client:
                    await client.aclose()

        return StreamingResponse(
            _iter_chunks(),
            status_code=status_code,
            headers=out_headers,
            media_type=out_headers["Content-Type"],
        )

    def compute_seat_audio_dsp(
        self,
        session_id: str,
        seat_id: str,
    ) -> SeatWebAudioDSPProfile:
        """Computes physics-accurate Web Audio API node parameters for a 3D seat."""
        session = self._catalog_repo.get_session(session_id)
        if session is None:
            raise not_found_error("Сеанс не найден.")
        hall = self._catalog_repo.get_hall(session.hall_id)
        if hall is None:
            raise not_found_error("Зал не найден.")

        seat = next((s for s in hall.seats if s.id == seat_id), None)
        if seat is None:
            raise validation_error("Указанное место не принадлежит этому залу.")

        eye_x = seat.position.x
        eye_y = seat.position.y + hall.camera.eye_height
        eye_z = seat.position.z

        dx_scr = hall.screen.center.x - eye_x
        dy_scr = hall.screen.center.y - eye_y
        dz_scr = hall.screen.center.z - eye_z
        dist_screen = math.sqrt(dx_scr * dx_scr + dy_scr * dy_scr + dz_scr * dz_scr)
        facing_angle = math.atan2(dx_scr, eye_z - hall.screen.center.z)

        if len(hall.speakers) >= 2:
            ordered = sorted(hall.speakers, key=lambda sp: sp.position.x)
            left_sp, right_sp = ordered[0], ordered[-1]
        elif len(hall.speakers) == 1:
            left_sp = right_sp = hall.speakers[0]
        else:
            left_sp = right_sp = None

        if left_sp and right_sp:
            d_left = math.sqrt(
                (left_sp.position.x - eye_x) ** 2
                + (left_sp.position.y - eye_y) ** 2
                + (left_sp.position.z - eye_z) ** 2
            )
            d_right = math.sqrt(
                (right_sp.position.x - eye_x) ** 2
                + (right_sp.position.y - eye_y) ** 2
                + (right_sp.position.z - eye_z) ** 2
            )
            ang_l = math.atan2(left_sp.position.x - eye_x, -(left_sp.position.z - eye_z)) - facing_angle
            ang_r = math.atan2(right_sp.position.x - eye_x, -(right_sp.position.z - eye_z)) - facing_angle
            pan_l = max(-0.98, min(0.98, math.sin(ang_l)))
            pan_r = max(-0.98, min(0.98, math.sin(ang_r)))
        else:
            d_left = d_right = dist_screen
            pan_l, pan_r = -0.5, 0.5

        # Haas precedence propagation delay in milliseconds (c = 343 m/s)
        delay_left_ms = round((d_left / SPEED_OF_SOUND_M_S) * 1000.0, 2)
        delay_right_ms = round((d_right / SPEED_OF_SOUND_M_S) * 1000.0, 2)

        # Inverse-distance attenuation normalized to reference sweet-spot (~11 m)
        gain_left = round(max(0.18, min(1.0, 11.0 / (3.2 + d_left))), 3)
        gain_right = round(max(0.18, min(1.0, 11.0 / (3.2 + d_right))), 3)

        # ISO 9613-1 high-frequency air absorption: farther rows get slightly warmer HF rolloff
        lowpass_hz = round(max(5500.0, min(19500.0, 21500.0 - dist_screen * 420.0)), 0)

        # Rear wall boundary reinforcement boosts LFE slightly on back sofa rows
        rear_proximity = max(0.0, 1.0 - abs(hall.dimensions.depth / 2.0 - eye_z) / 5.0)
        sub_lfe_gain = round(1.0 + 0.28 * rear_proximity, 2)
        reverb_mix = round(min(0.42, 0.10 + (dist_screen / max(hall.dimensions.depth, 10.0)) * 0.24), 3)

        itd_ms = abs(delay_left_ms - delay_right_ms)
        sweet_spot = itd_ms <= 2.2 and 0.32 <= (dist_screen / max(hall.dimensions.depth, 1.0)) <= 0.72

        # Spatial calibration always uses an explicitly named open test reel,
        # never an unrelated preview presented as the scheduled movie's trailer.
        trailer = self.get_movie_trailer("movie_nord")
        cue_sec = trailer.cue_points[0].timestamp_sec if trailer.cue_points else trailer.default_start_sec

        return SeatWebAudioDSPProfile(
            session_id=session_id,
            seat_id=seat.id,
            row=seat.row,
            number=seat.number,
            distance_to_screen_m=round(dist_screen, 2),
            distance_left_speaker_m=round(d_left, 2),
            distance_right_speaker_m=round(d_right, 2),
            delay_left_ms=delay_left_ms,
            delay_right_ms=delay_right_ms,
            gain_left=gain_left,
            gain_right=gain_right,
            pan_left=round(pan_l, 3),
            pan_right=round(pan_r, 3),
            air_absorption_lowpass_hz=lowpass_hz,
            subwoofer_lfe_gain=sub_lfe_gain,
            reverb_wet_mix=reverb_mix,
            acoustic_sweet_spot=sweet_spot,
            recommended_trailer_stream_url=trailer.stream_proxy_url,
            recommended_cue_sec=cue_sec,
        )

    # --- External Catalog Search & Real Multi-Platform Reviews ---

    def _get_cached_json(self, cache_key: str) -> Any | None:
        now_iso = utc_now_iso()
        with self._db.read_connection() as conn:
            row = conn.execute(
                "SELECT payload_json FROM external_api_cache WHERE cache_key = ? AND expires_at > ?;",
                (cache_key, now_iso),
            ).fetchone()
        if row is None:
            return None
        return json.loads(str(row["payload_json"]))

    def _set_cached_json(self, cache_key: str, payload: Any, ttl_hours: int = 12) -> None:
        now = utc_now()
        now_iso = to_iso_utc(now)
        exp_iso = to_iso_utc(now + timedelta(hours=ttl_hours))
        serialized = json.dumps(payload, ensure_ascii=False)
        with self._db.immediate_transaction() as conn:
            conn.execute(
                """
                INSERT INTO external_api_cache (cache_key, payload_json, expires_at, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(cache_key) DO UPDATE SET
                    payload_json = excluded.payload_json,
                    expires_at = excluded.expires_at,
                    updated_at = excluded.updated_at;
                """,
                (cache_key, serialized, exp_iso, now_iso),
            )

    async def search_external_catalog(self, query: str) -> ExternalCatalogSearchResponse:
        """Read-only official Apple Search API; no invented sessions, reviews or trailer bindings.

        Apple documentation: https://performance-partners.apple.com/search-api
        Search all media, then filter feature-movie: the movie-only filter currently returns
        empty responses for known available films. Cache metadata, never download preview media.
        """
        cleaned = " ".join(query.split())
        if not 2 <= len(cleaned) <= 120:
            raise validation_error("Введите от 2 до 120 символов.")
        aliases = {
            "интерстеллар": "Interstellar", "дюна": "Dune", "дюна 2": "Dune Part Two",
            "начало": "Inception", "бэтмен": "The Batman", "оппенгеймер": "Oppenheimer",
            "головоломка": "Inside Out", "головоломка 2": "Inside Out 2",
            "нолан": "Christopher Nolan", "бегущий по лезвию": "Blade Runner",
            "бегущий по лезвию 2049": "Blade Runner 2049",
        }
        term = aliases.get(cleaned.casefold(), cleaned)
        cache_key = "apple_movies_v1:US:" + hashlib.sha256(term.casefold().encode()).hexdigest()[:24]
        cached = self._get_cached_json(cache_key)
        if cached is not None:
            result = ExternalCatalogSearchResponse.model_validate(cached)
            return result.model_copy(update={"query": cleaned})
        if not self._settings.enable_external_media_network:
            return ExternalCatalogSearchResponse(query=cleaned, sources_queried=[], items=[], status="disabled", notice="Внешний каталог пока недоступен. Афиша ZAL работает в обычном режиме.")

        # One upstream request at a time avoids duplicate calls from concurrent identical searches.
        async with self._catalog_search_lock:
            cached = self._get_cached_json(cache_key)
            if cached is not None:
                return ExternalCatalogSearchResponse.model_validate(cached).model_copy(update={"query": cleaned})
            if not self._catalog_limiter.allow("apple-search"):
                return ExternalCatalogSearchResponse(query=cleaned, sources_queried=[], items=[], status="rate_limited", notice="Слишком много запросов к каталогу. Попробуйте через минуту.")
            client = self._external_client or httpx.AsyncClient(timeout=8.0, headers={"User-Agent": USER_AGENT})
            try:
                response = await client.get("https://itunes.apple.com/search", params={"term": term, "country": "US", "limit": 40})
                response.raise_for_status()
                payload = response.json()
                if not isinstance(payload, dict) or not isinstance(payload.get("results"), list):
                    raise ValueError("Invalid Apple catalog response")
                items: list[ExternalMovieCatalogItem] = []
                seen: set[str] = set()
                for entry in payload["results"]:
                    if not isinstance(entry, dict) or entry.get("kind") != "feature-movie":
                        continue
                    track_id = entry.get("trackId")
                    title = entry.get("trackName")
                    source_url = _apple_media_url(entry.get("trackViewUrl"), "source")
                    if not isinstance(track_id, int) or not isinstance(title, str) or not title.strip() or not source_url:
                        continue
                    external_id = "itunes_" + str(track_id)
                    if external_id in seen:
                        continue
                    seen.add(external_id)
                    year_text = str(entry.get("releaseDate") or "")[:4]
                    duration = entry.get("trackTimeMillis")
                    poster = _apple_media_url(entry.get("artworkUrl100"), "image")
                    if poster:
                        poster = re.sub(r"/\d+x\d+bb\.(jpg|png)$", r"/400x600bb.\1", poster)
                    items.append(ExternalMovieCatalogItem(
                        external_id=external_id,
                        title=title.strip(),
                        year=int(year_text) if year_text.isdigit() else None,
                        cast_summary=str(entry.get("artistName") or "")[:180] or None,
                        poster_url=poster,
                        playable_trailer_stream_url=_apple_media_url(entry.get("previewUrl"), "video"),
                        source="Apple iTunes", source_url=source_url,
                        genre=str(entry.get("primaryGenreName") or "")[:80] or None,
                        duration_minutes=round(duration / 60000) if isinstance(duration, (int, float)) and 0 < duration < 36000000 else None,
                        description=str(entry.get("longDescription") or entry.get("shortDescription") or "")[:3000] or None,
                        content_rating=str(entry.get("contentAdvisoryRating") or "")[:20] or None,
                    ))
                    if len(items) == 12:
                        break
                result = ExternalCatalogSearchResponse(query=cleaned, sources_queried=["Apple iTunes Search API"], items=items)
                self._set_cached_json(cache_key, result.model_dump(mode="json"), ttl_hours=6)
                return result
            except (httpx.HTTPError, ValueError, TypeError):
                return ExternalCatalogSearchResponse(query=cleaned, sources_queried=["Apple iTunes Search API"], items=[], status="unavailable", notice="Каталог временно не отвечает. Попробуйте ещё раз чуть позже.")
            finally:
                if self._external_client is None:
                    await client.aclose()

    async def get_movie_enrichment(
        self,
        movie_id: str,
        *,
        letterboxd_slug_override: str | None = None,
    ) -> MovieEnrichmentResponse:
        """Aggregates real audience reviews & ratings from Letterboxd, Internet Archive, Wikipedia RU, and Kinopoisk."""
        resolved_id, preset, meta = self._resolve_preset(movie_id)
        lb_slug = (letterboxd_slug_override or preset.get("letterboxd_slug") or "").strip().lower()
        cache_key = f"enrich:{resolved_id}:{lb_slug}"

        cached = self._get_cached_json(cache_key)
        if cached is not None:
            parsed = MovieEnrichmentResponse.model_validate(cached)
            return parsed.model_copy(update={"cached": True})

        trailer = self.get_movie_trailer(resolved_id)
        title = (meta or {}).get("title") or preset["original_film_title"]
        synopsis_ru = str(preset.get("synopsis_fallback_ru") or "")
        ratings: list[PlatformRatingBadge] = []
        reviews: list[RealAudienceReview] = []
        sources_used: list[str] = []

        if self._settings.enable_external_media_network:
            client = self._external_client or httpx.AsyncClient(
                timeout=7.5, follow_redirects=True, headers={"User-Agent": USER_AGENT}
            )
            owns_client = self._external_client is None
            try:
                # 1. Russian Wikipedia summary
                wiki_title = str(preset.get("wiki_ru_title") or title)
                try:
                    w_resp = await client.get(
                        f"https://ru.wikipedia.org/api/rest_v1/page/summary/{quote(wiki_title)}"
                    )
                    if w_resp.status_code == 200:
                        extract = str(w_resp.json().get("extract") or "").strip()
                        if len(extract) >= 40:
                            synopsis_ru = extract
                            sources_used.append("Wikipedia RU")
                except httpx.HTTPError:
                    pass

                # 2. Letterboxd real AggregateRating & audience reviews (keyless JSON-LD + structured HTML)
                if lb_slug:
                    lb_ratings, lb_reviews = await self._fetch_letterboxd(client, lb_slug)
                    if lb_ratings or lb_reviews:
                        sources_used.append("Letterboxd")
                        ratings.extend(lb_ratings)
                        reviews.extend(lb_reviews)

                # 3. Internet Archive real metadata & viewer reviews
                archive_id = preset.get("archive_id")
                if archive_id:
                    ia_ratings, ia_reviews = await self._fetch_archive_reviews(client, str(archive_id))
                    if ia_ratings or ia_reviews:
                        sources_used.append("Internet Archive")
                        ratings.extend(ia_ratings)
                        reviews.extend(ia_reviews)

                # 4. Optional Kinopoisk Unofficial API reviews if configured
                kp_id = preset.get("kinopoisk_id")
                if self._settings.kinopoisk_api_key and kp_id:
                    kp_ratings, kp_reviews = await self._fetch_kinopoisk(client, int(kp_id))
                    if kp_ratings or kp_reviews:
                        sources_used.append("Кинопоиск")
                        ratings.extend(kp_ratings)
                        reviews.extend(kp_reviews)
            finally:
                if owns_client:
                    await client.aclose()

        if not sources_used:
            sources_used.append("ZAL Open Cinema Metadata")

        result = MovieEnrichmentResponse(
            movie_id=resolved_id,
            title=str(title),
            original_title=str(preset.get("original_film_title") or title),
            year=preset.get("year"),
            synopsis_ru=synopsis_ru,
            director=preset.get("director"),
            genres=list(preset.get("genres", [])),
            ratings=ratings,
            reviews=reviews[:12],
            trailer=trailer,
            sources_used=sources_used,
            cached=False,
        )
        self._set_cached_json(cache_key, result.model_dump(mode="json"), ttl_hours=12)
        return result

    async def _fetch_letterboxd(
        self,
        client: httpx.AsyncClient,
        slug: str,
    ) -> tuple[list[PlatformRatingBadge], list[RealAudienceReview]]:
        url = f"https://letterboxd.com/film/{quote(slug)}/"
        try:
            resp = await client.get(url)
        except httpx.HTTPError:
            return [], []
        if resp.status_code != 200:
            return [], []

        page_html = resp.text
        ratings: list[PlatformRatingBadge] = []
        reviews: list[RealAudienceReview] = []

        ld_match = re.search(
            r'<script type="application/ld\+json">\s*(?:/\*.*?\*/\s*)?(\{.*?\})\s*(?:/\*.*?\*/\s*)?</script>',
            page_html,
            re.S,
        )
        if ld_match:
            try:
                ld_data = json.loads(ld_match.group(1))
                agg = ld_data.get("aggregateRating")
                if isinstance(agg, dict) and agg.get("ratingValue") is not None:
                    score = float(agg["ratingValue"])
                    ratings.append(
                        PlatformRatingBadge(
                            platform="Letterboxd",
                            score=round(score, 2),
                            scale_max=5.0,
                            normalized_10=round(score * 2.0, 1),
                            votes_count=int(agg["ratingCount"]) if agg.get("ratingCount") else None,
                            url=url,
                        )
                    )
            except (ValueError, TypeError):
                pass

        # Parse featured real audience reviews on Letterboxd film page
        blocks = re.findall(
            r'<div class="film-detail-content">(.*?)</div>\s*</li>',
            page_html,
            re.S,
        )
        for idx, block in enumerate(blocks[:8]):
            author_m = re.search(r'<strong class="name">([^<]+)</strong>', block)
            body_m = re.search(r'<div class="body-text -prose[^>]*>(.*?)</div>', block, re.S)
            stars_m = re.search(r'class="rating -green[^"]*">([^<]+)</span>', block)
            if not body_m:
                continue
            text = _strip_html(body_m.group(1))
            if len(text) < 15:
                continue
            author = _strip_html(author_m.group(1)) if author_m else "Letterboxd Viewer"
            star_str = stars_m.group(1).strip() if stars_m else ""
            star_val: float | None = None
            if star_str:
                star_val = float(star_str.count("★")) + (0.5 if "½" in star_str else 0.0)
            sentiment = (
                "positive"
                if (star_val is None or star_val >= 3.5)
                else ("neutral" if star_val >= 2.5 else "negative")
            )
            reviews.append(
                RealAudienceReview(
                    id=f"lb_{slug}_{idx}",
                    source="Letterboxd",
                    author=author,
                    rating=star_val,
                    scale_max=5.0,
                    sentiment=sentiment,
                    text=text[:600],
                    language="en",
                    source_url=url,
                )
            )
        return ratings, reviews

    async def _fetch_archive_reviews(
        self,
        client: httpx.AsyncClient,
        archive_id: str,
    ) -> tuple[list[PlatformRatingBadge], list[RealAudienceReview]]:
        url = f"https://archive.org/metadata/{quote(archive_id)}"
        try:
            resp = await client.get(url)
        except httpx.HTTPError:
            return [], []
        if resp.status_code != 200:
            return [], []

        data = resp.json()
        raw_revs = data.get("reviews") or []
        ratings: list[PlatformRatingBadge] = []
        reviews: list[RealAudienceReview] = []

        star_vals = [float(r["stars"]) for r in raw_revs if str(r.get("stars", "")).replace(".", "", 1).isdigit()]
        if star_vals:
            avg = sum(star_vals) / len(star_vals)
            ratings.append(
                PlatformRatingBadge(
                    platform="Internet Archive",
                    score=round(avg, 2),
                    scale_max=5.0,
                    normalized_10=round(avg * 2.0, 1),
                    votes_count=len(star_vals),
                    url=f"https://archive.org/details/{quote(archive_id)}",
                )
            )

        for idx, rev in enumerate(raw_revs[:6]):
            body = _strip_html(str(rev.get("reviewbody") or ""))
            if len(body) < 10:
                continue
            stars = float(rev["stars"]) if str(rev.get("stars", "")).replace(".", "", 1).isdigit() else None
            sentiment = (
                "positive"
                if (stars is None or stars >= 3.5)
                else ("neutral" if stars >= 2.5 else "negative")
            )
            reviews.append(
                RealAudienceReview(
                    id=f"ia_{archive_id}_{idx}",
                    source="Internet Archive",
                    author=str(rev.get("reviewer") or "Archive Viewer"),
                    rating=stars,
                    scale_max=5.0,
                    sentiment=sentiment,
                    text=body[:600],
                    published_at=str(rev.get("reviewdate")) if rev.get("reviewdate") else None,
                    language="en",
                    source_url=f"https://archive.org/details/{quote(archive_id)}",
                )
            )
        return ratings, reviews

    async def _fetch_kinopoisk(
        self,
        client: httpx.AsyncClient,
        kinopoisk_id: int,
    ) -> tuple[list[PlatformRatingBadge], list[RealAudienceReview]]:
        headers = {"X-API-KEY": self._settings.kinopoisk_api_key}
        ratings: list[PlatformRatingBadge] = []
        reviews: list[RealAudienceReview] = []
        try:
            f_resp = await client.get(
                f"https://kinopoiskapiunofficial.tech/api/v2.2/films/{kinopoisk_id}",
                headers=headers,
            )
            if f_resp.status_code == 200:
                fdata = f_resp.json()
                if fdata.get("ratingKinopoisk"):
                    kp_score = float(fdata["ratingKinopoisk"])
                    ratings.append(
                        PlatformRatingBadge(
                            platform="Кинопоиск",
                            score=round(kp_score, 1),
                            scale_max=10.0,
                            normalized_10=round(kp_score, 1),
                            votes_count=fdata.get("ratingKinopoiskVoteCount"),
                            url=f"https://www.kinopoisk.ru/film/{kinopoisk_id}/",
                        )
                    )
            r_resp = await client.get(
                f"https://kinopoiskapiunofficial.tech/api/v2.2/films/{kinopoisk_id}/reviews",
                params={"page": 1, "order": "DATE_DESC"},
                headers=headers,
            )
            if r_resp.status_code == 200:
                for item in r_resp.json().get("items", [])[:6]:
                    desc = _strip_html(str(item.get("description") or ""))
                    if not desc:
                        continue
                    rtype = str(item.get("type") or "NEUTRAL").upper()
                    sentiment = (
                        "positive"
                        if rtype == "POSITIVE"
                        else ("negative" if rtype == "NEGATIVE" else "neutral")
                    )
                    reviews.append(
                        RealAudienceReview(
                            id=f"kp_rev_{item.get('kinopoiskId', kinopoisk_id)}",
                            source="Кинопоиск",
                            author=str(item.get("author") or "Зритель Кинопоиска"),
                            rating=None,
                            scale_max=10.0,
                            sentiment=sentiment,
                            text=desc[:600],
                            published_at=item.get("date"),
                            language="ru",
                            source_url=f"https://www.kinopoisk.ru/film/{kinopoisk_id}/",
                        )
                    )
        except httpx.HTTPError:
            pass
        return ratings, reviews

    def import_external_movie_session(
        self,
        req: ImportExternalSessionRequest,
    ) -> ImportExternalSessionResponse:
        """Creates a real bookable ZAL session in SQLite from any external catalog film + binds a 3D trailer."""
        cinema = self._catalog_repo.get_cinema(req.cinema_id)
        if cinema is None:
            raise not_found_error("Кинотеатр не найден.")
        hall = self._catalog_repo.get_hall(req.hall_id)
        if hall is None:
            raise not_found_error("Зал не найден.")
        if hall.cinema_id != cinema.id:
            raise validation_error("Выбранный зал принадлежит другому кинотеатру.")

        preset_key = req.trailer_Preset_id or "movie_lights"
        if preset_key not in CURATED_OPEN_TRAILERS:
            preset_key = "movie_lights"

        movie_id = "movie_ext_" + uuid.uuid4().hex[:8]
        session_id = "sess_ext_" + uuid.uuid4().hex[:8]
        starts_at = to_iso_utc(utc_now() + timedelta(hours=req.starts_in_hours))
        now_iso = utc_now_iso()

        zone_prices = {"front": 39000, "middle": 59000, "sofa": 99000}
        min_price = min(zone_prices.get(s.zone.value, 59000) for s in hall.seats)

        with self._db.immediate_transaction() as conn:
            conn.execute(
                """
                INSERT INTO movies (id, title, duration_minutes, age_rating, poster_url)
                VALUES (?, ?, ?, ?, ?);
                """,
                (movie_id, req.title.strip(), req.duration_minutes, req.age_rating, req.poster_url),
            )
            conn.execute(
                """
                INSERT INTO movie_media_bindings (
                    movie_id, preset_key, imdb_id, letterboxd_slug, kinopoisk_id, custom_mp4_url, updated_at
                )
                VALUES (?, ?, ?, ?, NULL, NULL, ?);
                """,
                (
                    movie_id,
                    preset_key,
                    req.imdb_id,
                    req.letterboxd_slug or _slugify_english(req.title),
                    now_iso,
                ),
            )
            conn.execute(
                """
                INSERT INTO sessions (id, cinema_id, hall_id, movie_id, starts_at, format, currency, price_from_minor)
                VALUES (?, ?, ?, ?, ?, ?, 'RUB', ?);
                """,
                (session_id, cinema.id, hall.id, movie_id, starts_at, req.format, min_price),
            )
            for idx, seat in enumerate(hall.seats):
                price_minor = zone_prices.get(seat.zone.value, 59000)
                conn.execute(
                    """
                    INSERT INTO session_seats (
                        session_id, seat_id, sort_order, status, price_minor, currency, active_order_id, updated_at
                    )
                    VALUES (?, ?, ?, 'available', ?, 'RUB', NULL, ?);
                    """,
                    (session_id, seat.id, idx, price_minor, now_iso),
                )

        return ImportExternalSessionResponse(
            movie_id=movie_id,
            session_id=session_id,
            cinema_id=cinema.id,
            hall_id=hall.id,
            starts_at=starts_at,
            seats_initialized=len(hall.seats),
            trailer_stream_url=f"/api/v1/media/trailers/{movie_id}/stream",
        )
