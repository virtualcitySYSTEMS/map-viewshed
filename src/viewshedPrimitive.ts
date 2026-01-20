import type { Camera } from '@vcmap-cesium/engine';
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
import type { VcsCameraPrimitiveOptions } from '@vcmap/core';
import { VcsCameraPrimitive } from '@vcmap/core';

const scratchColor = new Color();
const scratchMatrix = new Matrix4();

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
class ViewshedCameraPrimitive extends VcsCameraPrimitive {
  static get className(): string {
    return 'ViewshedCameraPrimitive';
  }

  spot: boolean;

  private _allowPicking: boolean;

  private _color: Color = Color.WHITE;

  private _camera: Camera;

  private _planesPrimitives: Primitive[] = [];

  private _outlinePrimitives: Primitive[] = [];

  constructor(
    options: VcsCameraPrimitiveOptions & {
      spot: boolean;
      camera: Camera;
      allowPicking: boolean;
    },
  ) {
    super(options);
    this.spot = options.spot;
    this._camera = options.camera;
    this._allowPicking = options.allowPicking;
  }

  update(frameState: unknown): void {
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
          allowPicking: this._allowPicking,
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
          allowPicking: this._allowPicking,
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
        // @ts-expect-error update
        outlinePrimitives[i].update(frameState);
        // @ts-expect-error update
        planesPrimitives[i].update(frameState);
      }
    } else {
      super.update(frameState);
    }
  }
}

export default ViewshedCameraPrimitive;
