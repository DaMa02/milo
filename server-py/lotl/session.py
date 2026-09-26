"""Per-user state kept by the server. In memory only: nothing is stored on disk."""
import uuid
from dataclasses import dataclass, field


@dataclass
class Session:
    lang: str = "en"
    origin: tuple = None          # (lat, lon, name) of the reference point
    node: int = None              # current explore position (graph node)
    heading: float = 0.0          # current facing, degrees from north
    came: list = None             # node path of the last move, for "behind you"
    start: tuple = None           # (node, heading) where exploration started
    stack: list = field(default_factory=list)  # saved junctions: (node, heading, came)
    plan: dict = None
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
