import type { VcsMap } from '@vcmap/core';
import { CesiumMap, moduleIdSymbol } from '@vcmap/core';
import type { PluginConfigEditor, VcsPlugin, VcsUiApp } from '@vcmap/ui';
import { getLogger } from '@vcsuite/logger';
import { reactive } from 'vue';
import type { ColorOptions, ViewshedOptions } from './viewshed.js';
import Viewshed, { ViewshedTypes } from './viewshed.js';
import type { ViewshedManager } from './viewshedManager.js';
import createViewshedManager, {
  ViewshedPluginModes,
} from './viewshedManager.js';
import { setupViewshedWindow } from './util/windowHelper.js';
import addViewshedToolButtons from './util/toolboxHelper.js';
import { name, version, mapVersion } from '../package.json';
import ViewshedCategory, { createCategory } from './viewshedCategory.js';
import type { ViewshedConfig } from './ViewshedConfigEditor.vue';
import ViewshedConfigEditor from './ViewshedConfigEditor.vue';
import ActivateViewshedCallback from './callbacks/activateViewshedCallback.js';
import DeactivateViewshedCallback from './callbacks/deactivateViewshedCallback.js';

export type ViewshedPluginState = {
  /** Which mode the plugin is currently in. */
  m?: ViewshedPluginModes | null;
  /** The currents viewshed options. */
  cv?: ViewshedOptions | null;
};

export type ViewshedPluginOptions = ColorOptions & {
  tools?: ViewshedTypes[];
};

export function getDefaultOptions(): ViewshedConfig {
  return {
    visibleColor: Viewshed.getDefaultOptions().colorOptions.visibleColor,
    shadowColor: Viewshed.getDefaultOptions().colorOptions.shadowColor,
    tools: [...Object.values(ViewshedTypes)],
  };
}

export type ViewshedPlugin = VcsPlugin<
  ViewshedPluginOptions,
  ViewshedPluginState
> & {
  readonly state: ViewshedPluginState;
  activate: () => void;
  deactivate: () => void;
};

function activateCachedViewshed(
  map: VcsMap,
  viewshedManager?: ViewshedManager,
  state?: ViewshedPluginState,
): void {
  if (!state?.m || !(map instanceof CesiumMap)) {
    return;
  }
  if (state.m === ViewshedPluginModes.CREATE) {
    const viewshedType = state.cv?.viewshedType ?? ViewshedTypes.CONE;
    viewshedManager?.createViewshed(viewshedType).catch((e: unknown) => {
      getLogger(name).error('Failed to create viewshed', String(e));
    });
  } else if (state.cv) {
    const activeViewshed = new Viewshed(state.cv);
    if (state.m === ViewshedPluginModes.VIEW) {
      viewshedManager?.viewViewshed(activeViewshed);
    } else {
      viewshedManager?.editViewshed(activeViewshed);
    }
  }
}

