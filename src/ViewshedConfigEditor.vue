<template>
  <AbstractConfigEditor @submit="apply" v-bind="{ ...$attrs, ...$props }">
    <VcsFormSection heading="viewshed.editor.general" v-if="localConfig">
      <v-container class="px-1 py-0">
        <v-row no-gutters>
          <v-col>
            <VcsLabel html-for="viewshed-editor-tools">{{
              $t('viewshed.editor.tools')
            }}</VcsLabel>
          </v-col>
          <v-col>
            <VcsSelect
              id="viewshed-tools"
              :items="toolItems"
              v-model="localConfig.tools"
              :multiple="true"
            />
          </v-col>
        </v-row>
        <v-row no-gutters>
          <v-col>
            <VcsLabel html-for="viewshed-editor-visible-color">{{
              $t('viewshed.editor.visibleColor')
            }}</VcsLabel>
          </v-col>
          <v-col>
            <VColorPicker v-model="localConfig.visibleColor" mode="rgba" />
          </v-col>
        </v-row>
        <v-row no-gutters>
          <v-col>
            <VcsLabel html-for="viewshed-editor-shadow-color">{{
              $t('viewshed.editor.shadowColor')
            }}</VcsLabel>
          </v-col>
          <v-col>
            <VColorPicker v-model="localConfig.shadowColor" mode="rgba" />
          </v-col>
        </v-row>
      </v-container>
    </VcsFormSection>
  </AbstractConfigEditor>
</template>

<script>
  import { ref } from 'vue';
  import { VCol, VColorPicker, VContainer, VRow } from 'vuetify/components';
  import {
    AbstractConfigEditor,
    VcsFormSection,
    VcsLabel,
    VcsSelect,
  } from '@vcmap/ui';
  import Viewshed, { ViewshedTypes } from './viewshed.js';

  /**
   * @typedef {Object} ViewshedConfig
   * @property {string} visibleColor The color of the viewsheds visible parts.
   * @property {string} shadowColor The color of the viewsheds hidden parts.
   * @property {Array<ViewshedTypes>} tools The tools that are available in the toolbox.
   */

  /**
   * Returns the default viewshed options.
   * @returns {ViewshedConfig}
   */
  export function getDefaultOptions() {
    return {
      visibleColor: Viewshed.getDefaultOptions().visibleColor,
      shadowColor: Viewshed.getDefaultOptions().shadowColor,
      tools: [...Object.values(ViewshedTypes)],
    };
  }

  export default {
    name: 'ViewshedConfigEditor',
    components: {
      AbstractConfigEditor,
      VcsFormSection,
      VContainer,
      VRow,
      VCol,
      VcsLabel,
      VcsSelect,
      VColorPicker,
    },
    props: {
      getConfig: {
        type: Function,
        required: true,
      },
      setConfig: {
        type: Function,
        required: true,
      },
    },
    setup(props) {
      /** @type {import("vue").Ref<import("./index.js").ViewshedPluginOptions>} */
      const config = props.getConfig();
      /** @type {import("vue").Ref<import("./index.js").ViewshedPluginOptions>} */
      const localConfig = ref({ ...getDefaultOptions(), ...config });

      function apply() {
        props.setConfig(localConfig.value);
      }

      return {
        localConfig,
        ViewshedTypes,
        apply,
        toolItems: Object.values(ViewshedTypes).map((type) => ({
          value: type,
          title: `viewshed.${type}`,
        })),
      };
    },
  };
</script>
