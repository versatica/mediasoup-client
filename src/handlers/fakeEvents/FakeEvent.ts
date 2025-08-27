// NOTE: Do not use our FakeEventTarget type inside this class, otherwise TS
// will complain because "Property 'listeners' is missing in type 'EventTarget'
// but required in type 'FakeEventTarget'".
export class FakeEvent implements Event {
	/**
	 * Constants.
	 */
	readonly NONE = 0;
	readonly CAPTURING_PHASE = 1;
	readonly AT_TARGET = 2;
	readonly BUBBLING_PHASE = 3;
	/**
	 * Members.
	 */
	readonly type: string;
	readonly bubbles: boolean;
	readonly cancelable: boolean;
	defaultPrevented: boolean = false;
	readonly composed: boolean = false;
	readonly currentTarget: EventTarget | null = null;
	// Not implemented.
	readonly eventPhase: number = this.NONE;
	readonly isTrusted: boolean = true;
	readonly target: EventTarget | null = null;
	readonly timeStamp: number = 0;
	// Deprecated.
	readonly cancelBubble: boolean = false;
	readonly returnValue: boolean = true;
	readonly srcElement: EventTarget | null = null;

	constructor(
		type: string,
		options: { bubbles?: boolean; cancelable?: boolean } = {}
	) {
		this.type = type;
		this.bubbles = options.bubbles ?? false;
		this.cancelable = options.cancelable ?? false;
	}

	preventDefault(): void {
		if (this.cancelable) {
			this.defaultPrevented = true;
		}
	}

	/**
	 * Not implemented.
	 */
	stopPropagation(): void {}

	/**
	 * Not implemented.
	 */
	stopImmediatePropagation(): void {}

	/**
	 * Not implemented.
	 */
	composedPath(): EventTarget[] {
		return [];
	}

	/**
	 * Not implemented.
	 * @deprecated
	 */
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	initEvent(type: string, bubbles: boolean, cancelable: true): void {
		// Not implemented.
	}
}
