import { CesiumMap } from '@vcmap/core';
import { ToolboxType } from '@vcmap/ui';
import { check, ofEnum } from '@vcsuite/check';
import { reactive, watch } from 'vue';
import { ViewshedTypes } from '../viewshed.js';
import { ViewshedIcons } from './windowHelper.js';
import { ViewshedPluginModes } from '../viewshedManager.js';

/**
 * @typedef {Object} ViewshedToolbox
 * @property {import("@vcmap/ui/src/manager/toolbox/toolboxManager").SelectToolboxComponentOptions} toolbox
 * @property {function():void} destroy
 */

/**
 *
 * @param {import("@vcmap/ui").VcsUiApp} app The VcsUiApp instance
 * @param {import("../viewshedManager.js").ViewshedManager} manager The viewshed manager.
 * @param {string} name Name of toolbox.
 * @param {Array<string>} tools The tools to be available in the toolbox
 * @returns {ViewshedToolbox} A select toolbox with buttons to create 360 and cone viewshed.
 */
function createViewshedToolbox(app, manager, name, tools) {
  const toolbox = {
    type: ToolboxType.SELECT,
    action: reactive({
      name,
      currentIndex: 0,
      active: false,
      background: false,
      disabled: false,
      callback() {
        if (this.active) {
          if (this.background && manager.currentViewshed.value) {
            manager.editViewshed(manager.currentViewshed.value);
          } else {
            manager.stop();
          }
        } else {
          const toolName = this.tools[this.currentIndex].name;
          manager.createViewshed(toolName);
        }
      },
      selected(newIndex) {
        if (newIndex !== this.currentIndex) {
          this.currentIndex = newIndex;
        }
        const toolName = this.tools[this.currentIndex].name;
        manager.createViewshed(toolName);
      },
      tools: tools.flatMap((tool) => {
        if (tool === ViewshedTypes.CONE) {
          return {
            name: ViewshedTypes.CONE,
            icon: ViewshedIcons[ViewshedTypes.CONE],
            title: `viewshed.create.${ViewshedTypes.CONE}`,
          };
        } else if (tool === ViewshedTypes.THREESIXTY) {
          return {
            name: ViewshedTypes.THREESIXTY,
            icon: ViewshedIcons[ViewshedTypes.THREESIXTY],
            title: `viewshed.create.${ViewshedTypes.THREESIXTY}`,
          };
        } else {
          return [];
        }
      }),
    }),
  };

  const viewshedModeWatcher = watch(manager.mode, (mode) => {
    if (mode === ViewshedPluginModes.VIEW) {
      toolbox.action.background = true;
      toolbox.action.active = true;
    } else if (mode) {
      toolbox.action.background = false;
      toolbox.action.active = true;
    } else {
      toolbox.action.background = false;
      toolbox.action.active = false;
    }
  });

  const currentViewshedWatcher = watch(
    manager.currentViewshed,
    (currentViewshed) => {
      if (currentViewshed) {
        toolbox.action.currentIndex = toolbox.action.tools.findIndex(
          (tool) => tool.name === currentViewshed.type,
        );
      }
    },
  );

  const mapChangedListener = app.maps.mapActivated.addEventListener((map) => {
    if (map instanceof CesiumMap) {
      toolbox.action.disabled = false;
    } else {
      toolbox.action.disabled = true;
    }
  });

  return {
    destroy() {
      viewshedModeWatcher();
      currentViewshedWatcher();
      mapChangedListener();
    },
    toolbox,
  };
}

/**
 *
 * @param {import("@vcmap/ui").VcsUiApp} app The VcsUiApp instance
 * @param {import("../viewshedManager.js").ViewshedManager} manager The viewshed manager.
 * @param {string} name Name of toolbox action and owner of toolbox component
 * @param {Array<string>} tools The tools to be available in the toolbox
 * @returns {function():void} Function to remove toolbox component.
 */
export default function addToolButtons(app, manager, name, tools) {
  check(tools, [ofEnum(ViewshedTypes)]);

  const { toolbox: createToolbox, destroy: destroyCreateToolbox } =
    createViewshedToolbox(app, manager, name, tools);
  const createId = app.toolboxManager.add(createToolbox, name).id;

  return () => {
    app.toolboxManager.remove(createId);
    destroyCreateToolbox();
  };
}
