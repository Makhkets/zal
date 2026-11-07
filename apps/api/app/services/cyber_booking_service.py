"""Next-gen RF Cinema Cyber-Features:
1. 3D-Aware Group Seat Finder with Aisle Detection & Anti-Orphan-Seat Etiquette
2. Crowd Heatmap & 'Quiet Islands' Personal Space Analyzer
3. Hold-Release Seat Waitlist Subscriptions
4. Anti-Screenshot Rotating HMAC Turnstile Pass Bundle
"""
from __future__ import annotations

import hashlib
import hmac
import json
import math
import time
import uuid

from app.db.connection import Database, utc_now_iso
from app.domain.cyber_models import (
    CryptographicTicketPassResponse,
    GroupSeatBlockOption,
    GroupSeatFinderResponse,
    SeatQuietIslandItem,
    SeatWaitlistCreateRequest,
    SeatWaitlistResponse,
    SessionCrowdDynamicsResponse,
)
from app.domain.enums import SeatStatus
from app.domain.models import Seat
from app.domain.seat_intelligence import compute_session_insights
from app.errors import not_found_error, validation_error
from app.repositories.booking_repo import BookingRepository
from app.repositories.catalog_repo import CatalogRepository
from app.security import TokenManager


def _are_physically_adjacent(seat_left: Seat, seat_right: Seat) -> bool:
    """Uses true 3D coordinates to detect physical adjacency vs. hall aisles."""
    if seat_left.row != seat_right.row:
        return False
    expected_span = (seat_left.width + seat_right.width) * 0.5
    dx = abs(seat_right.position.x - seat_left.position.x)
    return dx <= expected_span * 1.65


