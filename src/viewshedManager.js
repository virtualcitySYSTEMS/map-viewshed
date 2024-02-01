import { nextTick, ref, shallowRef } from 'vue';
import {
  CesiumMap,
  EventType,
  Projection,
  SessionType,
  VectorLayer,
  markVolatile,
  maxZIndex,
  startEditFeaturesSession,
  startEditGeometrySession,
  wgs84Projection,
} from '@vcmap/core';
import { HeightReference } from '@vcmap-cesium/engine';
import { Feature } from 'ol';
import { Point } from 'ol/geom';
import { Style } from 'ol/style.js';
import { unByKey } from 'ol/Observable.js';
import Viewshed from './viewshed.js';
import ViewshedInteraction from './viewshedInteraction.js';

/**
 * @typedef {Object} ViewshedManager
 * @property {import("vue").ShallowRef<import("./viewshed.js").default | null>} currentViewshed The current viewshed, that is displayed in the map.
 * @property {import("vue").Ref<null | boolean>} currentIsPersisted Whether current viewshed is persisted or not.
 * @property {import("vue").Ref<import("@vcmap/core").EditFeaturesSession | import("@vcmap/core").EditGeometrySession | null>} currentEditSession The current edit session, when in MOVE mode. Read only.
 * @property {function(import("./viewshed.js").ViewshedTypes): void} createViewshed Creates a new viewshed and stops a running create process.
 * @property {function(import("./viewshed.js").default):void} viewViewshed Changes mode to VIEW for passed Viewshed.
 * @property {function(import("./viewshed.js").default):void} editViewshed Changes mode to EDIT for passed Viewshed.
 * @property {function(boolean):void} moveCurrentViewshed Changes mode to MOVE. If heightMode is ABSOLUTE a translate EditFeatureSession is started, if RELATIVE a EditGeometrySession is started.
 * @property {function():void} setupMultiSelect Changes mode to MULTI_SELECT.
 * @property {function():void} persistCurrent Adds current viewshed to the category collection.
 * @property {import("vue").Ref<ViewshedPluginModes | null>} mode Viewshed mode. Should only be used to watch and get the mode, not to set the mode.
 * @property {import("vue").Ref<HeightModes>} heightMode The height mode the viewshed plugin is currently in. Use changeHeightMode to change height mode when there is a currentViewshed.
 * @property {function():void} changeHeightMode Sets heightMode and calculates the Z value according to the input heightMode.
 * @property {function():void} placeCurrentFeaturesOnTerrain Places viewshed on terrain. Only available when in 'move' mode and height mode 'absolute'.
 * @property {function(boolean=):void} stop Stops the creation and removes current viewshed.
 * @property {function():void} destroy Destroys the viewshed manager.
 */

/**
 * @enum {string}
 * @property {string} ABSOLUTE Absolute
 * @property {string} RELATIVE Relative to ground
 */
export const HeightModes = {
  ABSOLUTE: 'absolute',
  RELATIVE: 'relative',
};

/**
 * @enum {string}
 * @property {string} CREATE Window with instructions is open, map interaction for setting viewshed is active
 * @property {string} VIEW Viewshed is visible in map, window is closed
 * @property {string} EDIT Viewshed is visible in map, window is open
 * @property {string} MOVE Viewshed is visible in map, window is open, move interaction is active
 */
export const ViewshedPluginModes = {
  CREATE: 'create',
  VIEW: 'view',
  EDIT: 'edit',
  MOVE: 'move',
  MULTI_SELECT: 'multiSelect',
};

/** The default height offset of a viewshed. */
export const defaultHeightOffset = 1.8;

/**
 * Creates layer with feature at a specified position.
 * @param {number[]} position Position for feature.
 * @returns {{layer: import("@vcmap/core").VectorLayer, feature: import("ol").Feature, destroy: function():void}} A layer and the added feature at the passed position.
 */
