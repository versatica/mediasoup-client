import * as sdpTransform from 'sdp-transform';
import { DtlsParameters, DtlsRole } from '../../Transport';
import {
	RtpCapabilities,
	RtpCodecCapability,
	RtpHeaderExtension,
	RtpParameters,
	RtcpFeedback
} from '../../RtpParameters';

export function extractRtpCapabilities(
	{ sdpObject }:
	{ sdpObject: any }
): RtpCapabilities
{
	// Map of RtpCodecParameters indexed by payload type.
	const codecsMap: Map<number, RtpCodecCapability> = new Map();
	// Array of RtpHeaderExtensions.
	const headerExtensions: RtpHeaderExtension[] = [];
	// Whether a m=audio/video section has been already found.
	let gotAudio = false;
	let gotVideo = false;

	for (const m of sdpObject.media)
	{
		const kind = m.type;

		switch (kind)
		{
			case 'audio':
			{
				if (gotAudio)
					continue;

				gotAudio = true;

				break;
			}
			case 'video':
			{
				if (gotVideo)
					continue;

				gotVideo = true;

				break;
			}
			default:
			{
				continue;
			}
		}

		// Get codecs.
		for (const rtp of m.rtp)
		{
			const codec: RtpCodecCapability =
			{
				kind                 : kind,
				mimeType             : `${kind}/${rtp.codec}`,
				preferredPayloadType : rtp.payload,
				clockRate            : rtp.rate,
				channels             : rtp.encoding,
				parameters           : {},
				rtcpFeedback         : []
			};

			codecsMap.set(codec.preferredPayloadType!, codec);
		}

		// Get codec parameters.
		for (const fmtp of m.fmtp || [])
		{
			const parameters = sdpTransform.parseParams(fmtp.config);
			const codec = codecsMap.get(fmtp.payload);

			if (!codec)
				continue;

			// Specials case to convert parameter value to string.
			if (parameters && parameters['profile-level-id'])
				parameters['profile-level-id'] = String(parameters['profile-level-id']);

			codec.parameters = parameters;
		}

		// Get RTCP feedback for each codec.
		for (const fb of m.rtcpFb || [])
		{
			const codec = codecsMap.get(fb.payload);

			if (!codec)
				continue;

			const feedback: RtcpFeedback =
			{
				type      : fb.type,
				parameter : fb.subtype
			};

			if (!feedback.parameter)
				delete feedback.parameter;

			codec.rtcpFeedback!.push(feedback);
		}

		// Get RTP header extensions.
		for (const ext of m.ext || [])
		{
			// Ignore encrypted extensions (not yet supported in mediasoup).
			if (ext['encrypt-uri'])
				continue;

			const headerExtension: RtpHeaderExtension =
			{
				kind        : kind,
				uri         : ext.uri,
				preferredId : ext.value
			};

			headerExtensions.push(headerExtension);
		}
	}

	const rtpCapabilities: RtpCapabilities =
	{
		codecs           : Array.from(codecsMap.values()),
		headerExtensions : headerExtensions
	};

	return rtpCapabilities;
}

export function extractDtlsParameters(
	{ sdpObject }:
	{ sdpObject: any }
): DtlsParameters
{
	const mediaObject = (sdpObject.media || [])
		.find((m: { iceUfrag: string; port: number }) => (
			m.iceUfrag && m.port !== 0
		));

	if (!mediaObject)
		throw new Error('no active media section found');

	const fingerprint = mediaObject.fingerprint || sdpObject.fingerprint;
	let role: DtlsRole | undefined;

	switch (mediaObject.setup)
	{
		case 'active':
			role = 'client';
			break;
		case 'passive':
			role = 'server';
			break;
		case 'actpass':
			role = 'auto';
			break;
	}

	const dtlsParameters: DtlsParameters =
	{
		role,
		fingerprints :
		[
			{
				algorithm : fingerprint.type,
				value     : fingerprint.hash
			}
		]
	};

	return dtlsParameters;
}

export function getCname(
	{ offerMediaObject }:
	{ offerMediaObject: any }
): string
{
	const ssrcCnameLine = (offerMediaObject.ssrcs || [])
		.find((line: { attribute: string }) => line.attribute === 'cname');

	if (!ssrcCnameLine)
		return '';

	return ssrcCnameLine.value;
}

/**
 * Apply codec parameters in the given SDP m= section answer based on the
 * given RTP parameters of an offer.
 */
export function applyCodecParameters(
	{
		offerRtpParameters,
		answerMediaObject
	}:
	{
		offerRtpParameters: RtpParameters;
		answerMediaObject: any;
	}
): void
{
	for (const codec of offerRtpParameters.codecs)
	{
		const mimeType = codec.mimeType.toLowerCase();

		// Avoid parsing codec parameters for unhandled codecs.
		if (mimeType !== 'audio/opus')
			continue;

		const rtp = (answerMediaObject.rtp || [])
			.find((r: { payload: number }) => r.payload === codec.payloadType);

		if (!rtp)
			continue;

		// Just in case.
		answerMediaObject.fmtp = answerMediaObject.fmtp || [];

		let fmtp = answerMediaObject.fmtp
			.find((f: { payload: number }) => f.payload === codec.payloadType);

		if (!fmtp)
		{
			fmtp = { payload: codec.payloadType, config: '' };
			answerMediaObject.fmtp.push(fmtp);
		}

		const parameters = sdpTransform.parseParams(fmtp.config);

		switch (mimeType)
		{
			case 'audio/opus':
			{
				const spropStereo = codec.parameters['sprop-stereo'];

				if (spropStereo !== undefined)
					parameters.stereo = spropStereo ? 1 : 0;

				break;
			}
		}

		// Write the codec fmtp.config back.
		fmtp.config = '';

		for (const key of Object.keys(parameters))
		{
			if (fmtp.config)
				fmtp.config += ';';

			fmtp.config += `${key}=${parameters[key]}`;
		}
	}
}
