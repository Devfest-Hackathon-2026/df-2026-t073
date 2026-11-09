"""Pure rules for places and the Today map. No I/O; tested in tests/test_place_rules.py."""

import math
import re
from collections import defaultdict

from app.schemas.flashcard import FlashcardResponse, Sighting
from app.schemas.place import JpName, MapArea, MapPin, Place
from app.schemas.user import HomeArea
from app.services.review_rules.selection import area_id as review_area_id
from app.services.tango_rules import is_mastered
from app.services.tango_rules import clean_place_name

EARTH_RADIUS_M = 6_371_000
AREA_SAMPLE_SIZE = 4
# Order of preference for the neighborhood name in Google address components.
AREA_COMPONENT_TYPES = ("sublocality_level_2", "sublocality_level_1", "neighborhood", "locality")
# Tokyo neighborhoods are split into north/south/east/west parts ("Koenjikita");
# the map groups them under the base name ("Koenji").
_DIRECTION_SUFFIX = re.compile(r"(kita|minami|higashi|nishi)$", re.IGNORECASE)


def distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in meters."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def in_home_area(lat: float | None, lng: float | None, home: HomeArea | None) -> bool:
    """True if the point is inside the user's home area (never shown on the map)."""
    if home is None or lat is None or lng is None:
        return False
    return distance_m(lat, lng, home.lat, home.lng) <= home.radius_m


def clean_area(name: str) -> str:
    """'Koenjikita' -> 'Koenji'; keeps short names and names without a direction."""
    name = name.strip()
    base = _DIRECTION_SUFFIX.sub("", name)
    return base if len(base) >= 3 else name


def area_from_components(components: list[dict]) -> str:
    """Neighborhood from Google Places addressComponents (English)."""
    for wanted in AREA_COMPONENT_TYPES:
        for c in components:
            if wanted in c.get("types", []) and c.get("longText"):
                return clean_area(c["longText"])
    return ""


def search_builtin(places: list[Place], query: str) -> list[Place]:
    """Case-insensitive match on Japanese name, English name, area and category."""
    q = query.strip().lower()
    if not q:
        return []
    return [
        p
        for p in places
        if q in " ".join([p.name.text, p.name.meaning or "", p.area, p.category]).lower()
    ]


def nearest_builtin(places: list[Place], lat: float, lng: float, max_m: float) -> Place | None:
    best = min(places, key=lambda p: distance_m(lat, lng, p.lat, p.lng), default=None)
    if best is None or distance_m(lat, lng, best.lat, best.lng) > max_m:
        return None
    return best


def _sighting_area(s: Sighting, area_by_place: dict[str, str]) -> str:
    if s.place_id and area_by_place.get(s.place_id):
        return area_by_place[s.place_id]
    return clean_place_name(s.place_name)


def build_map(
    cards: list[FlashcardResponse],
    area_by_place: dict[str, str],
    home: HomeArea | None,
) -> tuple[list[MapPin], list[MapArea]]:
    """One pin per area: where the user's Tango were found.

    Sightings without coordinates, or inside the home area, are left out.
    The pin sits at the average position of the area's sightings.
    """
    points: dict[str, list[tuple[float, float]]] = defaultdict(list)
    cards_in: dict[str, dict[str, FlashcardResponse]] = defaultdict(dict)
    places_in: dict[str, set[str]] = defaultdict(set)
    latest_place: dict[str, tuple[str, str]] = {}

    for card in cards:
        for s in card.sightings:
            if s.lat is None or s.lng is None or in_home_area(s.lat, s.lng, home):
                continue
            area = _sighting_area(s, area_by_place)
            if not area:
                continue
            points[area].append((s.lat, s.lng))
            cards_in[area][card.flashcard_id] = card
            places_in[area].add(s.place_id or s.place_name)
            seen = s.seen_at.isoformat()
            if s.place_id and (area not in latest_place or seen > latest_place[area][0]):
                latest_place[area] = (seen, s.place_id)

    pins: list[MapPin] = []
    areas: list[MapArea] = []
    for area in sorted(points, key=lambda a: -len(cards_in[a])):
        pts = points[area]
        area_cards = sorted(cards_in[area].values(), key=lambda c: -c.strength)
        area_id = review_area_id(area)
        pins.append(
            MapPin(
                id=f"pin-{area_id}",
                label=area,
                count=len(area_cards),
                lat=sum(p[0] for p in pts) / len(pts),
                lng=sum(p[1] for p in pts) / len(pts),
                kind="tango",
                area_id=area_id,
                stars=sum(1 for c in area_cards if is_mastered(c.strength)),
            )
        )
        areas.append(
            MapArea(
                id=area_id,
                name=area,
                tango_count=len(area_cards),
                place_count=len(places_in[area]),
                sample=area_cards[:AREA_SAMPLE_SIZE],
                more_count=max(0, len(area_cards) - AREA_SAMPLE_SIZE),
                plan_place_id=latest_place.get(area, (None, None))[1],
            )
        )
    return pins, areas


def jp(text: str, reading: str, romaji: str, meaning: str) -> JpName:
    return JpName(text=text, reading=reading, romaji=romaji, meaning=meaning)


# Words a first-time user will likely see around any station (day-one screen).
STARTER_TANGO = [
    jp("出口", "でぐち", "deguchi", "exit"),
    jp("改札", "かいさつ", "kaisatsu", "ticket gate"),
    jp("禁煙", "きんえん", "kin'en", "no smoking"),
    jp("営業中", "えいぎょうちゅう", "eigyōchū", "open"),
]

# Used when GOOGLE_PLACES_API_KEY is not set.
BUILTIN_PLACES = [
    Place(id="builtin:menya-taiki", name=jp("麺屋 たいき", "めんや たいき", "men'ya taiki", "Menya Taiki"),
          category="Ramen restaurant", area="Koenji", lat=35.7058, lng=139.6497),
    Place(id="builtin:koenji-station", name=jp("高円寺駅", "こうえんじえき", "kōenji-eki", "Koenji Station"),
          category="Train station", area="Koenji", lat=35.7052, lng=139.6497),
    Place(id="builtin:nakano-station", name=jp("中野駅", "なかのえき", "nakano-eki", "Nakano Station"),
          category="Train station", area="Nakano", lat=35.7056, lng=139.6657),
    Place(id="builtin:nakano-ward-office", name=jp("中野区役所", "なかのくやくしょ", "nakano kuyakusho", "Nakano Ward Office"),
          category="City hall", area="Nakano", lat=35.7078, lng=139.6638),
    Place(id="builtin:nakano-broadway", name=jp("中野ブロードウェイ", "なかのぶろーどうぇい", "nakano burōdowei", "Nakano Broadway"),
          category="Shopping mall", area="Nakano", lat=35.7091, lng=139.6654),
    Place(id="builtin:asagaya-station", name=jp("阿佐ケ谷駅", "あさがやえき", "asagaya-eki", "Asagaya Station"),
          category="Train station", area="Asagaya", lat=35.7049, lng=139.6358),
    Place(id="builtin:asagaya-pearl", name=jp("阿佐谷パールセンター", "あさがやぱーるせんたー", "asagaya pāru sentā", "Asagaya Pearl Center"),
          category="Shopping street", area="Asagaya", lat=35.7044, lng=139.6359),
]
