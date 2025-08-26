import { CesiumMap } from '@vcmap/core';
import {
  SelectToolboxComponentOptions,
  SingleToolboxComponentOptions,
  ToolboxType,
  VcsUiApp,
} from '@vcmap/ui';
import { check, ofEnum } from '@vcsuite/check';
import { reactive, watch } from 'vue';
import { ViewshedTypes } from '../viewshed.js';
import { ViewshedIcons } from './windowHelper.js';
import { ViewshedManager, ViewshedPluginModes } from '../viewshedManager.js';

type ViewshedToolbox = {
  toolbox: SingleToolboxComponentOptions | SelectToolboxComponentOptions;
  destroy: () => void;
};

/**
 *
 * @param app The VcsUiApp instance
 * @param manager The viewshed manager.
 * @param name Name of toolbox.
 * @param tools The tools to be available in the toolbox
 * @returns A select toolbox with buttons to create 360 and cone viewshed.
 */
function createViewshedToolbox(
  app: VcsUiApp,
  manager: ViewshedManager,
  name: string,
  tools: string[],
): ViewshedToolbox {
  /**
   * @param tool The tool to create.
   * @returns A tool object.
   */
  function parseTool(
    tool: string,
  ): { name: ViewshedTypes; icon: string; title: string } | undefined {
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
      return undefined;
    }
  }

  let toolbox: SingleToolboxComponentOptions | SelectToolboxComponentOptions;
  let currentViewshedWatcher: () => void;
  if (tools.length === 1) {
    const tool = parseTool(tools[0])!;
    toolbox = {
      type: ToolboxType.SINGLE,
      action: reactive({
        ...tool,
        active: false,
        background: false,
        disabled: !(app.maps.activeMap instanceof CesiumMap),
        async callback() {
          if (this.active) {
            if (this.background && manager.currentViewshed.value) {
              manager.editViewshed(manager.currentViewshed.value);
            } else {
              manager.stop();
            }
          } else if (tool) {
            await manager.createViewshed(tool.name);
          }
        },
      }),
    };
  } else {
    toolbox = {
      type: ToolboxType.SELECT,
      action: reactive({
        name,
        currentIndex: 0,
        active: false,
        background: false,
        disabled: !(app.maps.activeMap instanceof CesiumMap),
        async callback() {
          if (this.active) {
            if (this.background && manager.currentViewshed.value) {
              manager.editViewshed(manager.currentViewshed.value);
            } else {
              manager.stop();
            }
          } else {
            const toolName = this.tools[this.currentIndex].name;
            await manager.createViewshed(toolName);
          }
        },
        async selected(newIndex: number) {
          if (newIndex !== this.currentIndex) {
            this.currentIndex = newIndex;
          }
          const toolName = this.tools[this.currentIndex].name;
          await manager.createViewshed(toolName);
        },
        tools: tools.flatMap(parseTool),
      }),
    };

    currentViewshedWatcher = watch(
      manager.currentViewshed,
      (currentViewshed) => {
        if (currentViewshed) {
          (toolbox as SelectToolboxComponentOptions).action.currentIndex = (
            toolbox as SelectToolboxComponentOptions
          ).action.tools.findIndex(
            (tool) => tool.name === currentViewshed.type,
          );
        }
      },
    );
  }

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

  const mapChangedListener = app.maps.mapActivated.addEventListener((map) => {
    if (map instanceof CesiumMap) {
      toolbox.action.disabled = false;
    } else {
      toolbox.action.disabled = true;
    }
  });

  return {
    toolbox,
    destroy(): void {
      viewshedModeWatcher();
      currentViewshedWatcher?.();
      mapChangedListener();
    },
  };
}

/**
 *
 * @param app The VcsUiApp instance
 * @param manager The viewshed manager.
 * @param name Name of toolbox action and owner of toolbox component
 * @param tools The tools to be available in the toolbox
 * @returns Function to remove toolbox component.
 */
export default function addToolButtons(
  app: VcsUiApp,
  manager: ViewshedManager,
  name: string,
  tools: string[],
): () => void {
  check(tools, [ofEnum(ViewshedTypes)]);

  const { toolbox: createToolbox, destroy: destroyCreateToolbox } =
    createViewshedToolbox(app, manager, name, tools);
  const createId = app.toolboxManager.add(createToolbox, name).id;

  return () => {
    app.toolboxManager.remove(createId);
    destroyCreateToolbox();
  };
}
