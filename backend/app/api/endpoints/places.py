from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.api.deps import CurrentUser, Db, HttpClient, daily_limit
from app.schemas.place import Place, TodayResponse, Visit, VisitCreateRequest
from app.services import places, visits

router = APIRouter(tags=["places"])

Lat = Annotated[float | None, Query(ge=-90, le=90)]
Lng = Annotated[float | None, Query(ge=-180, le=180)]


@router.get("/places/search", response_model=list[Place], dependencies=[daily_limit("places")])
async def search_places(
    _user: CurrentUser,
    db: Db,
    http_client: HttpClient,
    q: Annotated[str, Query(min_length=1, max_length=100)],
    lat: Lat = None,
    lng: Lng = None,
) -> list[Place]:
    """Find places by name. Results near lat/lng come first when given."""
    return await places.search_places(http=http_client, db=db, query=q, lat=lat, lng=lng)


@router.get("/places/nearby", response_model=Place | None, dependencies=[daily_limit("places")])
async def nearby_place(
    _user: CurrentUser,
    db: Db,
    http_client: HttpClient,
    lat: Annotated[float, Query(ge=-90, le=90)],
    lng: Annotated[float, Query(ge=-180, le=180)],
) -> Place | None:
    """The place at these coordinates (closest within ~120 m), or null."""
    return await places.nearby_place(http=http_client, db=db, lat=lat, lng=lng)


@router.get("/places/{place_id}", response_model=Place, dependencies=[daily_limit("places")])
async def get_place(place_id: str, _user: CurrentUser, db: Db, http_client: HttpClient) -> Place:
    return await places.get_place(http=http_client, db=db, place_id=place_id)


@router.get("/visits", response_model=list[Visit])
async def list_visits(current_user: CurrentUser, db: Db) -> list[Visit]:
    """Upcoming visits, soonest first (visits stay listed for 3 h after they start)."""
    return await visits.list_upcoming_visits(db=db, uid=current_user["uid"])


@router.post("/visits", response_model=Visit, status_code=status.HTTP_201_CREATED)
async def create_visit(
    payload: VisitCreateRequest, current_user: CurrentUser, db: Db, http_client: HttpClient
) -> Visit:
    return await visits.create_visit(db=db, http=http_client, uid=current_user["uid"], request=payload)


@router.delete("/visits/{visit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_visit(visit_id: str, current_user: CurrentUser, db: Db) -> Response:
    await visits.delete_visit(db=db, uid=current_user["uid"], visit_id=visit_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/today", response_model=TodayResponse)
async def get_today(current_user: CurrentUser, db: Db) -> TodayResponse:
    """Today screen: greeting name, next visit, and map pins from your Tango (home area excluded)."""
    return await visits.build_today(db=db, uid=current_user["uid"])
