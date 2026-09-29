# India map boundaries

`imd_subdivisions.geojson` is the browser-ready version of the 36 meteorological-subdivision polygons published by the India Meteorological Department (IMD):

- Source: [IMD subdivision boundary GeoJSON](https://mausam.imd.gov.in/imd_latest/contents/district_shapefiles/sd_boundary.json)
- Retrieved: 29 September 2026
- Original file: `scripts/assets/imd_subdivisions_source.json`
- Preparation: `python3 scripts/prepare_imd_boundaries.py`
- Output coordinates: longitude/latitude (WGS84)

The IMD source file does not declare its coordinate reference system or a reuse license. Its coordinates are signed offsets (the usual 500 km UTM false easting has already been removed), so the conversion currently assumes WGS84 / UTM zone 43N. We checked the transformed Lakshadweep, mainland and Andaman–Nicobar extents against their known locations. A third-party note describes the source as UTM zone 44N, which conflicts with that spatial check. Confirm the CRS, Survey of India compliance, and reuse terms before operational or public use. The dashboard is a decision-support demo and does not issue warnings.
