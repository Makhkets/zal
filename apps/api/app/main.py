"""Startup skeleton. Booking/payment routes are assigned to the backend owner."""
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="ZAL", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Idempotency-Key"],
)


@app.get("/api/v1/health")
def health():
    return {
        "status": "ok",
        "mode": "mock" if os.getenv("PAYMENT_PROVIDER", "mock") == "mock" else "live",
        "api_version": "1.0.0",
    }
