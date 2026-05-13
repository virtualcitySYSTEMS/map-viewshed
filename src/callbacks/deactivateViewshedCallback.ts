import { VcsCallback } from '@vcmap/ui';
import type { VcsUiApp } from '@vcmap/ui';
import { getLogger } from '@vcsuite/logger';
import { name as pluginName } from '../../package.json';
import type { ViewshedPlugin } from '../index.js';

class DeactivateViewshedCallback extends VcsCallback {
  static get className(): string {
    return 'DeactivateViewshedCallback';
  }

  callback(): void {
    const plugin = (this._app as VcsUiApp).plugins.getByKey(pluginName) as
      | ViewshedPlugin
      | undefined;
    if (!plugin) {
      getLogger('DeactivateShadowCallback').warning(
        `Plugin ${pluginName} not found`,
      );
      return;
    }
    plugin.deactivate();
  }
}

export default DeactivateViewshedCallback;
