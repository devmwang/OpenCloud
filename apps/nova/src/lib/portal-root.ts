const PORTAL_ROOT_ID = "portal-root";

let cachedPortalRoot: HTMLElement | null = null;

export function getPortalRoot() {
    if (typeof document === "undefined") {
        return undefined;
    }

    if (cachedPortalRoot && document.body.contains(cachedPortalRoot)) {
        return cachedPortalRoot;
    }

    cachedPortalRoot = document.getElementById(PORTAL_ROOT_ID);
    return cachedPortalRoot ?? undefined;
}
