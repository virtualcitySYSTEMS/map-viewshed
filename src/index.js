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
      destroy = () => {
        destroyButtons();
        destroyViewshedWindow();
        viewshedCategoryHelper.destroy();
      };

      const { activeMap } = vcsUiApp.maps;
      if (
        state?.mode &&
        state.currentViewshed &&
        activeMap instanceof CesiumMap
      ) {
        const activeViewshed = new Viewshed(state.currentViewshed, activeMap);
        if (state.mode === ViewshedPluginModes.VIEW) {
          viewshedManager.viewViewshed(activeViewshed);
        } else {
          viewshedManager.editViewshed(activeViewshed);
        }
      }
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
     * @returns {ViewshedPluginState}
     */
    getState() {
      return {
        mode: viewshedManager.mode.value,
        currentViewshed: viewshedManager.currentViewshed.value?.toJSON(),
      };
    },
    /**
     * components for configuring the plugin and/ or custom items defined by the plugin
     * @returns {Array<import("@vcmap/ui").PluginConfigEditor>}
     */
    getConfigEditors() {
      return [{ component: ViewshedConfigEditor }];
    },
    destroy,
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
          viewshed: 'Viewshed',
          heightMode: 'Height mode',
          relative: 'Relativ to ground',
          absolute: 'Absolute',
          new: 'New',
          cancel: 'Cancel',
          [ViewshedTypes.CONE]: 'Cone Viewshed',
          [ViewshedTypes.THREESIXTY]: '360° Viewshed',
          create: 'Create',
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
          showPrimitive: 'Viewpoint zeigen',
          viewpoint: 'Viewpoint',
          viewshed: 'Viewshed',
          heightMode: 'Höhenmodus',
          relative: 'Relativ zum Gelände',
          absolute: 'Absolut',
          new: 'Neu',
          cancel: 'Abbrechen',
          [ViewshedTypes.CONE]: 'Kegel Viewshed',
          [ViewshedTypes.THREESIXTY]: '360° Viewshed',
          create: 'Erzeuge',
          addToMyWorkspace: 'Zu Mein Arbeitsbereich hinzufügen',
          temporary: 'Temporärer',
          jumpToViewpoint: 'Zu Viewpoint springen',
          returnToViewpoint: 'Zu vorherigem Viewpoint zurück springen',
          move: 'Viewpoint verschieben',
          createDescription:
            'Klicke zweimal in die Karte. Der erste Klick platziert den Ursprung, der zweite die Distanz und die Richtung des Viewsheds.',
          createThreeSixtyDescription:
            'Klicke zweimal in die Karte. Der erste Klick platziert den Ursprung, der zweite die Distanz des Viewsheds.',
          remove: 'Entfernen',
          editor: {
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
