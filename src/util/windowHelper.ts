import { ref, watch } from 'vue';
import {
  CollectionComponentClass,
  WindowComponentOptions,
  WindowSlot,
  makeEditorCollectionComponentClass,
  VcsUiApp,
} from '@vcmap/ui';
import ViewshedWindow from '../ViewshedWindow.vue';
import { name } from '../../package.json';
import Viewshed, { ViewshedTypes } from '../viewshed.js';
import { ViewshedManager, ViewshedPluginModes } from '../viewshedManager.js';

export const ViewshedIcons = {
  [ViewshedTypes.CONE]: '$vcsViewshed',
  [ViewshedTypes.THREESIXTY]: '$vcsViewshedCone',
};

type ViewshedWindowApi = {
  /** Destroys watchers and removes window. */
  destroy: () => void;
  /** Toggles window. Only opens window when manager has current viewshed. */
  // toggleWindow: () => void;
};

/**
 *
 * @param manager The viewshed manager.
 * @param app The VcsUiApp instance
 * @param collectionComponent The collection component of the category.
 * @returns Viewshed window api.
 */
export function setupViewshedWindow(
  manager: ViewshedManager,
  app: VcsUiApp,
  collectionComponent: CollectionComponentClass<Viewshed>,
): ViewshedWindowApi {
  const headerTitle = ref<string | string[]>('');
  const headerIcon = ref();
  const windowId = `${collectionComponent.id}-editor`;

  const editor: WindowComponentOptions = {
    component: ViewshedWindow,
    provides: { manager },
    state: {
      headerTitle,
      headerIcon,
      styles: { width: '280px', height: 'auto' },
      infoUrlCallback: app.getHelpUrlCallback('tools/viewshed.html'),
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

  function updateHeader(): void {
    if (manager.currentViewshed.value) {
      headerIcon.value = ViewshedIcons[manager.currentViewshed.value.type];

      if (manager.currentIsPersisted.value) {
        headerTitle.value = manager.currentViewshed.value.properties
          .title as string;
      } else if (manager.mode.value === ViewshedPluginModes.CREATE) {
        headerTitle.value = `viewshed.create.${manager.currentViewshed.value.type}`;
      } else {
        headerTitle.value = [
          'viewshed.temporary',
          `viewshed.${manager.currentViewshed.value.type}`,
        ];
      }
    }
  }

  function updateWindow(): void {
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
    destroy(): void {
      app.windowManager.remove(windowId);
      viewshedListener();
      viewshedModeListener();
      persistedListener();
    },
  };
}
