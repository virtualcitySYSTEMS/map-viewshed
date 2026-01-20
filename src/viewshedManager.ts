import type { Ref, ShallowRef } from 'vue';
import { nextTick, ref, shallowRef } from 'vue';
import type {
  EditFeaturesSession,
  EditGeometrySession,
  FeatureAtPixelInteraction,
} from '@vcmap/core';
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
import { getLogger } from '@vcsuite/logger';
import { Feature } from 'ol';
import { Point } from 'ol/geom';
import { Style } from 'ol/style.js';
import { unByKey } from 'ol/Observable.js';
import type { Coordinate } from 'ol/coordinate.js';
import type { VcsUiApp } from '@vcmap/ui';
import { name } from '../package.json';
import type { ViewshedTypes } from './viewshed.js';
import Viewshed from './viewshed.js';
import ViewshedInteraction from './viewshedInteraction.js';
import type { ViewshedPluginOptions } from './index.js';
import type { ViewshedCategoryHelper } from './viewshedCategory.js';

/**
 * ViewshedManager interface for managing viewsheds
 */
export type ViewshedManager = {
  /** The current viewshed, that is displayed in the map. */
  currentViewshed: ShallowRef<Viewshed | null>;
  /** Whether current viewshed is persisted or not. */
  currentIsPersisted: Ref<null | boolean>;
  /** The current edit session, when in MOVE mode. Read only. */
  currentEditSession: Ref<EditFeaturesSession | EditGeometrySession | null>;
  /** The feature that is created for feature/geometry editing in moveCurrentViewshed. Needed to match the EditorManager API from the UI. */
  currentFeatures: ShallowRef<Feature[]>;
  /** Creates a new viewshed and stops a running create process. */
  createViewshed(viewshedType: ViewshedTypes): Promise<void>;
  /** Changes mode to VIEW for passed Viewshed. */
  viewViewshed(viewshed: Viewshed): void;
  /** Changes mode to EDIT for passed Viewshed. */
  editViewshed(viewshed: Viewshed): void;
  /** Changes mode to MOVE. If heightMode is ABSOLUTE a translate EditFeatureSession is started, if RELATIVE a EditGeometrySession is started. */
  moveCurrentViewshed(activate: boolean): void;
  /** Changes mode to MULTI_SELECT. */
  setupMultiSelect(): void;
  /** Adds current viewshed to the category collection. */
  persistCurrent(): void;
  /** Viewshed mode. Should only be used to watch and get the mode, not to set the mode. */
  mode: Ref<ViewshedPluginModes | null>;
  /** The height mode the viewshed plugin is currently in. Use changeHeightMode to change height mode when there is a currentViewshed. */
  heightMode: Ref<HeightModes>;
  /** Sets heightMode and calculates the Z value according to the input heightMode. */
  changeHeightMode(newHeightMode: HeightModes): void;
  /** Places viewshed on terrain. Only available when in 'move' mode and height mode 'absolute'. */
  placeCurrentFeaturesOnTerrain(): Promise<void>;
  /** Stops the creation and removes current viewshed. */
  stop(clear?: boolean): void;
  /** Destroys the viewshed manager. */
  destroy(): void;
};

export enum HeightModes {
  ABSOLUTE = 'absolute',
  RELATIVE = 'relative',
}

export enum ViewshedPluginModes {
  /** Window with instructions is open, map interaction for setting viewshed is active */
  CREATE = 'create',
  /** Viewshed is visible in map, window is closed */
  VIEW = 'view',
  /** Viewshed is visible in map, window is open */
  EDIT = 'edit',
  /** Viewshed is visible in map, window is open, move interaction is active */
  MOVE = 'move',
  MULTI_SELECT = 'multiSelect',
}

/** The default height offset of a viewshed. */
export const defaultHeightOffset = 1.8;

/**
 * Creates layer with feature at a specified position.
 * @param Position for feature.
 * @returns A layer and the added feature at the passed position.
 */
