import { getLogger } from '@vcsuite/logger';
import { parseEnumValue } from '@vcsuite/parsers';
import { VcsCallback } from '@vcmap/ui';
import type { VcsCallbackOptions, VcsUiApp } from '@vcmap/ui';
import type { ViewshedPlugin, ViewshedPluginState } from '../index.js';
import { name as pluginName } from '../../package.json';
import { ViewshedPluginModes } from '../viewshedManager.js';
import type { ViewshedOptions } from '../viewshed.js';

export type ActivateViewshedCallbackOptions = VcsCallbackOptions &
  ViewshedPluginState;

class ActivateViewshedCallback extends VcsCallback {
  static get className(): string {
    return 'ActivateViewshedCallback';
  }

  private _mode: ViewshedPluginModes | null;
  private _viewshedOptions: ViewshedOptions | null;
  constructor(options: ActivateViewshedCallbackOptions, app: VcsUiApp) {
    super(options, app);
    this._mode = parseEnumValue<ViewshedPluginModes>(
      options.m,
      ViewshedPluginModes,
      ViewshedPluginModes.CREATE,
    );
    this._viewshedOptions = options.cv || null;
  }

  callback(): void {
    const plugin = (this._app as VcsUiApp).plugins.getByKey(pluginName) as
      | ViewshedPlugin
      | undefined;
    if (!plugin) {
      getLogger('ActivateViewshedCallback').warning(
        `Plugin ${pluginName} not found`,
      );
      return;
    }
    plugin.state.m = this._mode;
    plugin.state.cv = this._viewshedOptions;
    plugin.activate();
  }

  toJSON(): ActivateViewshedCallbackOptions {
    const config: ActivateViewshedCallbackOptions = super.toJSON();
    if (this._mode) {
      config.m = this._mode;
    }
    if (this._viewshedOptions) {
      config.cv = structuredClone(this._viewshedOptions);
    }
    return config;
  }
}

export default ActivateViewshedCallback;
