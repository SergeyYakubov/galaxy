<template>
    <div class="pages-list" aria-labelledby="pages-title">
        <h1 id="pages-title" class="mb-3 h-lg">
            {{ title }}
        </h1>
        <b-alert v-bind="alertAttrs">{{ message }}</b-alert>
        <b-row class="mb-3">
            <b-col cols="6">
                <FilterMenu
                    :name="title"
                    :placeholder="titleSearch"
                    :filter-class="filterClass"
                    :filter-text.sync="filterText"
                    :loading="loading"
                    :show-advanced.sync="showAdvanced"
                    has-help
                    @on-backend-filter="onSearch">
                    <template v-slot:menu-help-text>
                        <div v-html="helpHtml"></div>
                    </template>
                </FilterMenu>
            </b-col>
            <b-col>
                <PageIndexActions class="float-right" />
            </b-col>
        </b-row>
        <b-table v-model="pageItemsModel" v-bind="{ ...defaultTableAttrs, ...indexTableAttrs }">
            <template v-slot:empty>
                <LoadingSpan v-if="loading" message="Loading pages" />
                <b-alert v-else id="no-pages" variant="info" show>
                    <div v-if="filterText !== ''">
                        No matching entries found for: <span class="font-weight-bold">{{ filterText }}</span
                        >.
                    </div>
                    <div v-else>No pages found. You may create a new page.</div>
                </b-alert>
            </template>
            <template v-slot:cell(title)="row">
                <PageDropdown
                    :page="row.item"
                    :published="published"
                    @onAdd="onAdd"
                    @onRemove="onRemove"
                    @onUpdate="onUpdate"
                    @onSuccess="onSuccess"
                    @onError="onError" />
            </template>
            <template v-slot:cell(tags)="row">
                <StatelessTags
                    clickable
                    :value="row.item.tags"
                    :index="row.index"
                    :disabled="published"
                    @input="(tags) => onTags(tags, row.index)"
                    @tag-click="(tag) => applyFilter('tag', tag, true)" />
            </template>
            <template v-slot:cell(username)="row">
                <a
                    class="page-filter-link-owner"
                    href="#"
                    :title="'Search more from ' + row.item.username"
                    @click="applyFilter('user', row.item.username, true)">
                    {{ row.item.username }}
                </a>
            </template>
            <template v-slot:cell(sharing)="row">
                <span v-if="row.item.published || row.item.shared || row.item.importable">
                    <SharingIndicators :object="row.item" @filter="(filter) => applyFilter(filter, true)" />
                    <CopyToClipboard
                        :title="'Copy URL' | localize"
                        :text="copyUrl(row.item)"
                        :message="'Link copied to your clipboard' | localize" />
                </span>
                <a
                    v-if="!row.item.published && !row.item.shared && !row.item.importable"
                    :href="`sharing?id=${row.item.id}`"
                    class="share-this-page"
                    @click.prevent="shareLink(row.item)">
                    <span>Share this</span>
                </a>
            </template>
            <template v-slot:cell(update_time)="data">
                <UtcDate :date="data.value" mode="elapsed" />
            </template>
        </b-table>
        <b-pagination
            v-if="rows >= perPage"
            v-model="currentPage"
            class="gx-pages-grid-pager"
            v-bind="paginationAttrs" />
    </div>
</template>
<script>
import { getGalaxyInstance } from "app";
import FilterMenu from "components/Common/FilterMenu";
import CopyToClipboard from "components/CopyToClipboard";
import SharingIndicators from "components/Indices/SharingIndicators";
import { pagesProvider } from "components/providers/PageProvider";
import StatelessTags from "components/TagsMultiselect/StatelessTags";
import UtcDate from "components/UtcDate";
import paginationMixin from "components/Workflow/paginationMixin";
import { getAppRoot } from "onload/loadConfig";
import Filtering, { contains, equals, expandNameTag, toBool } from "utils/filtering";
import _l from "utils/localization";
import { useRouter } from "vue-router/composables";

import { updateTags } from "@/api/tags";
import { absPath } from "@/utils/redirect";

import PageDropdown from "./PageDropdown";
import PageIndexActions from "./PageIndexActions";

const helpHtml = `<div>
<p>This textbox can be used to filter the pages displayed.

<p>Text entered here will be searched against page names and tags. Additionally, advanced
filtering tags can be used to refine the search more precisely. Tags are of the form
<code>&lt;tag_name&gt;:&lt;tag_value&gt;</code> or <code>&lt;tag_name&gt;:'&lt;tag_value&gt;'</code>.
For instance to search just for RNAseq in the page name, <code>name:rnaseq</code> can be used.
Notice by default the search is not case-sensitive.

If the quoted version of tag is used, the search is case sensitive and only full matches will be
returned. So <code>name:'RNAseq'</code> would show only pages named exactly <code>RNAseq</code>.

<p>The available tags are:
<dl>
    <dt><code>title</code></dt>
    <dd>Shows pages with the given sequence of characters in their names.</dd>
    <dt><code>tag</code></dt>
    <dd>Shows pages with the given workflow tag. You may also click on a tag to filter on that tag directly.</dd>
    <dt><code>is:published</code></dt>
    <dd>Shows published pages.</dd>
    <dt><code>is:importable</code></dt>
    <dd>Shows accessible pages (meaning they have URL generated).</dd>
    <dt><code>is:shared_with_me</code></dt>
    <dd>Shows pages shared by another user directly with you.</dd>
    <dt><code>user:janedoe</code></dt>
    <dd>Shows pages created by user "janedoe"</dd>
</dl>
</div>
`;

