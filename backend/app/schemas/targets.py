"""Acceptance targets: the YAML file format and the public response."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.images import CutoutRequest, SkyPosition


class TargetEntry(BaseModel):
    """One target as written in targets.yaml: ICRS at J2000.0, proper motion in mas/yr."""

    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    name: str = Field(min_length=1)
    simbad_id: str = Field(min_length=1)
    ra_deg: float = Field(ge=0, lt=360)
    dec_deg: float = Field(ge=-90, le=90)
    pmra_mas_yr: float = Field(default=0, description="Includes cos(dec).")
    pmdec_mas_yr: float = 0
    parallax_mas: float | None = None
    expected: Literal["motion", "variability"]
    detector: int | None = Field(default=None, ge=1, le=6)
    reference: str | None = None


class TargetFile(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    epoch: float = Field(ge=2000, le=2100, description="Julian year the positions are propagated to.")
    size_deg: float = Field(gt=0, le=0.5)
    targets: list[TargetEntry] = Field(min_length=1)

    @model_validator(mode="after")
    def unique_names(self):
        names = [target.name for target in self.targets]
        if len(set(names)) != len(names):
            raise ValueError("Target names must be unique.")
        return self


class CatalogPosition(SkyPosition):
    epoch: Literal["J2000.0"] = "J2000.0"
    pmra_mas_yr: float
    pmdec_mas_yr: float


class Target(BaseModel):
    name: str
    simbad_id: str
    expected: Literal["motion", "variability"]
    detector: int | None
    reference: str | None
    catalog: CatalogPosition = Field(description="Position and proper motion as recorded in targets.yaml.")
    position: SkyPosition = Field(description="Position propagated by proper motion to `epoch`.")
    motion_arcsec: float = Field(description="Angular distance between the catalog and propagated positions.")
    search: CutoutRequest = Field(description="Ready-made parameters for GET /images.")
    images_url: str


class TargetsResponse(BaseModel):
    epoch: float
    size_deg: float
    targets: list[Target]
