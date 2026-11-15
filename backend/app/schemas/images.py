"""Public contracts for searching and reading SPHEREx image cutouts."""

from typing import Any, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator


class ImageSearchQuery(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    ra_deg: float = Field(ge=0, lt=360, description="ICRS right ascension in degrees.")
    dec_deg: float = Field(ge=-90, le=90, description="ICRS declination in degrees.")
    size_deg: float = Field(gt=0, le=0.5, description="Requested square cutout side in degrees; maximum 0.5.")
    detector: int | None = Field(default=None, ge=1, le=6)
    limit: int = Field(default=20, ge=1, le=100)
    start_time: AwareDatetime | None = Field(default=None, description="Inclusive observation-start lower bound, ISO 8601 with timezone.")
    end_time: AwareDatetime | None = Field(default=None, description="Inclusive observation-start upper bound, ISO 8601 with timezone.")

    @model_validator(mode="after")
    def ordered_dates(self):
        if self.start_time and self.end_time and self.start_time > self.end_time:
            raise ValueError("start_time must not be later than end_time")
        return self


class SkyPosition(BaseModel):
    ra_deg: float
    dec_deg: float
    frame: Literal["ICRS"] = "ICRS"


class CutoutRequest(SkyPosition):
    size_deg: float


class ObservationTime(BaseModel):
    start_mjd: float | None
    end_mjd: float | None
    start_utc: str | None
    end_utc: str | None
    time_scale: Literal["UTC"] = "UTC"


class ImageSummary(BaseModel):
    id: str
    observation_id: str | None
    detector: int | None
    collection: str = Field(description="Archive release (dr1 or qr3), not a SIA survey collection name.")
    observation: ObservationTime
    requested: CutoutRequest
    source_url: str = Field(description="Original full FITS URL for provenance; use pixels_url to render the cutout.")
    metadata_url: str
    pixels_url: str


class ImageSearchResponse(BaseModel):
    query: ImageSearchQuery
    images: list[ImageSummary]
    has_more: bool
    order: Literal["observation_start_desc"] = "observation_start_desc"


class HeaderCard(BaseModel):
    keyword: str
    value: str | int | float | bool | None
    comment: str


class ImageDataMetadata(BaseModel):
    width: int
    height: int
    dtype: Literal["float32", "float64"]
    byte_order: Literal["little"]
    array_order: Literal["C"]
    pixel_origin: Literal["lower-left"]
    unit: str | None
    finite_min: float | None
    finite_max: float | None
    nonfinite_count: int
    center: SkyPosition
    footprint: list[list[float]]
    wcs_header: list[HeaderCard]
    fits_metadata: dict[str, Any]


class ImageMetadata(ImageSummary):
    image: ImageDataMetadata
