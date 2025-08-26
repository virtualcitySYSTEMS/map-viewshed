import { CesiumMap, VcsEvent, VcsObject, VcsObjectOptions } from '@vcmap/core';
import {
  Camera,
  Cartesian3,
  Math as CesiumMath,
  ShadowMap,
  Color,
  Scene,
  PerspectiveFrustum,
  HeadingPitchRollValues,
} from '@vcmap-cesium/engine';
import { check } from '@vcsuite/check';
import { parseEnumValue } from '@vcsuite/parsers';
import { Coordinate } from 'ol/coordinate.js';
import ViewshedCameraPrimitive from './viewshedPrimitive.js';

export enum ViewshedTypes {
  /** A cone Viewshed, that can be used for visibility analysis. */
  CONE = 'cone',
  /** A 360 degree Viewshed, that can be used for sensor analysis. */
  THREESIXTY = '360',
}

type ShadowFrustumOptions = {
  /** The angle of the field of view (FOV), in radians. */
  fov: number;
  /** The aspect ratio of the frustum's width to its height. */
  aspectRatio: number;
  /** The distance of the near plane. */
  near: number;
  /** The distance of the far plane. */
  far: number;
};

export type ColorOptions = {
  /** CSS color string of the visible parts of the shadow map */
  visibleColor?: string;
  /** CSS color string of the hidden parts of the shadow map */
  shadowColor?: string;
};

/**
 * Creates camera and sets frustum options and orientation.
 */
function createShadowCamera(
  scene: Scene,
  frustumOptions: ShadowFrustumOptions,
): Camera {
  const camera = new Camera(scene);

  const perspectiveFrustum = camera.frustum as PerspectiveFrustum;
  perspectiveFrustum.fov = frustumOptions.fov;
  perspectiveFrustum.near = frustumOptions.near;
  perspectiveFrustum.aspectRatio = frustumOptions.aspectRatio;
  perspectiveFrustum.far = frustumOptions.far;

  return camera;
}

type ViewshedSpecificOptions = {
  /** Whether the viewshed has a spot light with limited field of view (cone) or a point light with 360° coverage (360). */
  viewshedType: ViewshedTypes;
  /** The position of the viewshed. Height offset is added to Z value of position to determine actual height of viewshed. */
  position?: Coordinate;
  /** The frustum options with far, near, fov and aspect ratio. */
  frustumOptions?: ShadowFrustumOptions;
  /** The values for heading and pitch. Roll is ignored. */
  orientation?: HeadingPitchRollValues;
  /** The colors of the visible and the hidden areas. */
  colorOptions?: ColorOptions;
  /** Whether the viewsheds primitve should be shown. */
  showPrimitive?: boolean;
  /** Height offset. Is added to Z value of position. */
  heightOffset?: number;
};

export type ViewshedOptions = VcsObjectOptions & ViewshedSpecificOptions;

/**
 * Viewshed class consists of a Cesium Shadow map and a primitive. Since there can only be one ShadowMap for each Scene, only one viewshed instance at a time is possible.
 */
export default class Viewshed extends VcsObject {
  static get className(): string {
    return 'Viewshed';
  }

  static getDefaultOptions(): Required<
    Pick<
      ViewshedOptions,
      'colorOptions' | 'frustumOptions' | 'orientation' | 'position'
    >
  > & { colorOptions: Required<ColorOptions> } {
    return {
      colorOptions: { shadowColor: '#3333331A', visibleColor: '#FF990080' },
      frustumOptions: {
        fov: CesiumMath.PI / 3,
        near: 1.0,
        aspectRatio: 1.0,
        far: 300,
      },
      orientation: { heading: 0, pitch: 0, roll: 0 },
      position: [0, 0, 0],
    };
  }

  static MIN_DISTANCE = 10;

  private _cesiumMap: CesiumMap | null = null;

  private _shadowCamera: Camera | null = null;

  private _scene: Scene | null = null;

  private _frustumOptions: ShadowFrustumOptions;

  private _headingPitchRollValues: HeadingPitchRollValues;

