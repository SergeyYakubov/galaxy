<script setup lang="ts">
import axios from "axios";
import { storeToRefs } from "pinia";
import { onMounted, ref, watch } from "vue";

import { getAppRoot } from "@/onload";
import { useToolStore } from "@/stores/toolStore";
import localize from "@/utils/localization";

import LoadingSpan from "../LoadingSpan.vue";
import FavoritesButton from "./Buttons/FavoritesButton.vue";
import PanelViewButton from "./Buttons/PanelViewButton.vue";
import ToolBox from "./ToolBox.vue";
import Heading from "@/components/Common/Heading.vue";

const props = defineProps({
    workflow: { type: Boolean, default: false },
    editorWorkflows: { type: Array, default: null },
    dataManagers: { type: Array, default: null },
    moduleSections: { type: Array, default: null },
});

const emit = defineEmits<{
    (e: "onInsertTool", toolId: string, toolName: string): void;
    (e: "onInsertModule", moduleName: string, moduleTitle: string | undefined): void;
    (e: "onInsertWorkflow", workflowLatestId: string | undefined, workflowName: string): void;
    (e: "onInsertWorkflowSteps", workflowId: string, workflowStepCount: number | undefined): void;
}>();

const arePanelsFetched = ref(false);
const defaultPanelView = ref("");
const toolStore = useToolStore();
const { currentPanelView, isPanelPopulated } = storeToRefs(toolStore);

const query = ref("");
const panelViews = ref(null);
const showAdvanced = ref(false);

onMounted(async () => {
    await axios
        .get(`${getAppRoot()}api/tool_panels`)
        .then(async ({ data }) => {
            const { default_panel_view, views } = data;
            defaultPanelView.value = default_panel_view;
            panelViews.value = views;
            await initializeTools();
        })
        .catch((error) => {
            console.error(error);
        })
        .finally(() => {
            arePanelsFetched.value = true;
        });
});

watch(
    () => currentPanelView.value,
    () => {
        query.value = "";
    }
);

// if currentPanelView ever becomes null || "", load tools
watch(
    () => currentPanelView.value,
    async (newVal) => {
        if (!newVal && arePanelsFetched.value) {
            await initializeTools();
        }
    }
);

async function initializeTools() {
    try {
        await toolStore.fetchTools();
        await toolStore.initCurrentPanelView(defaultPanelView.value);
    } catch (error: any) {
        console.error("ToolPanel - Intialize error:", error);
    }
}

async function updatePanelView(panelView: string) {
    await toolStore.setCurrentPanelView(panelView);
}

function onInsertTool(toolId: string, toolName: string) {
    emit("onInsertTool", toolId, toolName);
}

function onInsertModule(moduleName: string, moduleTitle: string | undefined) {
    emit("onInsertModule", moduleName, moduleTitle);
}

function onInsertWorkflow(workflowId: string | undefined, workflowName: string) {
    emit("onInsertWorkflow", workflowId, workflowName);
}

function onInsertWorkflowSteps(workflowId: string, workflowStepCount: number | undefined) {
    emit("onInsertWorkflowSteps", workflowId, workflowStepCount);
}
</script>

<template>
    <div v-if="arePanelsFetched" class="unified-panel" aria-labelledby="toolbox-heading">
        <div unselectable="on">
            <div class="unified-panel-header-inner">
                <nav class="d-flex justify-content-between mx-3 my-2">
                    <Heading v-if="!showAdvanced" id="toolbox-heading" h2 inline size="sm">{{
                        localize("Tools")
                    }}</Heading>
                    <Heading v-else id="toolbox-heading" h2 inline size="sm">{{
                        localize("Advanced Tool Search")
                    }}</Heading>
                    <div class="panel-header-buttons">
                        <b-button-group>
                            <FavoritesButton v-if="!showAdvanced" :query="query" @onFavorites="(q) => (query = q)" />
                            <PanelViewButton
                                v-if="panelViews && Object.keys(panelViews).length > 1"
                                :panel-views="panelViews"
                                :current-panel-view="currentPanelView"
                                @updatePanelView="updatePanelView" />
                        </b-button-group>
                    </div>
                </nav>
            </div>
        </div>
        <ToolBox
            v-if="isPanelPopulated"
            :workflow="props.workflow"
            :panel-query.sync="query"
            :panel-view="currentPanelView"
            :show-advanced.sync="showAdvanced"
            :editor-workflows="editorWorkflows"
            :data-managers="dataManagers"
            :module-sections="moduleSections"
            @updatePanelView="updatePanelView"
            @onInsertTool="onInsertTool"
            @onInsertModule="onInsertModule"
            @onInsertWorkflow="onInsertWorkflow"
            @onInsertWorkflowSteps="onInsertWorkflowSteps" />
        <div v-else>
            <b-badge class="alert-info w-100">
                <LoadingSpan message="Loading Toolbox" />
            </b-badge>
        </div>
    </div>
</template>
