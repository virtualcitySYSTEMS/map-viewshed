import { VcsEvent, VcsObject } from '@vcmap/core';
import {
  Camera,
  Cartesian3,
  Math as CesiumMath,
  ShadowMap,
  Color,
} from '@vcmap-cesium/engine';
import { check } from '@vcsuite/check';
import { parseEnumValue } from '@vcsuite/parsers';
import ViewshedCameraPrimitive from './viewshedPrimitive.js';

/**
 * @enum {string}
 * @property {string} CONE A cone Viewshed, that can be used for visibility analysis.
 * @property {string} THREESIXTY A 360 degree Viewshed, that can be used for sensor analysis.
 */
export const ViewshedTypes = {
  CONE: 'cone',
  THREESIXTY: '360',
};

/**
 * @typedef {Object} ShadowFrustumOptions
 * @property {number} fov The angle of the field of view (FOV), in radians.
 * @property {number} aspectRatio The aspect ratio of the frustum's width to it's height.
 * @property {number} near The distance of the near plane.
 * @property {number} far The distance of the far plane.
 */

/**
 * @typedef {Object} ColorOptions
 * @property {string=} [visibleColor] CSS color string of the visible parts of the shadow map
 * @property {string=} [shadowColor] CSS color string of the hidden parts of the shadow map
 */

/**
 * Creates camera and sets frustum options and orientation.
 * @param {import("@vcmap-cesium/engine").Scene} scene
 * @param {ShadowFrustumOptions} frustumOptions
 * @returns {import("@vcmap-cesium/engine").Camera}
 */
function createShadowCamera(scene, frustumOptions) {
  const camera = new Camera(scene);

  const perspectiveFrustum =
    /** @type {import("@vcmap-cesium/engine").PerspectiveFrustum} */ (
      camera.frustum
    );
  perspectiveFrustum.fov = frustumOptions.fov;
  perspectiveFrustum.near = frustumOptions.near;
  perspectiveFrustum.aspectRatio = frustumOptions.aspectRatio;
  perspectiveFrustum.far = frustumOptions.far;

  return camera;
}

/**
 * @typedef {Object} ViewshedSpecificOptions
 * @property {ViewshedTypes} viewshedType Whether the viewshed has a spot light with limited field of view (cone) or a point light with 360° coverage (360).
 * @property {import("ol/coordinate").Coordinate=} [position] The position of the viewshed. Height offset is added to Z value of position to determine actual height of viewshed.
 * @property {ShadowFrustumOptions} [frustumOptions] The frustum options with far, near, fov and aspect ratio.
 * @property {import("@vcmap-cesium/engine").HeadingPitchRollValues} [orientation] The values for heading and pitch. Roll is ignored.
 * @property {ColorOptions} [colorOptions] The colors of the visible and the hidden areas.
 * @property {boolean} [showPrimitive=false] Whether the viewsheds primitve should be shown.
 * @property {number} [heightOffset=0] Height offset. Is added to Z value of position.
 * @typedef {import("@vcmap/core").VcsObjectOptions & ViewshedSpecificOptions} ViewshedOptions
 */

/**
 * Viewshed class consists of a Cesium Shadow map and a primitive. Since there can only be one ShadowMap for each Scene, only one viewshed instance at a time is possible.
 */
export default class Viewshed extends VcsObject {
  static get className() {
    return 'Viewshed';
  }

  /**
   * Returns the default viewshed options.
   * @returns {{frustum: ShadowFrustumOptions, shadowColor: string, visibleColor: string, orientation: import("@vcmap-cesium/engine").HeadingPitchRollValues, position: import("ol/coordinate").Coordinate}}
   */
  static getDefaultOptions() {
    return {
      frustum: {
        fov: CesiumMath.PI / 3,
        near: 1.0,
        aspectRatio: 1.0,
        far: 300,
      },
      shadowColor: '#3333331A',
      visibleColor: '#FF990080',
      orientation: {
        heading: 0,
        pitch: 0,
        roll: 0,
      },
      position: [0, 0, 0],
    };
  }

  static MIN_DISTANCE = 10;

