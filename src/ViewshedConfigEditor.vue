<template>
  <AbstractConfigEditor v-bind="{ ...$attrs, ...$props }" @submit="apply">
    <VcsFormSection v-if="localConfig" heading="viewshed.editor.general">
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
              v-model="localConfig.tools"
              :items="toolItems"
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

<script lang="ts">
  import type { PropType } from 'vue';
  import { defineComponent, inject, ref, toRaw } from 'vue';
  import { VCol, VColorPicker, VContainer, VRow } from 'vuetify/components';
  import type { VcsUiApp } from '@vcmap/ui';
  import {
    AbstractConfigEditor,
    VcsFormSection,
    VcsLabel,
    VcsSelect,
  } from '@vcmap/ui';
  import { name } from '../package.json';
  import { ViewshedTypes } from './viewshed.js';
  import type { ViewshedPlugin } from './index.js';

  export type ViewshedConfig = {
    /** The color of the viewsheds visible parts. */
    visibleColor: string;
    /** The color of the viewsheds hidden parts. */
    shadowColor: string;
    /** The tools that are available in the toolbox. */
    tools: ViewshedTypes[];
  };

  export default defineComponent({
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
        type: Function as PropType<() => ViewshedConfig>,
        required: true,
      },
      setConfig: {
        type: Function as PropType<(config: ViewshedConfig) => void>,
        required: true,
      },
    },
    setup(props) {
      const app = inject<VcsUiApp>('vcsUiApp')!;
      const { getDefaultOptions } = app.plugins.getByKey(
        name,
      ) as ViewshedPlugin;
      const localConfig = ref<ViewshedConfig>({
        ...getDefaultOptions?.(),
        ...props.getConfig(),
      });

      function apply(): void {
        props.setConfig(structuredClone(toRaw(localConfig.value)));
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
  });
</script>
