"""Observer and local-sky inputs shared by stars and FITS images."""
from typing import Annotated, Literal
import math
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator


class Observer(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    latitude_deg: float = Field(ge=-90, le=90)
    longitude_deg: float = Field(ge=-180, le=180)
    elevation_m: float = Field(default=0, ge=-500, le=10000)


class ProjectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    observer: Observer
    at: AwareDatetime
    mode: Literal["live", "paused"] = "live"


class SkyRequest(ProjectionRequest):
    magnitude_limit: float = Field(default=7, ge=-2, le=15)
    format: Literal["json", "binary"] = "json"
    catalog_version: str | None = Field(default=None, max_length=100)


class ClickSearchRequest(ProjectionRequest):
    direction: list[Annotated[float, Field(ge=-1, le=1)]] = Field(min_length=3, max_length=3)
    size_arcmin: float = Field(default=6, gt=0, le=30)
    detector: int | None = Field(default=None, ge=1, le=6, strict=True)
    limit: int = Field(default=20, ge=1, le=100)
    start_time: AwareDatetime | None = None
    end_time: AwareDatetime | None = None

    @model_validator(mode="after")
    def valid_direction_and_dates(self):
        if math.hypot(*self.direction) < 1e-8:
            raise ValueError("Choose a nonzero sky direction.")
        if self.start_time and self.end_time and self.start_time > self.end_time:
            raise ValueError("start_time must not be later than end_time")
        return self