  /**
   * @param {ViewshedOptions} options The options for the viewshed.
   * @param {import("@vcmap/core").CesiumMap} [cesiumMap] The cesiumMap the viewshed should be applied to. If this parameter is passed, the viewshed is activated and all other viewsheds are deactivated.
   */
  constructor(options, cesiumMap) {
    super(options);
    /**
     * @type {import("@vcmap/core").CesiumMap | null}
     * @private
     */
    this._cesiumMap = null;
    /**
     * @type {import("@vcmap-cesium/engine").Camera | null}
     * @private
     */
    this._shadowCamera = null;
    /**
     * @type {import("@vcmap-cesium/engine").Scene | null}
     * @private
     */
    this._scene = null;

    /**
     * @type {ShadowFrustumOptions}
     * @private
     */
    this._frustumOptions = {
      fov:
        options.frustumOptions?.fov || Viewshed.getDefaultOptions().frustum.fov,
      far:
        options.frustumOptions?.far || Viewshed.getDefaultOptions().frustum.far,
      near:
        options.frustumOptions?.near ||
        Viewshed.getDefaultOptions().frustum.near,
      aspectRatio:
        options.frustumOptions?.aspectRatio ||
        Viewshed.getDefaultOptions().frustum.aspectRatio,
    };

    /**
     * @type {import("@vcmap-cesium/engine").HeadingPitchRollValues}
     * @private
     */
    this._headingPitchRollValues = options.orientation || {
      ...Viewshed.getDefaultOptions().orientation,
    };

    /**
     * The viewsheds position, excluding height offset, in lat/lon degrees.
     * @type {import("ol/coordinate.js").Coordinate}
     * @private
     */
    this._position = options.position || Viewshed.getDefaultOptions().position;

    /**
     * @type {ViewshedTypes}
     * @private
     */
    this._viewshedType = parseEnumValue(options.viewshedType, ViewshedTypes);
    /**
     * @type {{visibleColor: import("@vcmap-cesium/engine").Color, shadowColor: import("@vcmap-cesium/engine").Color}}
     * @private
     */
    this._colors = {
      visibleColor: Color.fromCssColorString(
        options.colorOptions?.visibleColor ||
          Viewshed.getDefaultOptions().visibleColor,
      ),
      shadowColor: Color.fromCssColorString(
        options.colorOptions?.shadowColor ||
          Viewshed.getDefaultOptions().shadowColor,
      ),
    };

    /**
     * @type {number}
     * @private
     */
    this._heightOffset = options.heightOffset || 0;

    /**
     * @type {import("@vcmap-cesium/engine").ShadowMap | null}
     * @private
     */
    this._shadowMap = null;

    /**
     * @type {ViewshedCameraPrimitive | null}
     * @private
     */
    this._primitive = null;
    /**
     * @type {boolean}
     * @private
     */
    this._showPrimitive = !!options.showPrimitive;

    /**
     * Makes sure that the viewshed instance is deactivated, if shadow map of another viewshed or plugin is applied to the scene of the CesiumMap.
     * @private
     */
    this._shadowMapChangedListener = null;

    /**
     * @type {import("@vcmap/core").VcsEvent<number[]>}
     * @private
     */
    this._positionChanged = new VcsEvent();

    if (cesiumMap) {
      this.activate(cesiumMap);
    } else {
      /**
       * @type {boolean}
       * @private
       */
      this._active = false;
    }
  }

