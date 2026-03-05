from geoalchemy2.shape import to_shape
from shapely.geometry import mapping


def geometry_to_geojson(geom) -> dict | None:
    if geom is None:
        return None
    return mapping(to_shape(geom))