function createLayerWithFeature(position) {
  const layer = new VectorLayer({
    projection: wgs84Projection.toJSON(),
    zIndex: maxZIndex - 1,
  });
  markVolatile(layer);
  layer.activate();

  const feature = new Feature(new Point(position));
  // hide feature
  feature.setStyle(new Style({}));
  layer.addFeatures([feature]);
  layer.vectorProperties.altitudeMode = HeightReference.NONE;

  return {
    layer,
    feature,
    destroy() {
      feature.dispose();
      layer.destroy();
    },
  };
}

/**
 * Sets the feature interaction eventType for the interaction itself as well as for the position picking.
 * In case of heightMode ABSOLUTE the eventType is CLICKMOVE, and therefore sets the viewshed on top of terrain AND buildings.
 * In case of heightMode RELATIVE the eventType is NONE which means viewshed is only set on top of terrain.
 * Run featureInteraction.setActive() to reset eventType, pickPosition and pullPickedPosition.
 * @param {import("@vcmap/core").FeatureAtPixelInteraction} featureInteraction The featureInteraction of the maps eventHandler
 * @param {HeightModes} heightMode The current height mode of the viewshed plugin
 */
function updateFeatureInteraction(featureInteraction, heightMode) {
  const eventType =
    heightMode === HeightModes.ABSOLUTE ? EventType.CLICKMOVE : EventType.NONE;
  featureInteraction.setActive(eventType);
  featureInteraction.pickPosition = eventType;
  featureInteraction.pullPickedPosition = 1.8;
}

/**
 *
 * @param {import("@vcmap/ui").VcsUiApp} app The VcsUiApp instance
 * @param {import("./index.js").ViewshedPluginOptions} config
 * @param {import("./viewshedCategory.js").ViewshedCategoryHelper} categoryHelper
 * @returns {ViewshedManager} The viewshed manager, which is responsible for managing the creation and editing of viewsheds.
 */
