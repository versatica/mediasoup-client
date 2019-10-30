declare module 'sdp-transform'
{
	export function write(session: object, opts?: object): string;
	export function parse(sdp: string): any;
	export function parseFmtpConfig(str: string): any;
	export function parseParams(str: string): any;
	export function parsePayloads(str: string): number[];
	export function parseRemoteCandidates(std: string): object[];
	export function parseImageAttributes(str: string): string[];
	export function parseSimulcastStreamList(str: string): object;
}
