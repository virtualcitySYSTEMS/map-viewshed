<template>
  <div>
    <div v-if="viewshedMode === ViewshedPluginModes.CREATE">
      <VcsHelp v-if="viewshedType === ViewshedTypes.CONE">
        {{ $t('viewshed.createDescription') }}
      </VcsHelp>
      <VcsHelp v-else-if="viewshedType === ViewshedTypes.THREESIXTY">
        {{ $t('viewshed.createThreeSixtyDescription') }}
      </VcsHelp>
    </div>
    <VcsFormSection
      v-else-if="
        viewshedMode === ViewshedPluginModes.EDIT ||
        viewshedMode === ViewshedPluginModes.MOVE
      "
      :header-actions="headerActions"
      heading="viewshed.viewpoint"
      :action-button-list-overflow-count="3"
    >
      <v-container class="px-1 py-0">
        <v-row no-gutters>
          <span class="px-1 py-0">{{ $t('viewshed.position') }}</span>
        </v-row>
        <v-row
          v-if="
            viewshedMode === ViewshedPluginModes.MOVE &&
            heightMode === HeightModes.ABSOLUTE
          "
          no-gutters
        >
          <VcsFeatureTransforms
            :transformation-mode="TransformationMode.TRANSLATE"
            :feature-properties="{ altitudeMode: 'absolute' }"
            :allow-z-input="true"
            class="w-100"
          />
        </v-row>
        <v-row v-else no-gutters>
          <v-col
            v-for="(value, key, index) in position"
            :key="index"
            class="pb-1"
          >
            <VcsTextField
              :model-value="value"
              @update:model-value="(v) => setPosition(v, key, index)"
              type="number"
              :prefix="key"
              :step="key === 'Z' ? 1 : 0.0001"
              :unit="key === 'Z' ? 'm' : '°'"
              :decimals="key === 'Z' ? 2 : 8"
              :disabled="
                viewshedMode === ViewshedPluginModes.MOVE &&
                !(key === 'Z' && heightMode === HeightModes.RELATIVE)
              "
              :hide-spin-buttons="true"
            />
          </v-col>
        </v-row>
      </v-container>
    </VcsFormSection>
    <v-divider />
    <v-container class="px-1 py-0">
      <v-row no-gutters>
        <v-col>
          <VcsLabel html-for="heightMode">
            {{ $t('viewshed.heightMode') }}
          </VcsLabel>
        </v-col>
        <v-col>
          <VcsSelect
            id="heightMode"
            :items="
              Object.values(HeightModes).map((item) => ({
                value: item,
                title: `viewshed.${item}`,
              }))
            "
            :model-value="heightMode"
            @update:model-value="changeHeightMode"
          />
        </v-col>
      </v-row>
    </v-container>
    <v-container
      class="px-1 pt-0 pb-2"
      v-if="
        viewshedMode === ViewshedPluginModes.EDIT ||
        viewshedMode === ViewshedPluginModes.MOVE
      "
    >
      <v-row no-gutters v-for="(value, key) in parameters" :key="key">
        <v-col
          v-if="
            key === 'distance' ||
            (viewshedType === ViewshedTypes.CONE && key !== 'showPrimitive')
          "
        >
          <v-row no-gutters class="px-1">
            <v-col>
              <VcsLabel :html-for="key" class="py-0">
                {{ $t(`viewshed.${key}`) }}
              </VcsLabel>
            </v-col>
            <v-col class="d-flex justify-end align-center">
              <span v-if="key === 'distance'">{{
                `${Math.round(value)} m`
              }}</span>
              <span v-else>{{ `${Math.round(value)} °` }}</span>
            </v-col>
          </v-row>
          <v-row no-gutters>
            <v-col>
              <VcsSlider
                :id="key"
                class="pa-0"
                :model-value="value"
                @update:model-value="(v) => setParameter(key, v)"
                type="number"
                step="1"
                :min="parameterRanges[key][0]"
                :max="parameterRanges[key][1]"
              />
            </v-col>
          </v-row>
        </v-col>
      </v-row>
    </v-container>
    <v-divider />
    <div
      v-if="
        viewshedMode === ViewshedPluginModes.EDIT ||
        viewshedMode === ViewshedPluginModes.MOVE
      "
      class="d-flex w-full justify-space-between px-2 pt-2 pb-1"
    >
      <VcsFormButton
        @click="addToMyWorkspace()"
        tooltip="viewshed.addToMyWorkspace"
        icon="$vcsComponentsPlus"
        :disabled="currentIsPersisted || undefined"
      />
      <VcsFormButton @click="createNewViewshed()" variant="filled">
        {{ $t('viewshed.new') }}
      </VcsFormButton>
    </div>
    <div
      v-else-if="viewshedMode === ViewshedPluginModes.CREATE"
      class="d-flex w-full justify-end px-2 pt-2 pb-1"
    >
      <VcsFormButton @click="cancel()" variant="outlined">
        {{ $t('viewshed.cancel') }}
      </VcsFormButton>
    </div>
  </div>
</template>

