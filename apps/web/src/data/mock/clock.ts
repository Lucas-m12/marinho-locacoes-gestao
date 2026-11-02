let clock: () => Date = () => new Date();

export function mockNow(): Date {
	return clock();
}

export function setMockClock(next: () => Date): void {
	clock = next;
}

export function resetMockClock(): void {
	clock = () => new Date();
}