function createLayerWithFeature(position: Coordinate): {
  layer: VectorLayer;
  feature: Feature;
  destroy: () => void;
} {
  const layer = new VectorLayer({
    projection: wgs84Projection.toJSON(),
    zIndex: maxZIndex - 1,
  });
  markVolatile(layer);
  layer.activate().catch((e: unknown) => {
    getLogger(name).error('Failed to activate layer', String(e));
  });

  const feature = new Feature(new Point(position));
  // hide feature
  feature.setStyle(new Style({}));
  layer.addFeatures([feature]);
  layer.vectorProperties.altitudeMode = HeightReference.NONE;

  return {
    layer,
    feature,
    destroy(): void {
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
 * @param featureInteraction The featureInteraction of the maps eventHandler
 * @param heightMode The current height mode of the viewshed plugin
 */
function updateFeatureInteraction(
  featureInteraction: FeatureAtPixelInteraction,
  heightMode: HeightModes,
): void {
  const eventType =
    heightMode === HeightModes.ABSOLUTE ? EventType.CLICKMOVE : EventType.NONE;
  featureInteraction.setActive(eventType);
  featureInteraction.pickPosition = eventType;
  featureInteraction.pullPickedPosition = 1.8;
}

export default function createViewshedManager(
  app: VcsUiApp,
  config: ViewshedPluginOptions,
  categoryHelper: ViewshedCategoryHelper,
): ViewshedManager {
  const currentViewshed = shallowRef<Viewshed | null>(null);
  const currentIsPersisted = ref<boolean | null>(null);
  const mode = ref<ViewshedPluginModes | null>(null);
  const heightMode = ref(HeightModes.ABSOLUTE);
  const currentEditSession = shallowRef<
    EditFeaturesSession | EditGeometrySession | null
  >(null);
  let removeInteraction = (): void => {};
  /**
   * The feature that is created for feature/geometry editing in {@link moveCurrentViewshed}. Needed to match the EditorManager API from the UI.
   */
  const currentFeatures = shallowRef<Feature[]>([]);

  let shadowMapChangedListener = (): void => {};

  function deactivateCurrentViewshed(): void {
    if (currentIsPersisted.value && currentViewshed.value) {
      currentViewshed.value.deactivate();
      categoryHelper.setVisibility(currentViewshed.value.name, false);
    } else {
      currentViewshed.value?.destroy();
    }
  }

  /**
   * Stops the viewshed operation.
   * Indicates whether to clear the selection.
   */
  function stop(clear = true): void {
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
   */
  function activateViewshed(viewshed: Viewshed): void {
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

  async function createViewshed(viewshedType: ViewshedTypes): Promise<void> {
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
    const interaction = new ViewshedInteraction(currentViewshed.value!);

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

    removeInteraction = (): void => {
      removeExclusiveInteraction();
      interaction.destroy();
      featureInteraction.setActive(); // resets featureInteractions eventType, pickPosition and pullPickedPosition

      removeInteraction = (): void => {};
    };

    mode.value = ViewshedPluginModes.CREATE;
  }

  function moveCurrentViewshed(activate: boolean): void {
    if (currentViewshed.value && activate) {
      removeInteraction();

      const {
        layer,
        feature,
        destroy: destroyLayerWithFeature,
      } = createLayerWithFeature(currentViewshed.value.position);
      app.layers.add(layer);

      currentFeatures.value = [feature];

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
            (feature as Feature<Point>).getGeometry()!.getCoordinates(),
          );
        } else {
          stop();
        }
      });

      mode.value = ViewshedPluginModes.MOVE;

      removeInteraction = (): void => {
        removeInteraction = (): void => {}; // needs to be before currentEditSession.value.stop(), otherwise recursion

        if (geometryListenerKey) {
          unByKey(geometryListenerKey);
        }
        currentEditSession.value?.stop();
        currentEditSession.value = null;
        currentFeatures.value = [];
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
   */
  function changeMode(
    viewshedMode: ViewshedPluginModes,
    viewshed: Viewshed,
  ): void {
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
    categoryHelper.visibilityChanged.addEventListener(({ item }) => {
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

  function changeHeightMode(newHeightMode: HeightModes): void {
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
        (app.maps.activeMap as CesiumMap)
          .getHeightFromTerrain([Projection.wgs84ToMercator(currentPosition)])
          .then((value) => {
            const newPosition = Projection.mercatorToWgs84(value[0]);

            if (currentViewshed.value) {
              currentViewshed.value.heightOffset =
                currentPosition[2] - newPosition[2];
              currentViewshed.value.position = newPosition;
            }
          })
          .catch((e: unknown) => {
            getLogger(name).error(
              'Failed to get height from terrain',
              String(e),
            );
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
    currentFeatures,
    createViewshed,
    viewViewshed(viewshed): void {
      changeMode(ViewshedPluginModes.VIEW, viewshed);
    },
    editViewshed(viewshed): void {
      changeMode(ViewshedPluginModes.EDIT, viewshed);
      if (currentIsPersisted.value) {
        // makes sure the editor window is open, if it is not triggered by a new selection but e.g. the tristate button
        categoryHelper.setSelection(viewshed.name);
        // FIXME does not exist
        // categoryHelper.collectionComponent.openEditorWindow(viewshed);
      }
    },
    persistCurrent(): void {
      if (currentViewshed.value) {
        categoryHelper.add(currentViewshed.value);
        currentIsPersisted.value = true;
        categoryHelper.setSelection(currentViewshed.value.name);
        categoryHelper.setVisibility(currentViewshed.value.name, true);
      }
    },
    moveCurrentViewshed,
    setupMultiSelect(): void {
      removeInteraction();
      mode.value = ViewshedPluginModes.MULTI_SELECT;
      deactivateCurrentViewshed();
      currentViewshed.value = null;
    },
    mode,
    heightMode,
    changeHeightMode,
    async placeCurrentFeaturesOnTerrain(): Promise<void> {
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
    destroy(): void {
      stop();
      categoryListener.forEach((l) => {
        l();
      });
    },
  };
}