  /**
   * The viewsheds position, excluding height offset, in lat/lon degrees.
   */
  private _position: Coordinate;

  private _viewshedType: ViewshedTypes;

  private _colors: { visibleColor: Color; shadowColor: Color };

  private _heightOffset: number;

  private _shadowMap: ShadowMap | null = null;

  private _primitive: ViewshedCameraPrimitive | null = null;

  private _showPrimitive: boolean;

  private _positionChanged: VcsEvent<number[]> = new VcsEvent();

  private _active = false;

  constructor(options: ViewshedOptions) {
    super(options);

    this._frustumOptions = {
      fov:
        options.frustumOptions?.fov ||
        Viewshed.getDefaultOptions().frustumOptions.fov,
      far:
        options.frustumOptions?.far ||
        Viewshed.getDefaultOptions().frustumOptions.far,
      near:
        options.frustumOptions?.near ||
        Viewshed.getDefaultOptions().frustumOptions.near,
      aspectRatio:
        options.frustumOptions?.aspectRatio ||
        Viewshed.getDefaultOptions().frustumOptions.aspectRatio,
    };

    this._headingPitchRollValues = options.orientation || {
      ...Viewshed.getDefaultOptions().orientation,
    };

    this._position = options.position || Viewshed.getDefaultOptions().position;

    this._viewshedType = parseEnumValue(
      options.viewshedType,
      ViewshedTypes,
      ViewshedTypes.CONE,
    );

    this._colors = {
      visibleColor: Color.fromCssColorString(
        options.colorOptions?.visibleColor ||
          Viewshed.getDefaultOptions().colorOptions.visibleColor,
      ),
      shadowColor: Color.fromCssColorString(
        options.colorOptions?.shadowColor ||
          Viewshed.getDefaultOptions().colorOptions.shadowColor,
      ),
    };

    this._heightOffset = options.heightOffset || 0;

    this._showPrimitive = !!options.showPrimitive;
  }

  /**
   * Sets a new position for the shadow map. If no shadow map was created yet, due to missing position, this method triggers the creation of a shadow map.
   * @param coords The new positions coordinates in degrees
   */
  set position(coords: Coordinate) {
    check(coords, [Number]);
    this._position = coords;
    if (this._shadowCamera) {
      this._shadowCamera.position = Cartesian3.fromDegrees(
        coords[0],
        coords[1],
        coords[2] + this._heightOffset,
      );
      // makes sure, that roll is always 0, even if user moves around the globe with viewshed in create mode.
      this._shadowCamera.setView({ orientation: this._headingPitchRollValues });
      this._updatePrimitive();
    }
    this._positionChanged.raiseEvent(coords);
  }

  /**
   * @returns The current position of the viewshed source.
   */
  get position(): Coordinate {
    return [...this._position];
  }

  /**
   * Getter for Event that is triggered each time the position is changed.
   * @returns The new position
   */
  get positionChanged(): VcsEvent<number[]> {
    return this._positionChanged;
  }

  /**
   * Sets the height offset of the viewshed.
   * @param value the offset that is added to the position height.
   */
  set heightOffset(value: number) {
    this._heightOffset = value;
    if (this._shadowCamera) {
      this._shadowCamera.position = Cartesian3.fromDegrees(
        this.position[0],
        this.position[1],
        this.position[2] + value,
      );
      this._updatePrimitive();
    }
  }

  get heightOffset(): number {
    return this._heightOffset;
  }

  /**
   * Sets the reach of the viewshed.
   * @param value The distance in meters.
   */
  set distance(value: number) {
    this._frustumOptions.far =
      value > Viewshed.MIN_DISTANCE ? value : Viewshed.MIN_DISTANCE;
    if (this._shadowCamera) {
      this._shadowCamera.frustum.far = this._frustumOptions.far;
      if (this._viewshedType === ViewshedTypes.THREESIXTY) {
        this._updateShadowMap();
      }
      if (this._viewshedType === ViewshedTypes.CONE) {
        this._updatePrimitive();
      }
    }
  }

