"""Pydantic v2 models for 3D Screen Trailers, Web Audio DSP, External Movie Catalog, Real Reviews, and Cyber Features."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictCyberModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --- 1. 3D Cinema Screen Trailers & Seat Web Audio DSP ---


class TrailerCuePoint(StrictCyberModel):
    label_ru: str
    timestamp_sec: float
    acoustic_focus: Literal["bass_lfe", "stereo_pan", "dialogue_center", "wide_ambience"]
    description_ru: str


class MovieTrailerAsset(StrictCyberModel):
    movie_id: str
    trailer_id: str
    title: str
    original_film_title: str
    subtitle_ru: str
    license: str
    duration_seconds: int
    aspect_ratio: float
    video_codec: str = "avc1.64001F"
    audio_layout: Literal["stereo", "surround_5_1"] = "stereo"
    stream_proxy_url: str
    direct_mp4_url: str
    poster_url: str | None = None
    default_start_sec: float = 0.0
    webgl_cors_ready: bool = True
    cue_points: list[TrailerCuePoint]


class TrailerCatalogResponse(StrictCyberModel):
    items: list[MovieTrailerAsset]


class SeatWebAudioDSPProfile(StrictCyberModel):
    session_id: str
    seat_id: str
    row: int
    number: int
    distance_to_screen_m: float
    distance_left_speaker_m: float
    distance_right_speaker_m: float
    delay_left_ms: float
    delay_right_ms: float
    gain_left: float
    gain_right: float
    pan_left: float
    pan_right: float
    air_absorption_lowpass_hz: float
    subwoofer_lfe_gain: float
    reverb_wet_mix: float
    acoustic_sweet_spot: bool
    recommended_trailer_stream_url: str
    recommended_trailer_title: str = "Тестовый ролик · Sintel"
    recommended_cue_sec: float


# --- 2. External Movie Catalog & Real Audience Reviews ---


class PlatformRatingBadge(StrictCyberModel):
    platform: Literal["Letterboxd", "IMDb", "Кинопоиск", "Internet Archive"]
    score: float
    scale_max: float
    normalized_10: float
    votes_count: int | None = None
    url: str | None = None


class RealAudienceReview(StrictCyberModel):
    id: str
    source: Literal["Letterboxd", "Кинопоиск", "Internet Archive"]
    author: str
    rating: float | None = None
    scale_max: float = 5.0
    sentiment: Literal["positive", "neutral", "negative"]
    text: str
    published_at: str | None = None
    language: Literal["ru", "en"] = "en"
    source_url: str | None = None


class ExternalMovieCatalogItem(StrictCyberModel):
    external_id: str
    imdb_id: str | None = None
    letterboxd_slug: str | None = None
    kinopoisk_id: int | None = None
    title: str
    original_title: str | None = None
    year: int | None = None
    cast_summary: str | None = None
    poster_url: str | None = None
    synopsis_ru: str | None = None
    playable_trailer_stream_url: str | None = None
    source: str = "Apple iTunes"
    source_url: str | None = None
    genre: str | None = None
    duration_minutes: int | None = None
    description: str | None = None
    content_rating: str | None = None


class ExternalCatalogSearchResponse(StrictCyberModel):
    query: str
    sources_queried: list[str]
    items: list[ExternalMovieCatalogItem]
    status: Literal["ok", "disabled", "unavailable", "rate_limited"] = "ok"
    storefront: str = "US"
    notice: str | None = None


class MovieEnrichmentResponse(StrictCyberModel):
    movie_id: str
    title: str
    original_title: str | None = None
    year: int | None = None
    synopsis_ru: str
    director: str | None = None
    genres: list[str]
    ratings: list[PlatformRatingBadge]
    reviews: list[RealAudienceReview]
    trailer: MovieTrailerAsset
    sources_used: list[str]
    cached: bool = False


class ImportExternalSessionRequest(StrictCyberModel):
    cinema_id: str = Field(min_length=1, max_length=64)
    hall_id: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=200)
    duration_minutes: int = Field(default=125, ge=30, le=300)
    age_rating: str = Field(default="16+", min_length=2, max_length=8)
    format: str = Field(default="2D · Atmos", min_length=2, max_length=32)
    starts_in_hours: int = Field(default=6, ge=1, le=720)
    poster_url: str | None = None
    imdb_id: str | None = None
    letterboxd_slug: str | None = None
    trailer_Preset_id: str | None = Field(default=None, alias="trailer_preset_id")


class ImportExternalSessionResponse(StrictCyberModel):
    movie_id: str
    session_id: str
    cinema_id: str
    hall_id: str
    starts_at: str
    seats_initialized: int
    trailer_stream_url: str


# --- 3. Cyber-Booking Features (Group Finder, Crowd Dynamics, Waitlist, Crypto Pass) ---


class GroupSeatBlockOption(StrictCyberModel):
    row: int
    seat_ids: list[str]
    seat_numbers: list[int]
    zone: str
    total_price_minor: int
    currency: Literal["RUB"] = "RUB"
    avg_comfort_score: int
    min_sightline_clearance: float
    avg_acoustic_score: int
    leaves_orphan_single_seat: bool
    badge_ru: str
    reason_ru: str


class GroupSeatFinderResponse(StrictCyberModel):
    session_id: str
    party_size: int
    options: list[GroupSeatBlockOption]


class SeatQuietIslandItem(StrictCyberModel):
    seat_id: str
    row: int
    number: int
    zone: str
    price_minor: int
    personal_space_score: int
    occupied_adjacent_count: int
    nearest_occupied_distance_m: float
    comfort_score: int
    label_ru: str


class SessionCrowdDynamicsResponse(StrictCyberModel):
    session_id: str
    total_seats: int
    available_seats: int
    held_seats: int
    sold_seats: int
    occupancy_percent: float
    atmosphere_mode_ru: str
    quiet_islands: list[SeatQuietIslandItem]


class SeatWaitlistCreateRequest(StrictCyberModel):
    seat_ids: list[str] = Field(min_length=1, max_length=6)
    customer_email: str = Field(min_length=3, max_length=254)


class SeatWaitlistResponse(StrictCyberModel):
    subscription_id: str
    session_id: str
    watched_seat_ids: list[str]
    currently_available_seat_ids: list[str]
    sse_stream_url: str
    created_at: str


class CryptographicTicketPassResponse(StrictCyberModel):
    ticket_id: str
    status: Literal["valid", "suspended", "revoked"]
    film_title: str
    cinema_name: str
    hall_name: str
    starts_at: str
    row: int
    number: int
    verification_url: str
    dynamic_totp_pulse: str
    pulse_valid_for_seconds: int
    offline_signature_hmac: str
    anti_screenshot_protected: bool = True