const TITLE_FIELD = { key: "title", label: _l("Title"), sortable: true };
const TAGS_FIELD = { key: "tags", label: _l("Tags"), sortable: false, thStyle: { width: "35%" } };
const UPDATED_FIELD = { label: _l("Updated"), key: "update_time", sortable: true, thStyle: { width: "15%" } };
const SHARING_FIELD = { label: _l("Sharing"), key: "sharing", sortable: false, thStyle: { width: "15%" } };
const OWNER_FIELD = { key: "username", label: _l("Owner"), sortable: false, thStyle: { width: "15%" } };

const PERSONAL_FIELDS = [TITLE_FIELD, TAGS_FIELD, SHARING_FIELD, UPDATED_FIELD];
const PUBLISHED_FIELDS = [TITLE_FIELD, TAGS_FIELD, OWNER_FIELD, UPDATED_FIELD];

const validFilters = {
    title: { placeholder: "title", type: String, handler: contains("title"), menuItem: true },
    user: { placeholder: "owner", type: String, handler: contains("user"), menuItem: false },
    tag: {
        placeholder: "tag(s)",
        type: "MultiTags",
        handler: contains("tag", "tag", expandNameTag),
        menuItem: true,
    },
    published: {
        placeholder: "Filter on published pages",
        type: Boolean,
        boolType: "is",
        handler: equals("published", "published", toBool),
        menuItem: true,
    },
    importable: {
        placeholder: "Filter on importable pages",
        type: Boolean,
        boolType: "is",
        handler: equals("importable", "importable", toBool),
        menuItem: true,
    },
    shared_with_me: {
        placeholder: "Filter on pages shared with me",
        type: Boolean,
        boolType: "is",
        handler: equals("shared_with_me", "shared_with_me", toBool),
        menuItem: true,
    },
};
const PageFilters = new Filtering(validFilters, undefined, false, false);

const validPublishedFilters = {
    ...validFilters,
    published: {
        ...validFilters.published,
        default: true,
        menuItem: false,
    },
    user: {
        ...validFilters.user,
        menuItem: true,
    },
    shared_with_me: {
        ...validFilters.shared_with_me,
        menuItem: false,
    },
    importable: {
        ...validFilters.importable,
        menuItem: false,
    },
};
const PublishedPageFilters = new Filtering(validPublishedFilters, undefined, false, false);

export default {
    components: {
        UtcDate,
        StatelessTags,
        PageIndexActions,
        SharingIndicators,
        PageDropdown,
        FilterMenu,
        CopyToClipboard,
    },
    mixins: [paginationMixin],
    props: {
        published: {
            // Render the published pages version of this grid.
            type: Boolean,
            default: true,
        },
    },
    setup() {
        const router = useRouter();
        return {
            router,
        };
    },
    data() {
        const fields = this.published ? PUBLISHED_FIELDS : PERSONAL_FIELDS;
        const filterClass = this.published ? PublishedPageFilters : PageFilters;
        return {
            tableId: "page-table",
            fields: fields,
            filterText: "",
            searchQuery: this.published ? "is:published" : "",
            filterClass: filterClass,
            showAdvanced: false,
            titleSearch: _l("search pages"),
            pageItemsModel: [],
            helpHtml: helpHtml,
            perPage: this.rowsPerPage(this.defaultPerPage || 20),
            dataProvider: pagesProvider,
            defaultTableAttrs: { "sort-by": "update_time", "sort-desc": true, "no-sort-reset": "", fields: fields },
        };
    },
    computed: {
        dataProviderParameters() {
            const extraParams = {
                search: this.searchQuery,
                show_published: false,
                show_shared: true,
            };
            if (this.published) {
                extraParams.show_published = true;
                extraParams.show_shared = false;
            }
            return extraParams;
        },
        title() {
            return this.published ? `Published Pages` : `Pages`;
        },
    },
    created() {
        this.root = getAppRoot();
    },
    methods: {
        applyFilter(filter, value, quoted = false) {
            if (quoted) {
                this.filterText = this.filterClass.setFilterValue(this.filterText, filter, `'${value}'`);
            } else {
                this.filterText = this.filterClass.setFilterValue(this.filterText, filter, value);
            }
        },
        copyUrl: function (item) {
            return absPath(`/u/${item.owner}/p/${item.slug}`);
        },
        onTags: function (tags, index) {
            const page = this.pageItemsModel[index];
            page.tags = tags;
            updateTags(page.id, "Page", tags).catch((error) => {
                this.onError(error);
            });
        },
        onAdd: function (page) {
            if (this.currentPage == 1) {
                this.refresh();
            } else {
                this.currentPage = 1;
            }
        },
        onRemove: function (id) {
            this.refresh();
        },
        onSearch(searchQuery) {
            this.searchQuery = searchQuery;
            this.refresh();
        },
        onUpdate: function (id, data) {
            this.refresh();
        },
        shareLink: function (item) {
            this.router.push(`sharing?id=${item.id}`);
        },
        decorateData(page) {
            const Galaxy = getGalaxyInstance();
            page.shared = page.username !== Galaxy.user.attributes.username;
        },
    },
};
</script>
