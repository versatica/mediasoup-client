import { MediaKind, RtpEncodingParameters } from '../../RtpParameters';

export function extractPlainRtpParameters(
	{
		sdpObject,
		kind
	}:
	{
		sdpObject: any;
		kind: MediaKind;
	}
):
{
	ip: string;
	ipVersion: 4 | 6;
	port: number;
}
{
	const mediaObject = (sdpObject.media || [])
		.find((m: any) => m.type === kind);

	if (!mediaObject)
		throw new Error(`m=${kind} section not found`);

	const connectionObject = mediaObject.connection || sdpObject.connection;

	return {
		ip        : connectionObject.ip,
		ipVersion : connectionObject.version,
		port      : mediaObject.port
	};
}

export function getRtpEncodings(
	{
		sdpObject,
		kind
	}:
	{
		sdpObject: any;
		kind: MediaKind;
	}
): RtpEncodingParameters[]
{
	const mediaObject = (sdpObject.media || [])
		.find((m: any) => m.type === kind);

	if (!mediaObject)
		throw new Error(`m=${kind} section not found`);

	const ssrcCnameLine = (mediaObject.ssrcs || [])[0];
	const ssrc = ssrcCnameLine ? ssrcCnameLine.id : null;

	if (ssrc)
		return [ { ssrc } ];
	else
		return [];
}