<script>
  import {
    computed,
    inject,
    onMounted,
    onUnmounted,
    reactive,
    ref,
    shallowRef,
    watch,
    watchEffect,
  } from 'vue';
  import { VCol, VContainer, VDivider, VRow } from 'vuetify/components';
  import { TransformationMode, Viewpoint } from '@vcmap/core';
  import {
    VcsFormButton,
    VcsFormSection,
    VcsLabel,
    VcsSelect,
    VcsSlider,
    VcsTextField,
    VcsFeatureTransforms,
    VcsHelp,
  } from '@vcmap/ui';
  import { ViewshedPluginModes, HeightModes } from './viewshedManager.js';
  import Viewshed, { ViewshedTypes } from './viewshed.js';

  const parameterRanges = {
    distance: [Viewshed.MIN_DISTANCE, 2000],
    fov: [25, 85],
    heading: [0, 360],
    pitch: [-90, 90],
  };

  export default {
    components: {
      VcsTextField,
      VContainer,
      VRow,
      VCol,
      VcsSlider,
      VcsLabel,
      VcsFormSection,
      VDivider,
      VcsSelect,
      VcsFormButton,
      VcsFeatureTransforms,
      VcsHelp,
    },
    name: 'ViewshedWindow',
    props: {
      getViewshed: {
        type: Function,
        required: false,
        default: undefined,
      },
      selection: {
        type: Object,
        required: false,
        default: undefined,
      },
    },
    setup(props) {
      const viewshedManager =
        /** @type {import("./viewshedManager.js").ViewshedManager} */ (
          inject('manager')
        );
      const app = /** @type {import("@vcmap/ui").VcsUiApp} */ (
        inject('vcsApp')
      );
      const {
        currentViewshed,
        mode: viewshedMode,
        currentIsPersisted,
      } = viewshedManager;

      /** Whether movement is disabled for the current map */
      const movementDisabled = ref(
        app.maps.activeMap?.movementApiCallsDisabled ?? false,
      );
      let movementDisabledListener = () => {};

      const selection = computed(() => props.selection);

      let removePositionChangedListener = () => {};

      /**
       * Position of the viewshed as coordinates array. Z value is either absolute height (heightMode === HeightModes.ABSOLUTE) or relative height (heightMode === HeightModes.RELATIVE);
       * @type {{X: number | undefined, Y: number | undefined, Z: number | undefined}}
       */
      const position = reactive({
        X: undefined,
        Y: undefined,
        Z: undefined,
      });
      /** Cached view point when jumping to view point of viewshed. This allows to jump back to prev position when clicking 'jump to viewpoint' again, without changing position. */
      const cachedViewpoint = shallowRef();
      /** If currently in `jumpToViewpoint` mode: sets cached viewpoint on null, deletes camera changed listener and reactivates viewshed. Otherwise empty function. */
      let deleteCachedViewpoint = () => {};

      /**
       * @type {{showPrimitive: boolean, distance: number | undefined, fov: number | undefined, heading: number | undefined, pitch: number | undefined}}
       */
      const parameters = reactive({
        showPrimitive: false,
        distance: undefined,
        fov: undefined,
        heading: undefined,
        pitch: undefined,
      });

      const viewshedType = ref();

      function updatePosition() {
        if (currentViewshed.value) {
          position.X = currentViewshed.value.position[0];
          position.Y = currentViewshed.value.position[1];
          position.Z =
            viewshedManager.heightMode.value === HeightModes.ABSOLUTE
              ? currentViewshed.value.position[2]
              : currentViewshed.value.heightOffset;
        }
      }

      function updateWindow() {
        updatePosition();

        if (currentViewshed.value) {
          parameters.distance = currentViewshed.value.distance;
          parameters.fov = currentViewshed.value.fov;
          parameters.heading = currentViewshed.value.heading;
          parameters.pitch = currentViewshed.value.pitch;
          parameters.showPrimitive = currentViewshed.value.showPrimitive;

          viewshedType.value = currentViewshed.value.type;
        }
      }

      watchEffect(() => {
        if (
          currentViewshed.value &&
          viewshedMode.value !== ViewshedPluginModes.CREATE
        ) {
          updateWindow();
        }
      });

      watch(
        currentViewshed,
        () => {
          if (currentViewshed.value) {
            removePositionChangedListener();
            removePositionChangedListener =
              currentViewshed.value.positionChanged.addEventListener(() => {
                updatePosition();
                deleteCachedViewpoint();
              });
          }
        },
        { immediate: true },
      );

      /**
       * Deactivates viewshed and sets up a camera changes listener, which is destroyed when `deleteCachedViewpoint()` is called.
       */
      async function setUpCameraChangedListener() {
        currentViewshed.value?.deactivate();
        const camera = /** @type {import("@vcmap/core").CesiumMap} */ (
          app.maps.activeMap
        ).getScene()?.camera;
        const listener = camera?.changed.addEventListener(() => {
          deleteCachedViewpoint();
        });
        deleteCachedViewpoint = () => {
          listener?.();
          cachedViewpoint.value = null;
          currentViewshed.value?.activate(app.maps.activeMap);
          deleteCachedViewpoint = () => {};
        };
      }

      onMounted(() => {
        const viewshed = props.getViewshed?.();
        if (viewshed) {
          // only the case for collection component editor
          viewshedManager.editViewshed(viewshed);
        }
        movementDisabledListener =
          app.maps.activeMap?.movementDisabledChanged.addEventListener(
            (options) => {
              movementDisabled.value = options.apiCalls;
            },
          );
      });

      onUnmounted(() => {
        removePositionChangedListener();
        deleteCachedViewpoint();
        movementDisabledListener();

        if (!currentIsPersisted.value) {
          // in case of temp editor
          if (
            (viewshedMode.value === ViewshedPluginModes.EDIT ||
              viewshedMode.value === ViewshedPluginModes.MOVE) &&
            currentViewshed.value
          ) {
            viewshedManager.viewViewshed(currentViewshed.value);
          } else if (viewshedMode.value === ViewshedPluginModes.CREATE) {
            viewshedManager.stop();
          }
        }
        if (selection.value) {
          // in case of collection component editor
          if (selection.value.length > 1) {
            viewshedManager.setupMultiSelect();
          } else if (selection.value.length === 1 && currentViewshed.value) {
            viewshedManager.viewViewshed(currentViewshed.value);
          } else if (
            // when a persited viewshed is deselected, stops plugin
            !selection.value.length &&
            viewshedMode.value === ViewshedPluginModes.EDIT
          ) {
            viewshedManager.stop(false);
          }
        }
      });

      updateWindow();

      function setParameter(key, value) {
        deleteCachedViewpoint();
        if (currentViewshed.value) {
          parameters[key] = value;
          currentViewshed.value[key] = value;
        }
      }

      const headerActions = computed(() => {
        const actions = [];
        if (viewshedType.value === ViewshedTypes.CONE) {
          actions.push({
            name: 'jumpToViewpoint',
            title: cachedViewpoint.value
              ? 'viewshed.returnToViewpoint'
              : 'viewshed.jumpToViewpoint',
            icon: 'mdi-human-male',
            active: !!cachedViewpoint.value,
            disabled: movementDisabled.value,
            async callback() {
              viewshedManager.moveCurrentViewshed(false);
              if (currentViewshed.value && !cachedViewpoint.value) {
                cachedViewpoint.value =
                  await app.maps.activeMap?.getViewpoint();
                await app.maps.activeMap?.gotoViewpoint(
                  new Viewpoint({
                    groundPosition: [
                      currentViewshed.value.position[0],
                      currentViewshed.value.position[1],
                      currentViewshed.value.position[2] +
                        currentViewshed.value.heightOffset,
                    ],
                    heading: currentViewshed.value.heading,
                    pitch: currentViewshed.value.pitch,
                    distance: 0,
                    animate: true, // if not animate, async does not work and the cameraChanged listener is triggered immediately. alternatively set timeout
                  }),
                );
                setUpCameraChangedListener();
              } else if (cachedViewpoint.value) {
                app.maps.activeMap?.gotoViewpoint(cachedViewpoint.value);
                deleteCachedViewpoint();
              }
            },
          });
        }
        actions.push({
          name: 'moveViewshed',
          title: 'viewshed.move',
          icon:
            viewshedManager.heightMode.value === HeightModes.RELATIVE
              ? '$vcsEditVertices'
              : 'mdi-axis-arrow',
          active: viewshedMode.value === ViewshedPluginModes.MOVE,
          callback() {
            viewshedManager.moveCurrentViewshed(
              viewshedMode.value !== ViewshedPluginModes.MOVE,
            );
          },
        });
        actions.unshift({
          name: 'showPrimitive',
          title: 'viewshed.showPrimitive',
          icon: 'mdi-eye',
          active: parameters.showPrimitive,
          callback() {
            this.active = !this.active;
            setParameter('showPrimitive', this.active);
          },
        });
        return actions;
      });

      return {
        position,
        setPosition(value, key, index) {
          deleteCachedViewpoint();
          if (!currentViewshed.value) {
            return;
          }

          if (
            index === 2 &&
            viewshedManager.heightMode.value === HeightModes.RELATIVE
          ) {
            currentViewshed.value.heightOffset = Number(value);
          } else {
            const newPosition = [...currentViewshed.value.position];
            newPosition[index] = Number(value);
            currentViewshed.value.position = newPosition;
          }
          position[key] = Number(value);
        },
        parameters,
        setParameter,
        parameterRanges,
        ViewshedPluginModes,
        viewshedMode,
        currentIsPersisted,
        viewshedType,
        ViewshedTypes,
        HeightModes,
        heightMode: viewshedManager.heightMode,
        TransformationMode,
        changeHeightMode: viewshedManager.changeHeightMode,
        async createNewViewshed() {
          await viewshedManager.createViewshed(viewshedType.value);
        },
        addToMyWorkspace: () => viewshedManager.persistCurrent(),
        cancel: () => viewshedManager.stop(),
        headerActions,
      };
    },
  };
</script>
