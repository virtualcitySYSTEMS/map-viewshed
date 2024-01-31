import { reactive } from 'vue';
import { Category, CesiumMap, VcsEvent } from '@vcmap/core';
import {
  createListExportAction,
  createListImportAction,
  downloadText,
} from '@vcmap/ui';
import { name } from '../package.json';
import Viewshed from './viewshed.js';

/**
 * @typedef {Object} ViewshedCategoryHelper
 * @property {import("@vcmap/core").VcsEvent} renamed
 * @property {import("@vcmap/core").VcsEvent} visibilityChanged Event that is raised when the visibility of a viewshed is changed.
 * @property {function(string | null):void} setSelection Sets a single viewshed item as selected by providing its name.
 * @property {function():void} clearSelection Clears all selected items.
 * @property {function(string, boolean):void} setVisibility Sets the visibility of a viewshed item by providing its name and a boolean value.
 * @property {function(import("./viewshed.js").default):void} add Adds a viewshed to the categories collection. Also assigns new title to the viewshed.
 * @property {function(string):void} remove Removes viewshed from category collection by providing a name.
 * @property {import("@vcmap/ui").CollectionComponent} collectionComponent The collection component of the category.
 * @property {function():void} destroy Destroys category helper
 */

class ViewshedCategory extends Category {
  static get className() {
    return 'ViewshedCategory';
  }

  async _deserializeItem(item) {
    const cesiumMap =
      /** @type {import("@vcmap/core").CesiumMap | undefined} */ (
        this._app?.maps.getByType(CesiumMap.className)[0]
      );
    if (cesiumMap) {
      return new Viewshed(item, cesiumMap);
    } else {
      throw new Error('No CesiumMap available');
    }
  }
}

export default ViewshedCategory;

/**
 *
 * @param {import("./viewshed.js").ViewshedTypes} viewshedType
 * @param {Array<import("./viewshed.js").default>} persistedViewsheds
 * @returns {string} The title for the viewshed.
 */
export function getTitleForViewshed(viewshedType, persistedViewsheds) {
  let viewshedTitle;
  let count = 0;

  const sameTypeViewshedsNames = new Set(
    persistedViewsheds
      .filter((viewshed) => viewshed.type === viewshedType)
      .map((viewshed) => viewshed.properties.title),
  );

  do {
    count += 1;
    if (!sameTypeViewshedsNames.has(`${viewshedType}-${count}`)) {
      viewshedTitle = `${viewshedType}-${count}`;
    }
  } while (!viewshedTitle);

  return viewshedTitle;
}

/**
 *
 * @param {import("@vcmap/ui").VcsUiApp} app
 * @returns {Promise<ViewshedCategoryHelper>}
 */
export async function createCategory(app) {
  const renamed = new VcsEvent();
  const visibilityChanged = new VcsEvent();

  const { collectionComponent, category } =
    await app.categoryManager.requestCategory(
      {
        type: ViewshedCategory.className,
        name: 'Viewsheds',
        title: 'Viewsheds',
      },
      name,
      {
        selectable: true,
        renamable: true,
        removable: true,
      },
    );

  const itemMappingFunction = (item, c, listItem) => {
    listItem.title = item.properties.title;

    listItem.titleChanged = (title) => {
      item.properties.title = title;
      listItem.title = title;
      renamed.raiseEvent({ item, title });
    };

    listItem.actions.push(
      reactive({
        name: 'visibilityAction',
        icon: '$vcsCheckbox',
        callback() {
          visibilityChanged.raiseEvent(item);
        },
      }),
    );
  };

  app.categoryManager.addMappingFunction(
    () => true,
    itemMappingFunction,
    name,
    [collectionComponent.id],
  );

  const { action: exportAction, destroy: destroyExportAction } =
    createListExportAction(
      collectionComponent.selection,
      () => {
        const viewsheds = collectionComponent.selection.value.map((item) =>
          collectionComponent.collection.getByKey(item.name),
        );
        downloadText(JSON.stringify(viewsheds), 'viewsheds.json');
      },
      name,
    );

  const { action: importAction, destroy: destroyImportAction } =
    createListImportAction(
      async (files) => {
        await Promise.all(
          files.map(async (file) => {
            const text = await file.text();
            const viewshedOptions = JSON.parse(text);
            viewshedOptions.forEach((options) => {
              const viewshed = new Viewshed(options);
              category.collection.add(viewshed);
            });
          }),
        );
      },
      app.windowManager,
      name,
      'category-manager',
    );

  collectionComponent.addActions([exportAction, importAction]);

  return {
    renamed,
    visibilityChanged,
    setSelection(itemName) {
      if (itemName) {
        collectionComponent.selection.value =
          collectionComponent.items.value.filter((i) => itemName === i.name);
      }
    },
    clearSelection() {
      if (collectionComponent.selection.value.length) {
        collectionComponent.selection.value = [];
      }
    },
    setVisibility(itemName, visible) {
      const listItem = collectionComponent.items.value.find(
        (i) => itemName === i.name,
      );
      if (listItem) {
        const visibilityAction = listItem.actions.find(
          (action) => action.name === 'visibilityAction',
        );
        if (visibilityAction) {
          visibilityAction.icon = visible
            ? '$vcsCheckboxChecked'
            : '$vcsCheckbox';
        }
      }
    },
    add(viewshed) {
      viewshed.properties.title = getTitleForViewshed(
        viewshed.type,
        /** @type {import("./viewshed.js").default[]} */ ([
          ...category.collection,
        ]),
      );
      category.collection.add(viewshed);
    },
    remove(itemName) {
      const item = category.collection.getByKey(itemName);
      if (item) {
        category.collection.remove(item);
      }
    },
    collectionComponent,
    destroy() {
      app.categoryManager.removeOwner(name);
      renamed.destroy();
      visibilityChanged.destroy();
      destroyExportAction();
      destroyImportAction();
    },
  };
}
