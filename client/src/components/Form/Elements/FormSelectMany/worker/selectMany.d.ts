import type { Ref } from "vue";

export type SelectValue = Record<string, unknown> | string | number | null;

export interface SelectOption {
    label: string;
    value: SelectValue;
}

export interface UseSelectManyOptions {
    optionsArray: Ref<SelectOption[]>;
    filter: Ref<string>;
    unselected: Ref<SelectValue[]>;
    selected: Ref<SelectValue[]>;
    unselectedDisplayCount: Ref<number>;
    selectedDisplayCount: Ref<number>;
    asRegex: Ref<boolean>;
    caseSensitive: Ref<boolean>;
}

export interface UseSelectManyReturn {
    unselectedOptionsFiltered: Ref<SelectOption[]>;
    selectedOptionsFiltered: Ref<SelectOption[]>;
}

/**
 * Filter and grouping logic for FormSelectMany component.
 * Runs in a thread, which is why it is abstracted in a composable.
 */
export declare function useSelectMany(options: UseSelectManyOptions): UseSelectManyReturn & { running: Ref<boolean> };
