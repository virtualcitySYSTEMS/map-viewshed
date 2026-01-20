/* global global */
import { vi } from 'vitest';

import ResizeObserver from 'resize-observer-polyfill';

import 'jest-canvas-mock';

vi.hoisted(() => {
  global.jest = vi;
});

global.ResizeObserver = ResizeObserver;

window.CESIUM_BASE_URL = '/node_modules/@vcmap-cesium/engine/Build/';
