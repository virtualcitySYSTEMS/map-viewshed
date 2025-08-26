import {
  AbstractInteraction,
  EventType,
  InteractionEvent,
  Projection,
  VcsEvent,
} from '@vcmap/core';
import Viewshed from './viewshed.js';

class ViewshedInteraction extends AbstractInteraction {
  static get className(): string {
    return 'ViewshedInteraction';
  }

  private _viewshed: Viewshed;

  private _positioned = new VcsEvent<null>();

  private _finished = new VcsEvent<null>();

  private _position = false;

  constructor(viewshed: Viewshed) {
    super(EventType.CLICKMOVE);
    this._viewshed = viewshed;
    this.setActive();
  }

  get finished(): VcsEvent<null> {
    return this._finished;
  }

  get positioned(): VcsEvent<null> {
    return this._positioned;
  }

  async pipe(event: InteractionEvent): Promise<InteractionEvent> {
    if (event.position) {
      if (!this._position) {
        this._viewshed.position = Projection.mercatorToWgs84(event.position);
        if (event.type & EventType.CLICK) {
          this._position = true;
          this._positioned.raiseEvent(null);
        }
      } else {
        this._viewshed.lookAt(Projection.mercatorToWgs84(event.position));
        if (event.type & EventType.CLICK) {
          this.setActive(false);
          this._finished.raiseEvent(null);
        }
      }
    }
    return Promise.resolve(event);
  }

  destroy(): void {
    super.destroy();
    this._finished.destroy();
    this._positioned.destroy();
  }
}

export default ViewshedInteraction;