  /**
   * Sets a new position for the shadow map. If no shadow map was created yet, due to missing position, this method triggers the creation of a shadow map.
   * @param {import("ol/coordinate").Coordinate} coords The new positions coordinates in degrees
   */
  set position(coords) {
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
   * @returns {import("ol/coordinate").Coordinate} The current position of the viewshed source.
   */
  get position() {
    return [...this._position];
  }

  /**
   * Getter for Event that is triggered each time the position is changed.
   * @returns {import("@vcmap/core").VcsEvent<number[]>} The new position
   */
  get positionChanged() {
    return this._positionChanged;
  }

  /**
   * Sets the height offset of the viewshed.
   * @param {number} value the offset that is added to the position height.
   */
  set heightOffset(value) {
    this._heightOffset = value;
    if (this._shadowCamera) {
      this._shadowCamera.position = Cartesian3.fromDegrees(
        this.position[0],
        this.position[1],
        this.position[2] + value,
      );
      this._updateShadowMap();
      this._updatePrimitive();
    }
  }

  /**
   * Getter for height offset.
   * @returns {number}
   */
  get heightOffset() {
    return this._heightOffset;
  }

  /**
   * Sets the reach of the viewshed.
   * @param {number} value The distance in meters.
   */
  set distance(value) {
    this._frustumOptions.far =
      value > Viewshed.MIN_DISTANCE ? value : Viewshed.MIN_DISTANCE;
    if (this._shadowCamera) {
      this._shadowCamera.frustum.far = this._frustumOptions.far;
      this._updateShadowMap();
      if (this._viewshedType === ViewshedTypes.CONE) {
        this._updatePrimitive();
      }
    }
  }

  /**
   * Returns the reach of the viewshed.
   * @returns {number} The distance in meters.
   */
  get distance() {
    return this._frustumOptions.far;
  }

  /**
   * Sets the field of view of a cone viewshed. Does not have a impact on 360 viewshed.
   * @param {number} value The field of view in degrees.
   */
  set fov(value) {
    this._frustumOptions.fov = value * CesiumMath.RADIANS_PER_DEGREE;
    if (this._shadowCamera) {
      /** @type {import("@vcmap-cesium/engine").PerspectiveFrustum} */ (
        this._shadowCamera.frustum
      ).fov = value * CesiumMath.RADIANS_PER_DEGREE;
      this._updateShadowMap();
      if (this._viewshedType === ViewshedTypes.CONE) {
        this._updatePrimitive();
      }
    }
  }

  /**
   * Returns the field of view.
   * @returns {number} The field of view in degrees.
   */
  get fov() {
    return this._frustumOptions.fov * CesiumMath.DEGREES_PER_RADIAN;
  }

  /**
   * Sets the heading of a cone viewshed. Does not have impact on 360 viewshed.
   * @param {number} value Heading in degrees.
   */
  set heading(value) {
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

  /**
   * Getter for the heading of a cone viewshed.
   * @returns {number} The heading in degress.
   */
  get heading() {
    return this._headingPitchRollValues.heading * CesiumMath.DEGREES_PER_RADIAN;
  }

  /**
   * Sets the pitch of a cone viewshed. 0 is horizontal. Does not have impact on 360 viewshed.
   * @param {number} value The pitch in degrees.
   */
  set pitch(value) {
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

  /**
   * Getter for the pitch of a cone viewshed.
   * @returns {number} The pitch in degrees.
   */
  get pitch() {
    return this._headingPitchRollValues.pitch * CesiumMath.DEGREES_PER_RADIAN;
  }

  /**
   * Sets whether the primitive of the viewshed should be shown or not.
   * @param {boolean} value
   */
  set showPrimitive(value) {
    this._showPrimitive = value;
    this._updatePrimitive();
  }

  /**
   * Gets if the primitive of the viewshed is shown or not.
   * @returns {boolean}
   */
  get showPrimitive() {
    return this._showPrimitive;
  }

  /**
   * Retruns the type of the Viewshed.
   * @returns {ViewshedTypes}
   */
  get type() {
    return this._viewshedType;
  }

  /**
   * Deactivates the viewshed by removing primitve and removing shadowMap.
   */
  deactivate() {
    if (this._active) {
      this._removePrimitive();
      this._shadowMapChangedListener?.();
      if (this._cesiumMap?.getScene()?.shadowMap === this._shadowMap) {
        this._cesiumMap.setDefaultShadowMap();
      }
      this._shadowMap?.destroy();
      this._shadowCamera = null;
      this._scene = null;
      this._cesiumMap = null;
      this._active = false;
    }
  }

  /**
   * Activates viewshed. Sets the CesiumMap and adds shadowMapChanged listener to CesiumMap. If viewshed is active but
   * @param {import("@vcmap/core").CesiumMap} cesiumMap The cesium map to which the shadow map of the viewshed is applied to.
   */
  activate(cesiumMap) {
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
      this._shadowMapChangedListener =
        this._cesiumMap.shadowMapChanged.addEventListener(() => {
          this.deactivate();
        });
    }
  }

  /**
   * Updates the shadow map by creating a new one and applying all the current parameters.
   */
  _updateShadowMap() {
    if (
      !this._active ||
      !this._shadowCamera ||
      !this._cesiumMap ||
      !this._scene
    ) {
      return;
    }

    // @ts-ignore
    this._shadowMap = new ShadowMap({
      // @ts-ignore
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
    this._scene.shadowMap = this._shadowMap;
    this._cesiumMap.setShadowMap(this._shadowMap);
  }

  _removePrimitive() {
    if (this._primitive) {
      this._scene?.primitives.remove(this._primitive);
      this._primitive.destroy();
      this._primitive = null;
    }
  }

  _updatePrimitive() {
    if (this._showPrimitive && this._active && this._scene) {
      this._removePrimitive();
      this._primitive = new ViewshedCameraPrimitive({
        camera: this._shadowCamera,
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
   * @param {number[]} target Point to calculate distance, heading and pitch from.
   */
  lookAt(target) {
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
   * @returns {ViewshedOptions}
   */
  toJSON() {
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

  /**
   * Destroys the viewshed.
   */
  destroy() {
    this.deactivate();
  }
}
