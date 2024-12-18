import { CesiumMap, moduleIdSymbol } from '@vcmap/core';
import Viewshed, { ViewshedTypes } from './viewshed.js';
import createViewshedManager, {
  ViewshedPluginModes,
} from './viewshedManager.js';
import { setupViewshedWindow } from './util/windowHelper.js';
import addViewshedToolButtons from './util/toolboxHelper.js';
import { name, version, mapVersion } from '../package.json';
import ViewshedCategory, { createCategory } from './viewshedCategory.js';
import ViewshedConfigEditor, {
  getDefaultOptions,
} from './ViewshedConfigEditor.vue';

/**
 * @typedef {Object} ViewshedPluginState
 * @property {import("./viewshedManager.js").ViewshedPluginModes | null} mode Which mode the plugin is currently in.
 * @property {import("./viewshed.js").ViewshedOptions | null} currentViewshed The currents viewshed options.
 */

/**
 * @typedef {import("./viewshed.js").ColorOptions & {tools?: Array<ViewshedTypes>}} ViewshedPluginOptions
 */

/**
 * Implementation of VcsPlugin interface. This function should not throw! Put exceptions in initialize instead.
 * @param {ViewshedPluginOptions} config - the configuration of this plugin instance, passed in from the app.
 * @returns {import("@vcmap/ui/src/vcsUiApp").VcsPlugin<T, ViewshedPluginState>}
 */
