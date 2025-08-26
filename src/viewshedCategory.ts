import { reactive } from 'vue';
import { Category, CesiumMap, VcsEvent } from '@vcmap/core';
import {
  CollectionComponentClass,
  CollectionComponentListItem,
  createListExportAction,
  createListImportAction,
  createSupportedMapMappingFunction,
  downloadText,
  MappingFunction,
  NotificationType,
  VcsUiApp,
} from '@vcmap/ui';
import { name } from '../package.json';
import Viewshed, { ViewshedOptions, ViewshedTypes } from './viewshed.js';

export type ViewshedCategoryHelper = {
  renamed: VcsEvent<{ item: Viewshed; title: string }>;
  /** Event that is raised when the visibility of a viewshed is changed. */
  visibilityChanged: VcsEvent<{ item: Viewshed; visible: boolean }>;
  /** Sets a single viewshed item as selected by providing its name. */
  setSelection(itemName: string | null): void;
  /** Clears all selected items. */
  clearSelection(): void;
  /** Sets the visibility of a viewshed item by providing its name and a boolean value. */
  setVisibility(itemName: string, visible: boolean): void;
  /** Adds a viewshed to the categories collection. Also assigns new title to the viewshed. */
  add(viewshed: import('./viewshed.js').default): void;
  /** Removes viewshed from category collection by providing a name. */
  remove(itemName: string): void;
  /** The collection component of the category. */
  collectionComponent: CollectionComponentClass<Viewshed>;
  /** Destroys category helper */
  destroy(): void;
};

class ViewshedCategory extends Category<Viewshed> {
  static get className(): string {
    return 'ViewshedCategory';
  }

  async _deserializeItem(item: ViewshedOptions): Promise<Viewshed> {
    const cesiumMap = this._app?.maps.getByType(CesiumMap.className)[0] as
      | CesiumMap
      | undefined;
    if (cesiumMap) {
      return Promise.resolve(new Viewshed(item));
    } else {
      throw new Error('No CesiumMap available');
    }
  }
}

export default ViewshedCategory;

export function getTitleForViewshed(
  viewshedType: ViewshedTypes,
  persistedViewsheds: Viewshed[],
): string {
  let viewshedTitle: string | undefined;
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

export async function createCategory(
  app: VcsUiApp,
): Promise<ViewshedCategoryHelper> {
  const renamed = new VcsEvent<{ item: Viewshed; title: string }>();
  const visibilityChanged = new VcsEvent<{
    item: Viewshed;
    visible: boolean;
  }>();

  const { collectionComponent, category } =
    await app.categoryManager.requestCategory<Viewshed>(
      {
        type: ViewshedCategory.className,
        name: 'Viewsheds',
        title: 'viewshed.viewshedCategory',
      },
      name,
      { selectable: true, renamable: true, removable: true },
    );

  collectionComponent.addItemMapping({
    mappingFunction: createSupportedMapMappingFunction(
      [CesiumMap.className],
      app.maps,
    ),
    owner: name,
  });

  const itemMappingFunction: MappingFunction<Viewshed> = (
    item: Viewshed,
    _c: CollectionComponentClass<Viewshed>,
    listItem: CollectionComponentListItem,
  ): void => {
    listItem.title = item.properties.title as string;

    listItem.titleChanged = (title): void => {
      item.properties.title = title;
      listItem.title = title;
      renamed.raiseEvent({ item, title });
    };

    listItem.actions.push(
      reactive({
        name: 'visibilityAction',
        icon: '$vcsCheckbox',
        callback() {
          visibilityChanged.raiseEvent({ item, visible: !!listItem.visible });
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
        const { vueI18n } = app;
        const results = await Promise.all(
          files.map(async (file) => {
            const text = await file.text();
            try {
              const parsedOptions = JSON.parse(text) as ViewshedOptions[];
              return parsedOptions.map((options) => new Viewshed(options));
            } catch (e) {
              app.notifier.add({
                type: NotificationType.ERROR,
                message: vueI18n.t('components.import.failure', {
                  fileName: file.name,
                }),
              });
            }
            return [];
          }),
        );

        const viewshedsToImport = results.flat();
        const imported = viewshedsToImport
          .map((v) => category.collection.add(v))
          .filter((id) => id != null);
        const importedDelta = viewshedsToImport.length - imported.length;
        if (importedDelta > 0) {
          app.notifier.add({
            type: NotificationType.WARNING,
            message: vueI18n.t('components.import.addFailure', [importedDelta]),
          });
          return false;
        }
        if (imported.length > 0) {
          app.notifier.add({
            type: NotificationType.SUCCESS,
            message: vueI18n.t('components.import.featuresAdded', [
              imported.length,
            ]),
          });
        } else {
          app.notifier.add({
            type: NotificationType.ERROR,
            message: vueI18n.t('components.import.nothingAdded'),
          });
          return false;
        }
        return true;
      },
      app.windowManager,
      name,
      'category-manager',
    );

  collectionComponent.addActions([exportAction, importAction]);

  return {
    renamed,
    visibilityChanged,
    setSelection(itemName): void {
      if (itemName) {
        collectionComponent.selection.value =
          collectionComponent.items.value.filter((i) => itemName === i.name);
      }
    },
    clearSelection(): void {
      if (collectionComponent.selection.value.length) {
        collectionComponent.selection.value = [];
      }
    },
    setVisibility(itemName, visible): void {
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
    add(viewshed): void {
      viewshed.properties.title = getTitleForViewshed(viewshed.type, [
        ...category.collection,
      ] as Viewshed[]);
      category.collection.add(viewshed);
    },
    remove(itemName): void {
      const item = category.collection.getByKey(itemName);
      if (item) {
        category.collection.remove(item);
      }
    },
    collectionComponent,
    destroy(): void {
      app.categoryManager.removeOwner(name);
      renamed.destroy();
      visibilityChanged.destroy();
      destroyExportAction();
      destroyImportAction();
    },
  };
}
