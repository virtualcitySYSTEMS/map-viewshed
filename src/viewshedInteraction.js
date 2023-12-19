import {
  AbstractInteraction,
  EventType,
  Projection,
  VcsEvent,
} from '@vcmap/core';

class ViewshedInteraction extends AbstractInteraction {
  /**
   *
   * @param {import("./viewshed").default} viewshed
   */
  constructor(viewshed) {
    super(EventType.CLICKMOVE);
    this._viewshed = viewshed;
    this._positioned = new VcsEvent();
    this._finished = new VcsEvent();
    this._position = false;

    this.setActive();
  }

  get finished() {
    return this._finished;
  }

  get positioned() {
    return this._positioned;
  }

  async pipe(event) {
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
    return event;
  }

  destroy() {
    super.destroy();
    this._finished.destroy();
    this._positioned.destroy();
  }
}

export default ViewshedInteraction;