export default function plugin(config) {
  let viewshedManager;
  let app;
  let destroy = () => {};

  return {
    get name() {
      return name;
    },
    get version() {
      return version;
    },
    get mapVersion() {
      return mapVersion;
    },
    /**
     * @param {import("@vcmap/ui").VcsUiApp} vcsUiApp
     * @param {ViewshedPluginState=} state
     * @returns {Promise<void>}
     */
    async initialize(vcsUiApp, state) {
      app = vcsUiApp;
      vcsUiApp.categoryClassRegistry.registerClass(
        this[moduleIdSymbol],
        ViewshedCategory.className,
        ViewshedCategory,
      );
      const viewshedCategoryHelper = await createCategory(vcsUiApp);
      viewshedManager = createViewshedManager(
        vcsUiApp,
        config,
        viewshedCategoryHelper,
      );
      const destroyButtons = addViewshedToolButtons(
        vcsUiApp,
        viewshedManager,
        name,
        config.tools || getDefaultOptions().tools,
      );
      const { destroy: destroyViewshedWindow } = setupViewshedWindow(
        viewshedManager,
        vcsUiApp,
        viewshedCategoryHelper.collectionComponent,
      );

      const { activeMap } = vcsUiApp.maps;
      function activateCachedViewshed(map) {
        if (state?.m && state.cv && map instanceof CesiumMap) {
          const activeViewshed = new Viewshed(state.cv);
          if (state.m === ViewshedPluginModes.VIEW) {
            viewshedManager.viewViewshed(activeViewshed);
          } else {
            viewshedManager.editViewshed(activeViewshed);
          }
        }
      }
      let appliedCachedViewshed = false;
      if (activeMap) {
        appliedCachedViewshed = true;
        activateCachedViewshed(activeMap);
      }
      const mapActivatedListener = vcsUiApp.maps.mapActivated.addEventListener(
        (map) => {
          viewshedManager.stop();
          if (!appliedCachedViewshed) {
            activateCachedViewshed(map);
            appliedCachedViewshed = true;
          }
        },
      );

      destroy = () => {
        mapActivatedListener();
        destroyButtons();
        destroyViewshedWindow();
        viewshedCategoryHelper.destroy();
        viewshedManager.destroy();
      };
    },
    /**
     * should return all default values of the configuration
     * @returns {ViewshedPluginOptions}
     */
    getDefaultOptions,
    /**
     * should return the plugin's serialization excluding all default values
     * @returns {ViewshedPluginOptions}
     */
    toJSON() {
      const serial = {};
      if (
        config.tools &&
        getDefaultOptions().tools.length !== config.tools.length
      ) {
        serial.tools = [...config.tools];
      }
      if (
        config.shadowColor &&
        config.shadowColor !== Viewshed.getDefaultOptions().shadowColor
      ) {
        serial.shadowColor = config.shadowColor;
      }
      if (
        config.visibleColor &&
        config.visibleColor !== Viewshed.getDefaultOptions().visibleColor
      ) {
        serial.visibleColor = config.visibleColor;
      }
      return serial;
    },
    /**
     * should return the plugins state
     * @param {boolean} forUrl
     * @returns {ViewshedPluginState}
     */
    getState(forUrl) {
      const state = {};
      const mode = viewshedManager.mode.value;
      const currentViewshed = viewshedManager.currentViewshed.value?.toJSON();

      if (mode !== null && mode !== 'create' && currentViewshed) {
        state.m = mode;
        state.cv = currentViewshed;
        if (forUrl && state.cv.properties?.title) {
          if (Object.keys(state.properties).length === 1) {
            delete state.cv.properties;
          } else {
            delete state.cv.properties.title;
          }
        }
      }

      return state;
    },
    /**
     * components for configuring the plugin and/ or custom items defined by the plugin
     * @returns {Array<import("@vcmap/ui").PluginConfigEditor>}
     */
    getConfigEditors() {
      return [
        {
          component: ViewshedConfigEditor,
          title: 'viewshed.editor.title',
          infoUrlCallback: app?.getHelpUrlCallback(
            '/components/plugins/viewshedToolConfig.html',
            'app-configurator',
          ),
        },
      ];
    },
    destroy: () => destroy(),
    i18n: {
      en: {
        viewshed: {
          distance: 'Distance',
          fov: 'Field of view',
          heading: 'Heading',
          pitch: 'Pitch',
          position: 'Position',
          showPrimitive: 'Show viewpoint',
          viewpoint: 'Viewpoint',
          viewshedCategory: 'Viewsheds',
          heightMode: 'Height mode',
          relative: 'Relative to ground',
          absolute: 'Absolute',
          new: 'New',
          cancel: 'Cancel',
          [ViewshedTypes.CONE]: 'Cone viewshed analysis',
          [ViewshedTypes.THREESIXTY]: '360° viewshed analysis',
          create: {
            [ViewshedTypes.CONE]: 'Create cone viewshed analysis',
            [ViewshedTypes.THREESIXTY]: 'Create 360° viewshed analysis',
          },
          addToMyWorkspace: 'Add to My Workspace',
          temporary: 'Temporary',
          jumpToViewpoint: 'Jump to viewpoint',
          returnToViewpoint: 'Return to previous viewpoint',
          move: 'Move viewpoint',
          createDescription:
            'Click the map twice. First click places the origin, second defines the distance and direction of the viewshed.',
          createThreeSixtyDescription:
            'Click the map twice. First click places the origin, second defines the distance of the viewshed.',
          remove: 'Remove',
          editor: {
            title: 'Viewshed Editor',
            general: 'General Settings',
            visibleColor: 'Visible color',
            shadowColor: 'Shadow color',
            tools: 'Tools',
          },
        },
      },
      de: {
        viewshed: {
          distance: 'Distanz',
          fov: 'Sichtfeld',
          heading: 'Ausrichtung',
          pitch: 'Neigung',
          position: 'Position',
          showPrimitive: 'Standpunkt zeigen',
          viewpoint: 'Standpunkt',
          viewshedCategory: 'Sichtbarkeitsanalysen',
          heightMode: 'Höhenmodus',
          relative: 'Relativ zum Gelände',
          absolute: 'Absolut',
          new: 'Neu',
          cancel: 'Abbrechen',
          [ViewshedTypes.CONE]: 'Sichtkegelanalyse',
          [ViewshedTypes.THREESIXTY]: '360° Sichtsanalyse',
          create: {
            [ViewshedTypes.CONE]: 'Sichtkegelanalyse erstellen',
            [ViewshedTypes.THREESIXTY]: '360° Sichtanalyse erstellen',
          },
          addToMyWorkspace: 'Zu Mein Arbeitsbereich hinzufügen',
          temporary: 'Temporäre',
          jumpToViewpoint: 'Zu Standpunkt springen',
          returnToViewpoint: 'Zu vorherigem Standpunkt zurück springen',
          move: 'Standpunkt verschieben',
          createDescription:
            'Klicken Sie zweimal in die Karte. Der erste Klick platziert den Ursprung, der zweite die Distanz und die Richtung des Sichtkegels.',
          createThreeSixtyDescription:
            'Klicken Sie zweimal in die Karte. Der erste Klick platziert den Ursprung, der zweite die Distanz der Sichtbarkeitsanalyse.',
          remove: 'Entfernen',
          editor: {
            title: 'Viewshed Editor',
            general: 'Allgemeine Einstellungen',
            visibleColor: 'Sichtbarer Bereich',
            shadowColor: 'Nicht sichtbarer Bereich',
            tools: 'Werkzeuge',
          },
        },
      },
    },
  };
}