  /**
   * Returns the reach of the viewshed.
   * @returns The distance in meters.
   */
  get distance(): number {
    return this._frustumOptions.far;
  }

  /**
   * Sets the field of view of a cone viewshed. Does not have a impact on 360 viewshed.
   * @param value The field of view in degrees.
   */
  set fov(value: number) {
    this._frustumOptions.fov = value * CesiumMath.RADIANS_PER_DEGREE;
    if (this._shadowCamera) {
      (this._shadowCamera.frustum as PerspectiveFrustum).fov =
        value * CesiumMath.RADIANS_PER_DEGREE;
      if (this._viewshedType === ViewshedTypes.CONE) {
        this._updateShadowMap();
        this._updatePrimitive();
      }
    }
  }

  /**
   * Returns the field of view.
   * @returns The field of view in degrees.
   */
  get fov(): number {
    return this._frustumOptions.fov * CesiumMath.DEGREES_PER_RADIAN;
  }

  /**
   * Sets the heading of a cone viewshed. Does not have impact on 360 viewshed.
   * @param value Heading in degrees.
   */
  set heading(value: number) {
    this._headingPitchRollValues.heading =
      value * CesiumMath.RADIANS_PER_DEGREE;
    if (this._shadowCamera) {
      this._shadowCamera.setView({
        orientation: {
          heading: value * CesiumMath.RADIANS_PER_DEGREE,
          pitch: this._shadowCamera.pitch,
          roll: 0,
        },
      });
      if (this._viewshedType === ViewshedTypes.CONE) {
        this._updatePrimitive();
      }
    }
  }

  get heading(): number {
    return (
      this._headingPitchRollValues.heading! * CesiumMath.DEGREES_PER_RADIAN
    );
  }

  /**
   * Sets the pitch of a cone viewshed. 0 is horizontal. Does not have impact on 360 viewshed.
   * @param value The pitch in degrees.
   */
  set pitch(value: number) {
    this._headingPitchRollValues.pitch = value * CesiumMath.RADIANS_PER_DEGREE;
    if (this._shadowCamera) {
      const amount =
        value * CesiumMath.RADIANS_PER_DEGREE - this._shadowCamera.pitch;
      this._shadowCamera.lookUp(amount);
      if (this._viewshedType === ViewshedTypes.CONE) {
        this._updatePrimitive();
      }
    }
  }

  get pitch(): number {
    return this._headingPitchRollValues.pitch! * CesiumMath.DEGREES_PER_RADIAN;
  }

  /**
   * Sets whether the primitive of the viewshed should be shown or not.
   * @param value
   */
  set showPrimitive(value: boolean) {
    this._showPrimitive = value;
    this._updatePrimitive();
  }

  /**
   * Gets if the primitive of the viewshed is shown or not.
   */
  get showPrimitive(): boolean {
    return this._showPrimitive;
  }

  get type(): ViewshedTypes {
    return this._viewshedType;
  }

  get shadowMap(): ShadowMap | null {
    return this._shadowMap;
  }

  /**
   * Deactivates the viewshed by removing primitive and removing shadowMap.
   */
  deactivate(): void {
    if (this._active) {
      this._removePrimitive();
      this._shadowMap!.enabled = false;
      // @ts-expect-error - ShadowMap destroy method exists but is not in type definitions
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      this._shadowMap?.destroy();
      this._shadowCamera = null;
      this._scene = null;
      this._cesiumMap = null;
      this._shadowMap = null;
      this._active = false;
    }
  }

  /**
   * Activates viewshed.
   * @param The cesium map to which the shadow map of the viewshed is applied to.
   */
  activate(cesiumMap: CesiumMap): void {
    if (!this._active) {
      this._active = true;
    }
    // since active === false means that this._cesiumMap === null,
    // this is always true when activating previously deactivated viewshed,
    // or when chaning the cesiumMap for an already active viewshed
    if (cesiumMap !== this._cesiumMap) {
      this._cesiumMap = cesiumMap;
      const scene = cesiumMap.getScene();
      if (scene) {
        this._shadowCamera = createShadowCamera(scene, this._frustumOptions);
        if (this._position) {
          this.position = this._position; // Applies the cached position to the shadowCamera
        }
        this._scene = scene;
      } else {
        throw new Error('CesiumMap contains no scene');
      }

      this._updateShadowMap();
      this._updatePrimitive();
    }
  }

