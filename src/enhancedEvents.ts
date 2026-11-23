/* eslint-disable @typescript-eslint/no-explicit-any */

// NOTE: In Node.js `events` is always the native module, even if the npm
// `events` package (in `dependencies`) is installed. Bundlers for the browser
// resolve it to that npm package instead.
import { EventEmitter as RuntimeEventEmitter } from 'events';
// NOTE: Types are taken from the npm `events` package (via the
// `@types/events-alias` alias in `dependencies`) so the generated TypeScript
// declarations don't depend on Node.js types.
import type { EventEmitter as EventEmitterType, Listener } from 'events-alias';
import { Logger } from './Logger';

const EventEmitter = RuntimeEventEmitter as unknown as typeof EventEmitterType;

const enhancedEventEmitterLogger = new Logger('EnhancedEventEmitter');

type Events = Record<string, any[]>;

export class EnhancedEventEmitter<
	E extends Events = Events,
> extends EventEmitter {
	constructor() {
		super();

		this.setMaxListeners(Infinity);
	}

	/**
	 * Empties all stored event listeners.
	 */
	close(): void {
		super.removeAllListeners();
	}

	override emit<K extends keyof E & string>(
		eventName: K,
		...args: E[K]
	): boolean {
		return super.emit(eventName, ...args);
	}

	/**
	 * Special addition to the EventEmitter API.
	 */
	safeEmit<K extends keyof E & string>(eventName: K, ...args: E[K]): boolean {
		try {
			return super.emit(eventName, ...args);
		} catch (error) {
			enhancedEventEmitterLogger.error(
				'safeEmit() | event listener threw an error [eventName:%s]:%o',
				eventName,
				error
			);

			try {
				super.emit('listenererror', eventName, error);
			} catch (error2) {
				// Ignore it.
			}

			return Boolean(super.listenerCount(eventName));
		}
	}

	override on<K extends keyof E & string>(
		eventName: K,
		listener: (...args: E[K]) => void
	): this {
		super.on(eventName, listener as (...args: any[]) => void);

		return this;
	}

	override off<K extends keyof E & string>(
		eventName: K,
		listener: (...args: E[K]) => void
	): this {
		super.off(eventName, listener as (...args: any[]) => void);

		return this;
	}

	override addListener<K extends keyof E & string>(
		eventName: K,
		listener: (...args: E[K]) => void
	): this {
		super.on(eventName, listener as (...args: any[]) => void);

		return this;
	}

	override prependListener<K extends keyof E & string>(
		eventName: K,
		listener: (...args: E[K]) => void
	): this {
		super.prependListener(eventName, listener as (...args: any[]) => void);

		return this;
	}

	override once<K extends keyof E & string>(
		eventName: K,
		listener: (...args: E[K]) => void
	): this {
		super.once(eventName, listener as (...args: any[]) => void);

		return this;
	}

	override prependOnceListener<K extends keyof E & string>(
		eventName: K,
		listener: (...args: E[K]) => void
	): this {
		super.prependOnceListener(eventName, listener as (...args: any[]) => void);

		return this;
	}

	override removeListener<K extends keyof E & string>(
		eventName: K,
		listener: (...args: E[K]) => void
	): this {
		super.off(eventName, listener as (...args: any[]) => void);

		return this;
	}

	override removeAllListeners<K extends keyof E & string>(eventName?: K): this {
		super.removeAllListeners(eventName);

		return this;
	}

	override listenerCount<K extends keyof E & string>(eventName: K): number {
		return super.listenerCount(eventName);
	}

	override listeners<K extends keyof E & string>(eventName: K): Listener[] {
		return super.listeners(eventName);
	}

	override rawListeners<K extends keyof E & string>(eventName: K): Listener[] {
		return super.rawListeners(eventName);
	}
}
