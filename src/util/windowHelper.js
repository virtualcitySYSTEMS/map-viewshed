import { computed, ref, watch } from 'vue';
import { WindowSlot } from '@vcmap/ui';
import ViewshedWindow from '../ViewshedWindow.vue';
import { name } from '../../package.json';
import { ViewshedTypes } from '../viewshed.js';
import {
  ViewshedPluginModes,
  viewshedPluginWindowId,
} from '../viewshedManager.js';

export const ViewshedIcons = {
  [ViewshedTypes.CONE]: '$vcsViewshed',
  [ViewshedTypes.THREESIXTY]: '$vcsViewshedCone',
};

/**
 * @typedef {Object} ViewshedWindow
 * @property {function():void} destroy Destroys watchers and removes window.
 * @property {function():void} toggleWindow Toggles window. Only opens window when manager has current viewshed.
 */

/**
 *
 * @param {import("../viewshedManager.js").ViewshedManager} manager The viewshed manager.
 * @param {import("@vcmap/ui").VcsUiApp} app The VcsUiApp instance
 * @returns {ViewshedWindow} Viewshed window api.
 */
export function setupViewshedWindow(manager, app) {
  /**
   * @type {import("vue").Ref<undefined | string | string[]>}
   */
  const headerTitle = ref();

  function updateWindow() {
    if (
      manager.currentViewshed.value &&
      (manager.mode.value === ViewshedPluginModes.EDIT ||
        manager.mode.value === ViewshedPluginModes.MOVE ||
        manager.mode.value === ViewshedPluginModes.CREATE)
    ) {
      headerTitle.value = [
        'viewshed.temporary',
        `viewshed.${manager.currentViewshed.value.type}`,
      ];
      if (manager.mode.value === ViewshedPluginModes.CREATE) {
        headerTitle.value = [
          'viewshed.create',
          `viewshed.${manager.currentViewshed.value.type}`,
        ];
      } else if (manager.currentViewshed.value.properties.title) {
        headerTitle.value = manager.currentViewshed.value.properties.title;
      }
      if (!app.windowManager.has(viewshedPluginWindowId)) {
        app.windowManager.add(
          {
            id: viewshedPluginWindowId,
            component: ViewshedWindow,
            parentId: 'category-manager',
            slot: WindowSlot.DYNAMIC_LEFT,
            provides: {
              manager,
            },
            state: {
              headerTitle,
              headerBadge: computed(() => !manager.currentIsPersisted.value),
              headerIcon: ViewshedIcons[manager.currentViewshed.value.type],
              styles: { width: '280px', height: 'auto' },
              infoUrlCallback: app.getHelpUrlCallback(
                'tools/viewshedTool.html',
              ),
            },
          },
          name,
        );
      }
    } else {
      app.windowManager.remove(viewshedPluginWindowId);
    }
  }

  const viewshedListener = watch(manager.currentViewshed, () => {
    updateWindow();
  });

  const windowClosedListener = app.windowManager.removed.addEventListener(
    ({ id }) => {
      if (id !== viewshedPluginWindowId) {
        return;
      }

      if (
        manager.mode.value === ViewshedPluginModes.EDIT &&
        manager.currentViewshed.value
      ) {
        manager.viewViewshed(manager.currentViewshed.value);
      } else {
        manager.stop();
      }
    },
  );

  const viewshedModeListener = watch(manager.mode, () => {
    updateWindow();
  });

  const persistedWatcher = watch(manager.currentIsPersisted, (curr, prev) => {
    if (curr && !prev) {
      updateWindow();
    }
  });

  return {
    destroy() {
      windowClosedListener();
      app.windowManager.remove(viewshedPluginWindowId);
      viewshedListener();
      persistedWatcher();
      viewshedModeListener();
    },
  };
}