  /**
   * Updates the shadow map by creating a new one and applying all the current parameters.
   */
  private _updateShadowMap(): void {
    if (
      !this._active ||
      !this._shadowCamera ||
      !this._cesiumMap ||
      !this._scene
    ) {
      return;
    }

    // @ts-expect-error - ShadowMap destroy method exists but is not in type definitions
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    this._shadowMap?.destroy();
    // @ts-expect-error - does not accept parameters
    this._shadowMap = new ShadowMap({
      context: this._scene.context,
      lightCamera: this._shadowCamera,
      enabled: true,
      isPointLight: this._viewshedType === ViewshedTypes.THREESIXTY,
      softShadows: true,
      fromLightSource: true,
      cascadesEnabled: false,
      pointLightRadius: this._shadowCamera.frustum.far,
      maximumDistance: 200,
      size: 2048,
    });
    this._shadowMap.viewshed = this._colors;
    this._cesiumMap.setShadowMap(this._shadowMap);
  }

  private _removePrimitive(): void {
    if (this._primitive && !this._primitive.isDestroyed()) {
      this._scene?.primitives.remove(this._primitive);
      this._primitive.destroy();
      this._primitive = null;
    }
  }

  private _updatePrimitive(): void {
    if (this._showPrimitive && this._active && this._scene) {
      this._removePrimitive();
      this._primitive = new ViewshedCameraPrimitive({
        camera: this._shadowCamera!,
        allowPicking: false,
        spot: this._viewshedType === ViewshedTypes.CONE,
      });
      this._scene.primitives.add(this._primitive);
    } else {
      this._removePrimitive();
    }
  }

  /**
   * Sets distance and, in case of cone viewsheds, also heading and pitch. Only works when viewshed is **active**.
   * @param target Point to calculate distance, heading and pitch from.
   */
  lookAt(target: number[]): void {
    if (!this._shadowCamera) {
      return;
    }

    const direction = Cartesian3.fromDegrees(target[0], target[1], target[2]);
    // accuracy of distance calculation should be enough for this usecase
    this.distance = Cartesian3.distance(this._shadowCamera.position, direction);

    if (
      this.type === ViewshedTypes.CONE &&
      !direction.equals(this._shadowCamera.position)
    ) {
      const up = new Cartesian3();

      Cartesian3.subtract(direction, this._shadowCamera.position, direction);
      Cartesian3.normalize(direction, direction);
      Cartesian3.normalize(this._shadowCamera.position, up);

      this._shadowCamera.setView({
        orientation: {
          direction,
          up,
        },
      });

      this._headingPitchRollValues.heading = this._shadowCamera.heading;
      this._headingPitchRollValues.pitch = this._shadowCamera.pitch;
    }

    this._updatePrimitive();
  }

  /**
   * Returns an object with all the settings of a viewshed instance.
   */
  toJSON(): ViewshedOptions {
    return {
      ...super.toJSON(),
      viewshedType: this.type,
      position: this.position,
      frustumOptions: { ...this._frustumOptions },
      orientation: { ...this._headingPitchRollValues },
      colorOptions: {
        visibleColor: this._colors.visibleColor.toCssHexString(),
        shadowColor: this._colors.shadowColor.toCssHexString(),
      },
      showPrimitive: this.showPrimitive,
      heightOffset: this.heightOffset,
    };
  }

  destroy(): void {
    const cesiumMap = this._cesiumMap;
    const shadowMap = this._shadowMap;
    this.deactivate();
    if (cesiumMap?.getScene()?.shadowMap === shadowMap) {
      cesiumMap.setDefaultShadowMap();
    }
  }
}
