import { ref, watch } from 'vue';
import { WindowSlot, makeEditorCollectionComponentClass } from '@vcmap/ui';
import ViewshedWindow from '../ViewshedWindow.vue';
import { name } from '../../package.json';
import { ViewshedTypes } from '../viewshed.js';
import { ViewshedPluginModes } from '../viewshedManager.js';

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
 * @param {import("@vcmap/ui").CollectionComponent} collectionComponent The collection component of the category.
 * @returns {ViewshedWindow} Viewshed window api.
 */
export function setupViewshedWindow(manager, app, collectionComponent) {
  /**
   * @type {import("vue").Ref<undefined | string | string[]>}
   */
  const headerTitle = ref();
  const headerIcon = ref();
  const windowId = `${collectionComponent.id}-editor`;

  const editor = {
    component: ViewshedWindow,
    provides: {
      manager,
    },
    state: {
      headerTitle,
      headerIcon,
      styles: { width: '280px', height: 'auto' },
      infoUrlCallback: app.getHelpUrlCallback('tools/viewshedTool.html'),
    },
  };

  makeEditorCollectionComponentClass(app, collectionComponent, {
    editor: (item) => ({
      ...editor,
      props: {
        selection: collectionComponent.selection,
        getViewshed: () => collectionComponent.collection.getByKey(item.name),
      },
    }),
  });

  function updateHeader() {
    if (manager.currentViewshed.value) {
      headerIcon.value = ViewshedIcons[manager.currentViewshed.value.type];

      if (manager.currentIsPersisted.value) {
        headerTitle.value = manager.currentViewshed.value.properties.title;
      } else if (manager.mode.value === ViewshedPluginModes.CREATE) {
        headerTitle.value = [
          'viewshed.create',
          `viewshed.${manager.currentViewshed.value.type}`,
        ];
      } else {
        headerTitle.value = [
          'viewshed.temporary',
          `viewshed.${manager.currentViewshed.value.type}`,
        ];
      }
    }
  }

  function updateWindow() {
    updateHeader();
    if (
      manager.currentViewshed.value &&
      !manager.currentIsPersisted.value &&
      (manager.mode.value === ViewshedPluginModes.EDIT ||
        manager.mode.value === ViewshedPluginModes.MOVE ||
        manager.mode.value === ViewshedPluginModes.CREATE)
    ) {
      if (!app.windowManager.has(windowId)) {
        app.windowManager.add(
          {
            ...editor,
            id: windowId,
            parentId: 'category-manager',
            slot: WindowSlot.DYNAMIC_CHILD,
          },
          name,
        );
      }
    }
  }

  const viewshedListener = watch(manager.currentViewshed, (curr) => {
    if (curr) {
      updateWindow();
    }
  });

  const persistedListener = watch(manager.currentIsPersisted, (curr) => {
    if (curr) {
      updateHeader();
    }
  });

  const viewshedModeListener = watch(manager.mode, () => {
    if (!manager.mode.value) {
      app.windowManager.remove(windowId);
    } else {
      updateWindow();
    }
  });

  return {
    destroy() {
      app.windowManager.remove(windowId);
      viewshedListener();
      viewshedModeListener();
      persistedListener();
    },
  };
}
