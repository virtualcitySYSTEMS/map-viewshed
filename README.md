# @vcmap/viewshed

> Part of the [VC Map Project](https://github.com/virtualcitySYSTEMS/map-ui)

Tool to simulate a \"viewer\" and their field of vision from a certain standpoint in the map. It allows the user to see which areas and buildings can or can't be seen from a specific standpoint, regarding different viewing distances, viewers' sizes and orientations.
There are two different modes available:

- The cone viewshed mode is directional, this allows the viewing direction to be determined in addition to the viewer’s viewpoint and distance, the analysis area is limited by the field of view.
- In 360° viewshed mode, an all-round analysis is performed. Only the viewpoint and a distance that determines the analysis area are selected.

## Configuration

To add and configure the plugin add an entry with name @vcmap/viewshed to the map's config plugins section. Below the possible configuration options and their defaults are listed.

| key          | type                     | default           | description                                                             |
| ------------ | ------------------------ | ----------------- | ----------------------------------------------------------------------- |
| tools        | `Array<'cone' \| '360'>` | `['cone', '360']` | The tools/modes that should be added to the map.                        |
| shadowColor  | `string`                 | `#3333331A`       | The color of areas that **can not** be seen from the "viewers" position |
| visibleColor | `string`                 | `FF990080`        | The color of areas that **can** be seen from the "viewers" position     |