export default function plugin(options: ViewshedPluginOptions): ViewshedPlugin {
  let app: VcsUiApp | undefined;
  let viewshedManager: ViewshedManager | undefined;
  let destroy = (): void => {};

  const defaultOptions = getDefaultOptions();
  const config = { ...defaultOptions, ...options };
  const defaultState: ViewshedPluginState = reactive({});

  return {
    get name(): string {
      return name;
    },
    get version(): string {
      return version;
    },
    get mapVersion(): string {
      return mapVersion;
    },
    getDefaultOptions,
    state: defaultState,
    async initialize(
      vcsUiApp: VcsUiApp,
      state?: ViewshedPluginState,
    ): Promise<void> {
      app = vcsUiApp;
      app.callbackClassRegistry.registerClass(
        this[moduleIdSymbol],
        ActivateViewshedCallback.className,
        ActivateViewshedCallback,
      );
      app.callbackClassRegistry.registerClass(
        this[moduleIdSymbol],
        DeactivateViewshedCallback.className,
        DeactivateViewshedCallback,
      );
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
        config.tools || defaultOptions.tools,
      );
      const { destroy: destroyViewshedWindow } = setupViewshedWindow(
        viewshedManager,
        vcsUiApp,
        viewshedCategoryHelper.collectionComponent,
      );

      const { activeMap } = vcsUiApp.maps;

      let appliedCachedViewshed = false;
      if (activeMap) {
        appliedCachedViewshed = true;
        activateCachedViewshed(activeMap, viewshedManager, state);
      }
      const mapActivatedListener = vcsUiApp.maps.mapActivated.addEventListener(
        (map) => {
          viewshedManager?.stop();
          if (!appliedCachedViewshed) {
            activateCachedViewshed(map, viewshedManager, state);
            appliedCachedViewshed = true;
          }
        },
      );

      destroy = (): void => {
        mapActivatedListener();
        destroyButtons();
        destroyViewshedWindow();
        viewshedCategoryHelper?.destroy();
        viewshedManager?.destroy();
      };
    },
    activate(): void {
      if (!viewshedManager || !app) {
        getLogger(name).error('Cannot activate plugin before initialization');
        return;
      }
      if (!app.maps.activeMap) {
        getLogger(name).error('Cannot activate plugin without an active map');
        return;
      }
      activateCachedViewshed(app.maps.activeMap, viewshedManager, this.state);
    },
    deactivate(): void {
      viewshedManager?.stop();
    },
    toJSON(): ViewshedPluginOptions {
      const serial: ViewshedPluginOptions = {};
      if (config.tools && defaultOptions.tools.length !== config.tools.length) {
        serial.tools = [...config.tools];
      }
      if (
        config.shadowColor &&
        config.shadowColor !== defaultOptions.shadowColor
      ) {
        serial.shadowColor = config.shadowColor;
      }
      if (
        config.visibleColor &&
        config.visibleColor !== defaultOptions.visibleColor
      ) {
        serial.visibleColor = config.visibleColor;
      }
      return serial;
    },
    getState(forUrl?: boolean): ViewshedPluginState {
      const state: ViewshedPluginState = {};
      const mode = viewshedManager?.mode.value;
      const currentViewshed = viewshedManager?.currentViewshed.value?.toJSON();

      if (
        mode !== null &&
        mode !== ViewshedPluginModes.CREATE &&
        currentViewshed
      ) {
        state.m = mode;
        state.cv = currentViewshed;
        if (forUrl && state.cv?.properties?.title) {
          if (Object.keys(state.cv?.properties).length === 1) {
            delete state.cv.properties;
          } else {
            delete state.cv.properties.title;
          }
        }
      }

      return state;
    },
    getConfigEditors(): PluginConfigEditor<object>[] {
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
          cancel: 'Cancel',
          [ViewshedTypes.CONE]: 'Cone viewshed analysis',
          [ViewshedTypes.THREESIXTY]: '360° viewshed analysis',
          create: {
            [ViewshedTypes.CONE]: 'Create cone viewshed analysis',
            [ViewshedTypes.THREESIXTY]: 'Create 360° viewshed analysis',
          },
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
          cancel: 'Abbrechen',
          [ViewshedTypes.CONE]: 'Sichtkegelanalyse',
          [ViewshedTypes.THREESIXTY]: '360° Sichtsanalyse',
          create: {
            [ViewshedTypes.CONE]: 'Sichtkegelanalyse erstellen',
            [ViewshedTypes.THREESIXTY]: '360° Sichtanalyse erstellen',
          },
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
    destroy(): void {
      if (app) {
        app.callbackClassRegistry.unregisterClass(
          this[moduleIdSymbol],
          ActivateViewshedCallback.className,
        );
        app.callbackClassRegistry.unregisterClass(
          this[moduleIdSymbol],
          DeactivateViewshedCallback.className,
        );
      }
      destroy();
    },
  };
}
