import { MediaKind, RtpEncodingParameters } from '../../RtpParameters';

/**
 * Extract plain RTP parameters from a SDP.
 *
 * @returns {Object} with ip (String), ipVersion (4 or 6 Number) and port (Number).
 */
export function extractPlainRtpParameters(
	{
		sdpObject,
		kind
	}:
	{
		sdpObject: any;
		kind: MediaKind;
	}
): any
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
