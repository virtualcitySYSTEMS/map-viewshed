import {
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  Matrix4,
  PerInstanceColorAppearance,
  Primitive,
  SphereGeometry,
  SphereOutlineGeometry,
  Transforms,
} from '@vcmap-cesium/engine';
import { VcsCameraPrimitive } from '@vcmap/core';

/**
 * @type {import("@vcmap-cesium/engine").Color}
 */
const scratchColor = new Color();
/**
 * @type {import("@vcmap-cesium/engine").Matrix4}
 */
const scratchMatrix = new Matrix4();

/**
 * @class
 * @extends VcsCameraPrimitive
 */
class ViewshedCameraPrimitive extends VcsCameraPrimitive {
  constructor(options) {
    super(options);
    /** @type {boolean} */
    this.spot = options.spot;
  }

  /**
   * Updates the camera primitive.
   * @param {unknown} frameState
   */
  update(frameState) {
    if (!this.show) {
      return;
    }
    if (!this.spot) {
      const planesPrimitives = this._planesPrimitives;
      const outlinePrimitives = this._outlinePrimitives;

      if (planesPrimitives.length === 0) {
        Transforms.eastNorthUpToFixedFrame(
          this._camera.positionWC,
          undefined,
          scratchMatrix,
        );
        planesPrimitives[0] = new Primitive({
          allowPicking: this.allowPicking,
          geometryInstances: new GeometryInstance({
            geometry: new SphereGeometry({
              radius: 2,
            }),
            attributes: {
              color: ColorGeometryInstanceAttribute.fromColor(
                Color.fromAlpha(this._color, 0.1, scratchColor),
              ),
            },
            modelMatrix: scratchMatrix,
          }),
          appearance: new PerInstanceColorAppearance({
            translucent: true,
            flat: true,
          }),
          asynchronous: false,
        });

        outlinePrimitives[0] = new Primitive({
          allowPicking: this.allowPicking,
          geometryInstances: new GeometryInstance({
            geometry: new SphereOutlineGeometry({
              radius: 2,
            }),
            attributes: {
              color: ColorGeometryInstanceAttribute.fromColor(this._color),
            },
            modelMatrix: scratchMatrix,
          }),
          appearance: new PerInstanceColorAppearance({
            translucent: false,
            flat: true,
          }),
          asynchronous: false,
        });
      }
      const { length } = planesPrimitives;
      for (let i = 0; i < length; ++i) {
        outlinePrimitives[i].update(frameState);
        planesPrimitives[i].update(frameState);
      }
    } else {
      super.update(frameState);
    }
  }
}

export default ViewshedCameraPrimitive;
