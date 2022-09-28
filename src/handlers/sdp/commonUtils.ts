import * as sdpTransform from 'sdp-transform';
import { DtlsParameters, DtlsRole } from '../../Transport';
import {
	RtpCapabilities,
	RtpCodecCapability,
	RtpHeaderExtension,
	RtpHeaderExtensionDirection,
	RtpHeaderExtensionParameters,
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
			if (parameters && parameters.hasOwnProperty('profile-level-id'))
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

/**
 * Adds the given RTP extension to the given SDP media object and returns a
 * RtpHeaderExtensionParameters object.
 * If the extension is already present, this function doesn't add anything and
 * doesn't return anything.
 */
export function addRtpExtensionToMediaObject(
	{ mediaObject, uri }:
	{ mediaObject: any; uri: string }
): RtpHeaderExtensionParameters | undefined
{
	if (!Array.isArray(mediaObject.ext))
	{
		mediaObject.ext = [];
	}

	let id = 1;

	for (const exten of mediaObject.ext)
	{
		// If extension uri is already present, don't do anything.
		if (exten.uri === uri)
		{
			id = 0;

			break;
		}

		if (exten.value >= id)
			id = exten.value + 1;
	}

	if (id > 0)
	{
		mediaObject.ext.push({ value: id, uri });

		// NOTE: No support for encrypt/parameters fields.
		return { uri,	id };
	}
}

/**
 * Adds the given RTP extension to the given RTP capabilities.
 * If the extension is already present, this function doesn't add anything.
 */
export function addRtpExtensionToRtpCapabilities(
	{
		rtpCapabilities,
		uri,
		audio,
		video,
		direction
	}:
	{
		rtpCapabilities: RtpCapabilities;
		uri: string;
		audio: boolean;
		video: boolean;
		direction: RtpHeaderExtensionDirection;
	}
): void
{
	let preferredId = 1;

	if (!Array.isArray(rtpCapabilities.headerExtensions))
	{
		rtpCapabilities.headerExtensions = [];
	}

	for (const exten of rtpCapabilities.headerExtensions)
	{
		// If extension uri is already present, don't do anything.
		if (exten.uri === uri)
		{
			preferredId = 0;

			break;
		}

		if (exten.preferredId >= preferredId)
			preferredId = exten.preferredId + 1;
	}

	if (preferredId > 0)
	{
		if (audio)
		{
			rtpCapabilities.headerExtensions.push(
				{
					kind             : 'audio',
					uri,
					preferredId,
					preferredEncrypt : false,
					direction
				});
		}

		if (video)
		{
			rtpCapabilities.headerExtensions.push(
				{
					kind             : 'video',
					uri,
					preferredId,
					preferredEncrypt : false,
					direction
				});
		}
	}
}

/**
 * Adds the given RTP extension to the given RTP parameters.
 * If the extension is already present (with same id), this function doesn't
 * add anything. If the extension is present with a different id, then existing
 * one is removed and the new one is added.
 */
export function addRtpExtensionToRtpParameters(
	{
		rtpParameters,
		extension
	}:
	{
		rtpParameters: RtpParameters;
		extension: RtpHeaderExtensionParameters;
	}
): void
{
	if (!Array.isArray(rtpParameters.headerExtensions))
	{
		rtpParameters.headerExtensions = [];
	}

	let replaced = false;

	for (const exten of rtpParameters.headerExtensions)
	{
		if (exten.uri === extension.uri && exten.id === extension.id)
		{
			console.warn('--- addRtpExtensionToRtpParameters() EXTEN ALREADY EXISTS');
			return;
		}
		else if (exten.uri === extension.uri && exten.id !== extension.id)
		{
			console.warn('--- addRtpExtensionToRtpParameters() REPLACING EXTEN ID');
			exten.id = extension.id;

			replaced = true;
		}
	}

	if (!replaced)
	{
		console.warn('--- addRtpExtensionToRtpParameters() adding exten');
		rtpParameters.headerExtensions.push(extension);
	}
}
