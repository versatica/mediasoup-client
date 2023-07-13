export * from './Device';
export * from './Transport';
export * from './Producer';
export * from './Consumer';
export * from './DataProducer';
export * from './DataConsumer';
export * from './RtpParameters';
export * from './SctpParameters';
export * from './handlers/HandlerInterface';
// We cannot export only the type of error classes because those are useless.
export * from './errors';
export type { ScalabilityMode } from './scalabilityModes';

export type AppData =
{
	[key: string]: unknown;
};