export default function createViewshedManager(app, config, categoryHelper) {
  /** @type {import("vue").ShallowRef<import("./viewshed.js").default | null>} */
  const currentViewshed = shallowRef(null);
  /** @type {import("vue").Ref<boolean | null>} */
  const currentIsPersisted = ref(null);
  /** @type {import("vue").Ref<ViewshedPluginModes | null>} */
  const mode = ref(null);
  const heightMode = ref(HeightModes.ABSOLUTE);
  let removeInteraction = () => {};
  /** @type {import("vue").Ref<import("@vcmap/core").EditFeaturesSession | import("@vcmap/core").EditGeometrySession | null>} */
  const currentEditSession = shallowRef(null);

  let shadowMapChangedListener = () => {};

  function deactivateCurrentViewshed() {
    if (currentIsPersisted.value && currentViewshed.value) {
      currentViewshed.value.deactivate();
      categoryHelper.setVisibility(currentViewshed.value.name, false);
    } else {
      currentViewshed.value?.destroy();
    }
  }

  /**
   * Stops the viewshed operation.
   * @param {boolean} [clear=true] - Indicates whether to clear the selection.
   */
  function stop(clear = true) {
    shadowMapChangedListener();
    removeInteraction();
    deactivateCurrentViewshed();
    currentViewshed.value = null;
    if (clear) {
      categoryHelper.clearSelection();
    }
    currentIsPersisted.value = null;
    mode.value = null;
  }

  /**
   * activates a viewshed, and adds a Listener to the shadowMapChangedEvent to deactivate the viewshed plugin.
   * @param {Viewshed} viewshed
   */
  function activateViewshed(viewshed) {
    shadowMapChangedListener();
    // deactivate existing Viewsheds
    deactivateCurrentViewshed();
    if (app.maps.activeMap instanceof CesiumMap) {
      currentViewshed.value = viewshed;
      viewshed.activate(app.maps.activeMap);
      shadowMapChangedListener =
        app.maps.activeMap.shadowMapChanged.addEventListener((newShadowMap) => {
          if (newShadowMap !== currentViewshed.value?.shadowMap) {
            stop(false);
          }
        });
    }
  }

  async function createViewshed(viewshedType) {
    stop();
    await nextTick(); // so the viewshedWindow is closed with mode === null and not CREATE

    const { eventHandler } = app.maps;
    const { featureInteraction } = eventHandler;

    // create new viewshed instance
    const viewshed = new Viewshed({
      viewshedType,
      colorOptions: {
        visibleColor: config.visibleColor,
        shadowColor: config.shadowColor,
      },
      heightOffset:
        heightMode.value === HeightModes.ABSOLUTE ? 0 : defaultHeightOffset,
    });
    activateViewshed(viewshed);
    // setup viewshed create interaction
    const interaction = new ViewshedInteraction(currentViewshed.value);

    interaction.finished.addEventListener(() => {
      removeInteraction();
      if (currentViewshed.value) {
        currentViewshed.value.showPrimitive = true;
        mode.value = ViewshedPluginModes.EDIT;
      } else {
        stop();
      }
    });

    // add viewshed interaction as exclusive interaction
    const removeExclusiveInteraction = eventHandler.addExclusiveInteraction(
      interaction,
      () => {
        interaction.destroy();
      },
    );
    updateFeatureInteraction(featureInteraction, heightMode.value);
    interaction.positioned.addEventListener(() => {
      updateFeatureInteraction(featureInteraction, HeightModes.ABSOLUTE); // always set second click (lookAt) absolute
    });

    removeInteraction = () => {
      removeExclusiveInteraction();
      interaction.destroy();
      featureInteraction.setActive(); // resets featureInteractions eventType, pickPosition and pullPickedPosition

      removeInteraction = () => {};
    };

    mode.value = ViewshedPluginModes.CREATE;
  }

  function moveCurrentViewshed(activate) {
    if (currentViewshed.value && activate) {
      removeInteraction();

      const {
        layer,
        feature,
        destroy: destroyLayerWithFeature,
      } = createLayerWithFeature(currentViewshed.value.position);
      app.layers.add(layer);

      if (heightMode.value === HeightModes.ABSOLUTE) {
        currentEditSession.value = startEditFeaturesSession(app, layer);
        currentEditSession.value.setFeatures([feature]);
      } else {
        currentEditSession.value = startEditGeometrySession(app, layer);
        currentEditSession.value.setFeature(feature);
      }

      currentEditSession.value.stopped.addEventListener(() => {
        removeInteraction();
      });

      const geometryListenerKey = feature.getGeometry()?.on('change', () => {
        if (currentViewshed.value) {
          currentViewshed.value.position = Projection.mercatorToWgs84(
            /** @type {import("ol/geom").Point} */ (
              feature.getGeometry()
            ).getCoordinates(),
          );
        } else {
          stop();
        }
      });

      mode.value = ViewshedPluginModes.MOVE;

      removeInteraction = () => {
        removeInteraction = () => {}; // needs to be before currentEditSession.value.stop(), otherwise recursion

        if (geometryListenerKey) {
          unByKey(geometryListenerKey);
        }
        currentEditSession.value?.stop();
        currentEditSession.value = null;
        app.layers.remove(layer);
        destroyLayerWithFeature();
        mode.value = ViewshedPluginModes.EDIT;
      };
    } else {
      removeInteraction();
    }
  }

  /**
   * Changes the mode and the current viewshed. Only works with viewshedMode EDIT and VIEW.
   * @param {ViewshedPluginModes} viewshedMode
   * @param {import("./viewshed.js").default} viewshed
   */
  function changeMode(viewshedMode, viewshed) {
    removeInteraction();
    if (currentViewshed.value !== viewshed) {
      activateViewshed(viewshed);
      heightMode.value = viewshed.heightOffset
        ? HeightModes.RELATIVE
        : HeightModes.ABSOLUTE;
    }
    currentIsPersisted.value = !!viewshed.properties.title;
    mode.value = viewshedMode;
    if (currentIsPersisted.value) {
      categoryHelper.setVisibility(viewshed.name, true);
    }
  }

  const categoryListener = [
    categoryHelper.collectionComponent.collection.removed.addEventListener(
      (item) => {
        categoryHelper.remove(item.name);
        if (currentViewshed.value?.name === item.name) {
          stop();
        }
      },
    ),
    categoryHelper.renamed.addEventListener(({ item, title }) => {
      const viewshedWindow = app.windowManager.get(
        `${categoryHelper.collectionComponent.id}-editor`,
      );
      if (viewshedWindow && currentViewshed.value?.name === item.name) {
        viewshedWindow.state.headerTitle = title;
      }
    }),
    categoryHelper.visibilityChanged.addEventListener((item) => {
      const isCurrentlyVisible = currentViewshed.value?.name === item.name;
      if (isCurrentlyVisible) {
        stop();
      } else {
        changeMode(ViewshedPluginModes.VIEW, item);
        categoryHelper.clearSelection();
      }
      categoryHelper.setVisibility(item.name, !isCurrentlyVisible);
    }),
  ];

  function changeHeightMode(newHeightMode) {
    if (newHeightMode === heightMode.value || !currentViewshed.value) {
      return;
    }

    heightMode.value = newHeightMode;

    if (mode.value === ViewshedPluginModes.MOVE) {
      removeInteraction();
    }

    if (mode.value === ViewshedPluginModes.CREATE) {
      updateFeatureInteraction(
        app.maps.eventHandler.featureInteraction,
        newHeightMode,
      );
      currentViewshed.value.heightOffset =
        newHeightMode === HeightModes.ABSOLUTE ? 0 : defaultHeightOffset;
    } else if (mode.value === ViewshedPluginModes.EDIT) {
      const { position: currentPosition, heightOffset: currentHeightOffset } =
        currentViewshed.value;
      if (newHeightMode === HeightModes.RELATIVE) {
        /** @type {import("@vcmap/core").CesiumMap} */ (app.maps.activeMap)
          .getHeightFromTerrain([Projection.wgs84ToMercator(currentPosition)])
          .then((value) => {
            const newPosition = Projection.mercatorToWgs84(value[0]);

            if (currentViewshed.value) {
              currentViewshed.value.heightOffset =
                currentPosition[2] - newPosition[2];
              currentViewshed.value.position = newPosition;
            }
          });
      } else {
        currentViewshed.value.position = [
          currentPosition[0],
          currentPosition[1],
          currentPosition[2] + currentHeightOffset,
        ];
        currentViewshed.value.heightOffset = 0;
      }
    }
  }

  return {
    currentViewshed,
    currentIsPersisted,
    currentEditSession,
    createViewshed,
    viewViewshed(viewshed) {
      changeMode(ViewshedPluginModes.VIEW, viewshed);
    },
    editViewshed(viewshed) {
      changeMode(ViewshedPluginModes.EDIT, viewshed);
      if (currentIsPersisted.value) {
        // makes sure the editor window is open, if it is not triggered by a new selection but e.g. the tristate button
        categoryHelper.setSelection(viewshed.name);
        categoryHelper.collectionComponent.openEditorWindow(viewshed);
      }
    },
    persistCurrent() {
      if (currentViewshed.value) {
        categoryHelper.add(currentViewshed.value);
        currentIsPersisted.value = true;
        categoryHelper.setSelection(currentViewshed.value.name);
        categoryHelper.setVisibility(currentViewshed.value.name, true);
      }
    },
    moveCurrentViewshed,
    setupMultiSelect() {
      removeInteraction();
      mode.value = ViewshedPluginModes.MULTI_SELECT;
      deactivateCurrentViewshed();
      currentViewshed.value = null;
    },
    mode,
    heightMode,
    changeHeightMode,
    async placeCurrentFeaturesOnTerrain() {
      if (
        currentViewshed.value &&
        currentEditSession.value?.type === SessionType.EDIT_FEATURES &&
        app.maps.activeMap instanceof CesiumMap
      ) {
        const terrainHeight = await app.maps.activeMap.getHeightFromTerrain([
          Projection.wgs84ToMercator(currentViewshed.value?.position),
        ]);

        const diff = terrainHeight[0][2] - currentViewshed.value.position[2];

        currentEditSession.value.translate(0, 0, diff);
      }
    },
    stop,
    destroy() {
      stop();
      categoryListener.forEach((l) => l());
    },
  };
}
