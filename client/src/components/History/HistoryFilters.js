import { STATES } from "components/History/Content/model/states";
import StatesInfo from "components/History/Content/model/StatesInfo";
import Filtering, { compare, contains, equals, expandNameTag, toBool, toDate } from "utils/filtering";

const excludeStates = ["empty", "failed", "upload"];
const states = Object.keys(STATES).filter((state) => !excludeStates.includes(state));

const validFilters = {
    name: { placeholder: "name", type: String, handler: contains("name"), menuItem: true },
    extension: { placeholder: "extension", type: String, handler: equals("extension"), menuItem: true },
    tag: { placeholder: "tag", type: String, handler: contains("tags", "tag", expandNameTag), menuItem: true },
    state: {
        placeholder: "state",
        type: String,
        handler: equals("state"),
        datalist: states,
        helpInfo: StatesInfo,
        menuItem: true,
    },
    genome_build: { placeholder: "database", type: String, handler: contains("genome_build"), menuItem: true },
    related: { placeholder: "related", type: Number, handler: equals("related"), menuItem: true },
    hid: { placeholder: "index", type: Number, handler: equals("hid"), isRangeInput: true, menuItem: true },
    hid_ge: { handler: compare("hid", "ge"), menuItem: false },
    hid_le: { handler: compare("hid", "le"), menuItem: false },
    create_time: {
        placeholder: "creation time",
        type: Date,
        handler: compare("create_time", "le", toDate),
        isRangeInput: true,
        menuItem: true,
    },
    create_time_ge: { handler: compare("create_time", "ge", toDate), menuItem: false },
    create_time_le: { handler: compare("create_time", "le", toDate), menuItem: false },
    deleted: {
        placeholder: "Deleted",
        type: Boolean,
        handler: equals("deleted", "deleted", toBool),
        default: false,
        menuItem: true,
    },
    visible: {
        placeholder: "Visible",
        type: Boolean,
        handler: equals("visible", "visible", toBool),
        default: true,
        menuItem: true,
    },
    update_time: { handler: compare("update_time", "le", toDate), menuItem: false },
    update_time_ge: { handler: compare("update_time", "ge", toDate), menuItem: false },
    update_time_gt: { handler: compare("update_time", "gt", toDate), menuItem: false },
    update_time_le: { handler: compare("update_time", "le", toDate), menuItem: false },
    update_time_lt: { handler: compare("update_time", "lt", toDate), menuItem: false },
};

export const HistoryFilters = new Filtering(validFilters);
