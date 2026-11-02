import { useSyncExternalStore } from "react";

export type Breakpoint = "phone" | "tablet" | "desktop";

const TABLET_MIN = 768;
const DESKTOP_MIN = 1280;

function current(): Breakpoint {
	if (window.innerWidth >= DESKTOP_MIN) return "desktop";
	return window.innerWidth >= TABLET_MIN ? "tablet" : "phone";
}

function subscribe(listener: () => void) {
	window.addEventListener("resize", listener);
	return () => window.removeEventListener("resize", listener);
}

export function useBreakpoint(): Breakpoint {
	return useSyncExternalStore(subscribe, current);
}