class CyberBookingService:
    def __init__(
        self,
        *,
        db: Database,
        catalog_repo: CatalogRepository,
        booking_repo: BookingRepository,
        token_manager: TokenManager,
        hmac_secret: str,
    ) -> None:
        self._db = db
        self._catalog_repo = catalog_repo
        self._booking_repo = booking_repo
        self._tokens = token_manager
        self._secret_bytes = hmac_secret.encode("utf-8")
        self._ensure_tables()

    def _ensure_tables(self) -> None:
        with self._db.immediate_transaction() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS seat_waitlist (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    customer_id TEXT NOT NULL,
                    seat_ids_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                """
            )

    def find_group_seats(
        self,
        *,
        session_id: str,
        party_size: int = 2,
        prefer_zone: str | None = None,
        max_budget_minor: int | None = None,
        avoid_orphan_gaps: bool = True,
    ) -> GroupSeatFinderResponse:
        if not (1 <= party_size <= 6):
            raise validation_error("Размер компании (party_size) должен быть от 1 до 6 мест.")

        session = self._catalog_repo.get_session(session_id)
        if session is None:
            raise not_found_error("Сеанс не найден.")
        hall = self._catalog_repo.get_hall(session.hall_id)
        availability = self._catalog_repo.get_availability(session_id)
        if hall is None or availability is None:
            raise not_found_error("Данные зала или мест не найдены.")

        insights = compute_session_insights(
            hall=hall,
            session_id=session.id,
            updated_at=availability.updated_at,
            availability_items=availability.seats,
        )
        insight_by_id = {item.seat_id: item for item in insights.seats}
        avail_by_id = {item.seat_id: item for item in availability.seats}

        rows_map: dict[int, list[Seat]] = {}
        for seat in hall.seats:
            rows_map.setdefault(seat.row, []).append(seat)
        for r_seats in rows_map.values():
            r_seats.sort(key=lambda s: (s.position.x, s.number))

        candidates: list[tuple[float, GroupSeatBlockOption]] = []

        for row_num, r_seats in rows_map.items():
            # Split row into contiguous physical segments (separated by aisles)
            segments: list[list[Seat]] = []
            for s in r_seats:
                if not segments or not _are_physically_adjacent(segments[-1][-1], s):
                    segments.append([s])
                else:
                    segments[-1].append(s)

            for seg in segments:
                if len(seg) < party_size:
                    continue
                for start_idx in range(0, len(seg) - party_size + 1):
                    block = seg[start_idx : start_idx + party_size]
                    if prefer_zone and any(s.zone.value != prefer_zone for s in block):
                        continue
                    if any(avail_by_id[s.id].status != SeatStatus.AVAILABLE for s in block):
                        continue

                    total_price = sum(avail_by_id[s.id].price_minor for s in block)
                    if max_budget_minor is not None and total_price > max_budget_minor:
                        continue

                    # Check single-seat orphan gap etiquette on left & right within segment
                    left_orphan = (
                        start_idx >= 1
                        and avail_by_id[seg[start_idx - 1].id].status == SeatStatus.AVAILABLE
                        and (
                            start_idx == 1
                            or avail_by_id[seg[start_idx - 2].id].status != SeatStatus.AVAILABLE
                        )
                    )
                    end_idx = start_idx + party_size - 1
                    right_orphan = (
                        end_idx <= len(seg) - 2
                        and avail_by_id[seg[end_idx + 1].id].status == SeatStatus.AVAILABLE
                        and (
                            end_idx == len(seg) - 2
                            or avail_by_id[seg[end_idx + 2].id].status != SeatStatus.AVAILABLE
                        )
                    )
                    leaves_orphan = left_orphan or right_orphan

                    b_insights = [insight_by_id[s.id] for s in block]
                    avg_comfort = round(sum(i.comfort_score for i in b_insights) / party_size)
                    min_clear = round(min(i.sightline_clearance for i in b_insights), 2)
                    avg_acoustic = round(sum(i.acoustics.sweet_spot_score for i in b_insights) / party_size)

                    rank_score = float(avg_comfort) + avg_acoustic * 0.25 + min_clear * 12.0
                    if avoid_orphan_gaps and leaves_orphan:
                        rank_score -= 18.0

                    badge = (
                        "Эталон для компании"
                        if avg_comfort >= 85 and not leaves_orphan
                        else ("Диванный ряд" if block[0].zone.value == "sofa" else "Удобный блок рядом")
                    )
                    reason = (
                        f"Ряд {row_num}, места {block[0].number}–{block[-1].number}: "
                        f"комфорт ракурса {avg_comfort}/100, акустика {avg_acoustic}/100"
                        + (", без одиночных пустых кресел по краям." if not leaves_orphan else ".")
                    )
                    candidates.append(
                        (
                            rank_score,
                            GroupSeatBlockOption(
                                row=row_num,
                                seat_ids=[s.id for s in block],
                                seat_numbers=[s.number for s in block],
                                zone=block[0].zone.value,
                                total_price_minor=total_price,
                                avg_comfort_score=avg_comfort,
                                min_sightline_clearance=min_clear,
                                avg_acoustic_score=avg_acoustic,
                                leaves_orphan_single_seat=leaves_orphan,
                                badge_ru=badge,
                                reason_ru=reason,
                            ),
                        )
                    )

        candidates.sort(key=lambda pair: pair[0], reverse=True)
        return GroupSeatFinderResponse(
            session_id=session_id,
            party_size=party_size,
            options=[opt for _, opt in candidates[:6]],
        )

    def get_crowd_dynamics(self, session_id: str) -> SessionCrowdDynamicsResponse:
        session = self._catalog_repo.get_session(session_id)
        if session is None:
            raise not_found_error("Сеанс не найден.")
        hall = self._catalog_repo.get_hall(session.hall_id)
        availability = self._catalog_repo.get_availability(session_id)
        if hall is None or availability is None:
            raise not_found_error("Данные сеанса не найдены.")

        insights = compute_session_insights(
            hall=hall,
            session_id=session.id,
            updated_at=availability.updated_at,
            availability_items=availability.seats,
        )
        insight_by_id = {i.seat_id: i for i in insights.seats}
        avail_by_id = {a.seat_id: a for a in availability.seats}

        total = len(hall.seats)
        sold = sum(1 for a in availability.seats if a.status == SeatStatus.SOLD)
        held = sum(1 for a in availability.seats if a.status == SeatStatus.HELD)
        available = total - sold - held
        occ_pct = round(((sold + held) / max(1, total)) * 100.0, 1)

        if occ_pct < 25.0:
            atmosphere = "Камерный зал · максимум тишины и свободного пространства"
        elif occ_pct < 65.0:
            atmosphere = "Живой зал · сбалансированная посадка без тесноты"
        else:
            atmosphere = "Высокий спрос · рекомендуем бронировать выбранный ракурс сразу"

        occupied_seats = [
            s for s in hall.seats if avail_by_id[s.id].status in (SeatStatus.SOLD, SeatStatus.HELD)
        ]

        scored_islands: list[tuple[float, SeatQuietIslandItem]] = []
        for seat in hall.seats:
            av = avail_by_id[seat.id]
            if av.status != SeatStatus.AVAILABLE:
                continue

            if occupied_seats:
                dists = [
                    math.hypot(seat.position.x - occ.position.x, seat.position.z - occ.position.z)
                    for occ in occupied_seats
                ]
                nearest_m = min(dists)
                adj_occ = sum(
                    1
                    for occ in occupied_seats
                    if occ.row == seat.row and abs(occ.position.x - seat.position.x) <= 1.8
                )
            else:
                nearest_m = round(hall.dimensions.width, 2)
                adj_occ = 0

            ins = insight_by_id[seat.id]
            space_score = min(100, round(min(nearest_m / 3.6, 1.0) * 70.0 + (30.0 if adj_occ == 0 else 5.0)))
            blended = space_score * 0.55 + ins.comfort_score * 0.45

            if adj_occ == 0 and ins.comfort_score >= 60:
                label = (
                    "Островок тишины · никого по бокам и отличный вид"
                    if nearest_m >= 2.2
                    else "Свободные соседние кресла"
                )
                scored_islands.append(
                    (
                        blended,
                        SeatQuietIslandItem(
                            seat_id=seat.id,
                            row=seat.row,
                            number=seat.number,
                            zone=seat.zone.value,
                            price_minor=av.price_minor,
                            personal_space_score=int(space_score),
                            occupied_adjacent_count=adj_occ,
                            nearest_occupied_distance_m=round(nearest_m, 2),
                            comfort_score=ins.comfort_score,
                            label_ru=label,
                        ),
                    )
                )

        scored_islands.sort(key=lambda p: p[0], reverse=True)
        return SessionCrowdDynamicsResponse(
            session_id=session_id,
            total_seats=total,
            available_seats=available,
            held_seats=held,
            sold_seats=sold,
            occupancy_percent=occ_pct,
            atmosphere_mode_ru=atmosphere,
            quiet_islands=[item for _, item in scored_islands[:6]],
        )

    def subscribe_waitlist(
        self,
        session_id: str,
        req: SeatWaitlistCreateRequest,
    ) -> SeatWaitlistResponse:
        email = req.customer_email.strip().lower()
        if "@" not in email or "." not in email.split("@", 1)[-1]:
            raise validation_error("Укажите корректный email для уведомления об освобождении места.")

        availability = self._catalog_repo.get_availability(session_id)
        if availability is None:
            raise not_found_error("Сеанс не найден.")
        avail_by_id = {a.seat_id: a.status for a in availability.seats}

        unique_seats: list[str] = []
        for sid in req.seat_ids:
            if sid not in avail_by_id:
                raise validation_error(f"Место {sid} не принадлежит выбранному сеансу.")
            if sid not in unique_seats:
                unique_seats.append(sid)

        sub_id = "wl_" + uuid.uuid4().hex[:12]
        customer_id = self._tokens.derive_customer_id(email)
        now_iso = utc_now_iso()

        with self._db.immediate_transaction() as conn:
            conn.execute(
                """
                INSERT INTO seat_waitlist (id, session_id, customer_id, seat_ids_json, created_at)
                VALUES (?, ?, ?, ?, ?);
                """,
                (sub_id, session_id, customer_id, json.dumps(unique_seats), now_iso),
            )

        already_free = [sid for sid in unique_seats if avail_by_id[sid] == SeatStatus.AVAILABLE]
        return SeatWaitlistResponse(
            subscription_id=sub_id,
            session_id=session_id,
            watched_seat_ids=unique_seats,
            currently_available_seat_ids=already_free,
            sse_stream_url=f"/api/v1/sessions/{session_id}/stream",
            created_at=now_iso,
        )

    def build_cryptographic_pass(self, qr_token: str) -> CryptographicTicketPassResponse:
        ticket = self._booking_repo.get_ticket_by_qr_token(qr_token.strip())
        if ticket is None:
            raise not_found_error("Билет не найден.")

        epoch_now = int(time.time())
        step_window = epoch_now // 30
        valid_remaining = 30 - (epoch_now % 30)

        totp_msg = f"zal:totp:v1:{ticket.id}:{ticket.status.value}:{step_window}".encode("utf-8")
        pulse_hex = hmac.new(self._secret_bytes, totp_msg, hashlib.sha256).hexdigest()[:8].upper()

        offline_payload = (
            f"zal:pass:v1|{ticket.id}|{ticket.order_id}|{ticket.status.value}|"
            f"{ticket.starts_at}|R{ticket.row}S{ticket.number}"
        ).encode("utf-8")
        offline_sig = hmac.new(self._secret_bytes, offline_payload, hashlib.sha256).hexdigest()

        return CryptographicTicketPassResponse(
            ticket_id=ticket.id,
            status=ticket.status.value,  # type: ignore[arg-type]
            film_title=ticket.film_title,
            cinema_name=ticket.cinema_name,
            hall_name=ticket.hall_name,
            starts_at=ticket.starts_at,
            row=ticket.row,
            number=ticket.number,
            verification_url=ticket.verification_url,
            dynamic_totp_pulse=pulse_hex,
            pulse_valid_for_seconds=valid_remaining,
            offline_signature_hmac=offline_sig,
            anti_screenshot_protected=True,
        )
