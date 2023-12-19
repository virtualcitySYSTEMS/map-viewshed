import { Category, CesiumMap, VcsEvent } from '@vcmap/core';
import { name } from '../package.json';
import Viewshed from './viewshed.js';

/**
 * @typedef {Object} ViewshedCategoryHelper
 * @property {import("@vcmap/core").VcsEvent} selected
 * @property {import("@vcmap/core").VcsEvent} removed
 * @property {import("@vcmap/core").VcsEvent} renamed
 * @property {function(string | null):void} setSelection Sets a single viewshed item as selected by providing its name.
 * @property {function():void} clearSelection Clears all selected items.
 * @property {function(import("./viewshed.js").default):void} add Adds a viewshed to the categories collection. Also assigns new title to the viewshed.
 * @property {function(string):void} remove Removes viewshed from category collection by providing a name.
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
  const selected = new VcsEvent();
  const removed = new VcsEvent();
  const renamed = new VcsEvent();

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
        renameable: true,
        singleSelect: true,
      },
    );

  const itemMappingFunction = (item, c, listItem) => {
    listItem.title = item.properties.title;
    listItem.actions.push({
      name: 'viewshed.remove',
      callback: () => {
        removed.raiseEvent(item);
      },
    });

    listItem.selectionChanged = (isSelected) => {
      selected.raiseEvent({ item, isSelected });
    };
    listItem.titleChanged = (title) => {
      renamed.raiseEvent({ item, title });
    };
  };

  app.categoryManager.addMappingFunction(
    () => true,
    itemMappingFunction,
    name,
    [collectionComponent.id],
  );

  return {
    selected,
    removed,
    renamed,
    setSelection(itemName) {
      if (itemName) {
        collectionComponent.selection.value =
          collectionComponent.items.value.filter((i) => itemName === i.name);
      }
    },
    clearSelection() {
      collectionComponent.selection.value = [];
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
    destroy() {
      app.categoryManager.removeOwner(name);
      selected.destroy();
      removed.destroy();
      renamed.destroy();
    },
  };
}
