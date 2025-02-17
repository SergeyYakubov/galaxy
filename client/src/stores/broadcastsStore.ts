import { defineStore } from "pinia";
import Vue, { computed, ref } from "vue";

import { fetchAllBroadcasts } from "@/api/notifications.broadcast";
import type { components } from "@/api/schema";
import { useUserLocalStorage } from "@/composables/userLocalStorage";
import { mergeObjectListsById } from "@/utils/utils";

export type BroadcastNotification = components["schemas"]["BroadcastNotificationResponse"];
type Expirable = Pick<BroadcastNotification, "expiration_time">;

export const useBroadcastsStore = defineStore("broadcastsStore", () => {
    const broadcasts = ref<BroadcastNotification[]>([]);

    const loadingBroadcasts = ref<boolean>(false);
    const dismissedBroadcasts = useUserLocalStorage<{ [key: string]: Expirable }>("dismissed-broadcasts", {});

    const activeBroadcasts = computed(() => {
        return broadcasts.value.filter((b) => !dismissedBroadcasts.value[b.id]);
    });

    async function loadBroadcasts() {
        loadingBroadcasts.value = true;
        await fetchAllBroadcasts()
            .then((data) => {
                broadcasts.value = mergeObjectListsById(data, [], "create_time", "desc");
            })
            .finally(() => {
                loadingBroadcasts.value = false;
            });
    }

    function updateBroadcasts(broadcastList: BroadcastNotification[]) {
        broadcasts.value = mergeObjectListsById(broadcasts.value, broadcastList, "create_time", "desc").filter(
            (b) => !hasExpired(b.expiration_time)
        );
    }

    function dismissBroadcast(broadcast: BroadcastNotification) {
        Vue.set(dismissedBroadcasts.value, broadcast.id, { expiration_time: broadcast.expiration_time });
    }

    function hasExpired(expirationTimeStr?: string) {
        if (!expirationTimeStr) {
            return false;
        }
        const expirationTime = new Date(`${expirationTimeStr}Z`);
        const now = new Date();
        return now > expirationTime;
    }

    function clearExpiredDismissedBroadcasts() {
        for (const key in dismissedBroadcasts.value) {
            if (hasExpired(dismissedBroadcasts.value[key]?.expiration_time)) {
                delete dismissedBroadcasts.value[key];
            }
        }
    }

    clearExpiredDismissedBroadcasts();

    return {
        broadcasts,
        dismissedBroadcasts,
        loadingBroadcasts,
        activeBroadcasts,
        dismissBroadcast,
        loadBroadcasts,
        updateBroadcasts,
    };
});
