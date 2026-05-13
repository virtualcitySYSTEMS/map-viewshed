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

## Callbacks

The Viewshed plugin registers two [VcsCallbacks](https://github.com/virtualcitySYSTEMS/map-ui/blob/main/documentation/CALLBACKS.md) that can be used in guided tours, splash screens, or any other callback-driven feature.

### ActivateViewshedCallback

Activates the Viewshed plugin and optionally sets the mode and viewshed to display.

| property        | type                                     | description                                                                                                        |
| --------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| m               | `'create' \| 'view' \| 'edit' \| 'move'` | The mode to activate the plugin in. Defaults to `create`, which starts the map interaction for placing a viewshed. |
| cv              | `ViewshedOptions`                        | Optional viewshed to display. Required for `view` and `edit` modes.                                                |
| cv.viewshedType | `'cone' \| '360'`                        | The type of viewshed to use.                                                                                       |
| cv.position     | `[number, number, number]`               | Position of the viewshed in WGS84 coordinates `[longitude, latitude, height]`.                                     |
| cv.orientation  | `{ heading, pitch, roll }`               | Heading, pitch and roll of the viewshed, in radians (cone type only).                                              |
| cv.heightOffset | `number`                                 | Height offset added to the Z value of the position.                                                                |

Minimal example — opens the create interaction for a cone viewshed:

```json
{
  "type": "ActivateViewshedCallback"
}
```

A full example displaying an existing viewshed in edit mode:

```json
{
  "type": "ActivateViewshedCallback",
  "m": "edit",
  "cv": {
    "viewshedType": "cone",
    "position": [13.4, 52.5, 50],
    "orientation": { "heading": 0.78, "pitch": -0.17, "roll": 0 }
  }
}
```

### DeactivateViewshedCallback

Deactivates the Viewshed tool.

```json
{
  "type": "DeactivateViewshedCallback"
}
```
