"""FastAPI routes for 3D Screen Trailers, Web Audio DSP, External Movie Catalog, Real Reviews, and Cyber Features."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Query, Request, Response

from app.api.dependencies import AppContainer, extract_client_ip, get_container
from app.domain.cyber_models import (
    CryptographicTicketPassResponse,
    ExternalCatalogSearchResponse,
    GroupSeatFinderResponse,
    ImportExternalSessionRequest,
    ImportExternalSessionResponse,
    MovieEnrichmentResponse,
    MovieTrailerAsset,
    SeatWaitlistCreateRequest,
    SeatWaitlistResponse,
    SeatWebAudioDSPProfile,
    SessionCrowdDynamicsResponse,
    TrailerCatalogResponse,
)
from app.errors import rate_limited_error

cyber_router = APIRouter(prefix="/api/v1")


@cyber_router.get(
    "/media/trailers",
    response_model=TrailerCatalogResponse,
    tags=["3D Screen & Spatial Audio"],
)
async def list_available_3d_trailers(
    container: AppContainer = Depends(get_container),
) -> TrailerCatalogResponse:
    return container.cinema_media_service.list_trailers()


@cyber_router.get(
    "/movies/{movie_id}/trailer",
    response_model=MovieTrailerAsset,
    tags=["3D Screen & Spatial Audio"],
)
async def get_movie_3d_trailer(
    movie_id: str,
    container: AppContainer = Depends(get_container),
) -> MovieTrailerAsset:
    return container.cinema_media_service.get_movie_trailer(movie_id)


@cyber_router.options("/media/trailers/{movie_id}/stream", include_in_schema=False)
async def trailer_stream_cors_preflight(movie_id: str) -> Response:
    _ = movie_id
    return Response(
        status_code=204,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "Range, Accept, Origin",
            "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type",
            "Cross-Origin-Resource-Policy": "cross-origin",
        },
    )


@cyber_router.get(
    "/media/trailers/{movie_id}/stream",
    tags=["3D Screen & Spatial Audio"],
)
async def stream_3d_screen_trailer(
    movie_id: str,
    range_header: str | None = Header(default=None, alias="Range"),
    container: AppContainer = Depends(get_container),
) -> Response:
    return await container.cinema_media_service.proxy_trailer_stream(movie_id, range_header)


@cyber_router.get(
    "/sessions/{session_id}/seats/{seat_id}/audio-profile",
    response_model=SeatWebAudioDSPProfile,
    tags=["3D Screen & Spatial Audio"],
)
async def get_seat_webaudio_dsp_profile(
    session_id: str,
    seat_id: str,
    container: AppContainer = Depends(get_container),
) -> SeatWebAudioDSPProfile:
    return container.cinema_media_service.compute_seat_audio_dsp(session_id, seat_id)


@cyber_router.get(
    "/catalog/external/search",
    response_model=ExternalCatalogSearchResponse,
    tags=["External Catalog & Real Reviews"],
)
async def search_external_movie_catalog(
    q: str = Query(..., min_length=2, max_length=120),
    container: AppContainer = Depends(get_container),
) -> ExternalCatalogSearchResponse:
    return await container.cinema_media_service.search_external_catalog(q)


@cyber_router.get(
    "/movies/{movie_id}/enrichment",
    response_model=MovieEnrichmentResponse,
    tags=["External Catalog & Real Reviews"],
)
async def get_movie_enrichment_and_reviews(
    movie_id: str,
    letterboxd_slug: str | None = Query(default=None, max_length=120),
    container: AppContainer = Depends(get_container),
) -> MovieEnrichmentResponse:
    return await container.cinema_media_service.get_movie_enrichment(
        movie_id, letterboxd_slug_override=letterboxd_slug
    )


@cyber_router.post(
    "/catalog/import-session",
    response_model=ImportExternalSessionResponse,
    status_code=201,
    tags=["External Catalog & Real Reviews"],
)
async def import_external_movie_into_session(
    payload: ImportExternalSessionRequest,
    container: AppContainer = Depends(get_container),
) -> ImportExternalSessionResponse:
    return container.cinema_media_service.import_external_movie_session(payload)


@cyber_router.get(
    "/sessions/{session_id}/group-seats",
    response_model=GroupSeatFinderResponse,
    tags=["Cyber Booking"],
)
async def find_group_together_seats(
    session_id: str,
    party_size: int = Query(default=2, ge=1, le=6),
    prefer_zone: str | None = Query(default=None),
    max_budget_minor: int | None = Query(default=None, ge=100),
    avoid_orphan_gaps: bool = Query(default=True),
    container: AppContainer = Depends(get_container),
) -> GroupSeatFinderResponse:
    return container.cyber_booking_service.find_group_seats(
        session_id=session_id,
        party_size=party_size,
        prefer_zone=prefer_zone,
        max_budget_minor=max_budget_minor,
        avoid_orphan_gaps=avoid_orphan_gaps,
    )


@cyber_router.get(
    "/sessions/{session_id}/crowd-dynamics",
    response_model=SessionCrowdDynamicsResponse,
    tags=["Cyber Booking"],
)
async def get_session_crowd_dynamics(
    session_id: str,
    response: Response,
    container: AppContainer = Depends(get_container),
) -> SessionCrowdDynamicsResponse:
    response.headers["Cache-Control"] = "no-store"
    return container.cyber_booking_service.get_crowd_dynamics(session_id)


@cyber_router.post(
    "/sessions/{session_id}/waitlist",
    response_model=SeatWaitlistResponse,
    status_code=201,
    tags=["Cyber Booking"],
)
async def subscribe_seat_release_waitlist(
    session_id: str,
    payload: SeatWaitlistCreateRequest,
    container: AppContainer = Depends(get_container),
) -> SeatWaitlistResponse:
    return container.cyber_booking_service.subscribe_waitlist(session_id, payload)


@cyber_router.get(
    "/tickets/{token}/pass-bundle",
    response_model=CryptographicTicketPassResponse,
    tags=["Cyber Booking"],
)
async def get_cryptographic_ticket_pass_bundle(
    token: str,
    request: Request,
    response: Response,
    container: AppContainer = Depends(get_container),
) -> CryptographicTicketPassResponse:
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    client_ip = extract_client_ip(request)
    if not container.tickets_limiter.allow(client_ip):
        raise rate_limited_error("Слишком частая проверка билетов.")
    return container.cyber_booking_service.build_cryptographic_pass(token)
