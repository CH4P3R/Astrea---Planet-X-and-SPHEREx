"""Public contract for the spectrum of a sky position."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.images import SkyPosition


class SpectrumQuery(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    ra_deg: float = Field(ge=0, lt=360, description="ICRS right ascension in degrees.")
    dec_deg: float = Field(ge=-90, le=90, description="ICRS declination in degrees.")
    detector: int = Field(ge=1, le=6, description="Detector whose exposures are measured.")
    radius_px: Literal[3, 4, 5] = Field(default=3, description="Aperture radius in pixels; not used by method=psf.")
    method: Literal["aperture", "psf"] = Field(
        default="psf", description="psf: fit of the file's effective PSF. aperture: flux summed in a circle, kept as the fallback.")


class SpectrumPoint(BaseModel):
    """One exposure's measurement of the source."""

    wavelength_um: float = Field(description="Central wavelength at the source's position on the detector.")
    bandwidth_um: float = Field(description="Bandwidth the file's spectral WCS gives there.")
    flux_ujy: float = Field(description="Background-subtracted flux: inside the aperture, or the fitted PSF's total. May be negative for faint sources.")
    flux_error_ujy: float | None = Field(description="One-sigma error; null when the file's variance is unusable.")
    background_mjy_sr: float = Field(description="Local background that was subtracted.")
    bad_pixels: int = Field(description="Pixels of the aperture or PSF footprint left out as unusable. With aperture, above 0 some source light is missing; with psf the flux stays complete.")
    crowded: bool = Field(description="True when the background ring was all catalogued sources, so the background may be overestimated.")
    flags: list[str] = Field(description="Quality flags within 2.5 pixels of the source; non-empty means doubtful.")
    detector: int | None
    observation_id: str | None
    observed_mjd: float
    observed_utc: str
    source_url: str = Field(description="The exposure the measurement comes from.")


class Aperture(BaseModel):
    radius_px: float
    annulus_px: list[float] = Field(description="Inner and outer radius of the background ring.")


class ExposureCounts(BaseModel):
    found: int = Field(description="Exposures covering the position.")
    measured: int = Field(description="Exposures that produced a point.")
    skipped: int = Field(description="Source too near the detector edge, or too many unusable pixels.")
    failed: int = Field(description="Archive errors; repeating the request retries only these.")


class SpectrumResponse(BaseModel):
    position: SkyPosition
    detector: int
    aperture: Aperture
    exposures: ExposureCounts
    points: list[SpectrumPoint] = Field(description="Sorted by wavelength. Not averaged: one point per exposure.")
    method: Literal["aperture", "psf"]
    flux_unit: Literal["uJy"] = "uJy"
    wavelength_unit: Literal["um"] = "um"
