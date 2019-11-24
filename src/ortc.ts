import * as h264 from 'h264-profile-level-id';
import { RtpParameters, RtpCodecParameters, RtpCapabilities } from './RtpParameters';

const PROBATOR_SSRC = 1234;

/**
 * Generate extended RTP capabilities for sending and receiving.
 */
export function getExtendedRtpCapabilities(
	localCaps: RtpCapabilities,
	remoteCaps: RtpCapabilities
): any
{
	const extendedRtpCapabilities: any =
	{
		codecs           : [],
		headerExtensions : [],
		fecMechanisms    : []
	};

	// Match media codecs and keep the order preferred by remoteCaps.
	for (const remoteCodec of remoteCaps.codecs || [])
	{
		if (
			typeof remoteCodec !== 'object' ||
			Array.isArray(remoteCodec) ||
			typeof remoteCodec.mimeType !== 'string' ||
			!/^(audio|video)\/(.+)/.test(remoteCodec.mimeType)
		)
		{
			throw new TypeError('invalid remote capabilitiy codec');
		}

		if (/.+\/rtx$/i.test(remoteCodec.mimeType))
			continue;

		const matchingLocalCodec = (localCaps.codecs || [])
			.find((localCodec: any) => (
				matchCodecs(localCodec, remoteCodec, { strict: true, modify: true }))
			);

		if (matchingLocalCodec)
		{
			const extendedCodec: any =
			{
				mimeType             : matchingLocalCodec.mimeType,
				kind                 : matchingLocalCodec.kind,
				clockRate            : matchingLocalCodec.clockRate,
				localPayloadType     : matchingLocalCodec.preferredPayloadType,
				localRtxPayloadType  : null,
				remotePayloadType    : remoteCodec.preferredPayloadType,
				remoteRtxPayloadType : null,
				channels             : matchingLocalCodec.channels,
				rtcpFeedback         : reduceRtcpFeedback(matchingLocalCodec, remoteCodec),
				localParameters      : matchingLocalCodec.parameters || {},
				remoteParameters     : remoteCodec.parameters || {}
			};

			if (!extendedCodec.channels)
				delete extendedCodec.channels;

			extendedRtpCapabilities.codecs.push(extendedCodec);
		}
	}

	// Match RTX codecs.
	for (const extendedCodec of extendedRtpCapabilities.codecs || [])
	{
		const matchingLocalRtxCodec = (localCaps.codecs || [])
			.find((localCodec: any) => (
				/.+\/rtx$/i.test(localCodec.mimeType) &&
				localCodec.parameters.apt === extendedCodec.localPayloadType
			));

		const matchingRemoteRtxCodec = (remoteCaps.codecs || [])
			.find((remoteCodec: any) => (
				/.+\/rtx$/i.test(remoteCodec.mimeType) &&
				remoteCodec.parameters.apt === extendedCodec.remotePayloadType
			));

		if (matchingLocalRtxCodec && matchingRemoteRtxCodec)
		{
			extendedCodec.localRtxPayloadType = matchingLocalRtxCodec.preferredPayloadType;
			extendedCodec.remoteRtxPayloadType = matchingRemoteRtxCodec.preferredPayloadType;
		}
	}

	// Match header extensions.
	for (const remoteExt of remoteCaps.headerExtensions || [])
	{
		const matchingLocalExt = (localCaps.headerExtensions || [])
			.find((localExt: any) => matchHeaderExtensions(localExt, remoteExt));

		if (matchingLocalExt)
		{
			const extendedExt =
			{
				kind      : remoteExt.kind,
				uri       : remoteExt.uri,
				sendId    : matchingLocalExt.preferredId,
				recvId    : remoteExt.preferredId,
				direction : 'sendrecv'
			};

			switch (remoteExt.direction)
			{
				case 'recvonly':
					extendedExt.direction = 'sendonly';
					break;
				case 'sendonly':
					extendedExt.direction = 'recvonly';
					break;
				case 'inactive':
					extendedExt.direction = 'inactive';
					break;
				default:
					extendedExt.direction = 'sendrecv';
			}

			extendedRtpCapabilities.headerExtensions.push(extendedExt);
		}
	}

	return extendedRtpCapabilities;
}

/**
 * Generate RTP capabilities for receiving media based on the given extended
 * RTP capabilities.
 */
export function getRecvRtpCapabilities(extendedRtpCapabilities: any): RtpCapabilities
{
	const rtpCapabilities: RtpCapabilities =
	{
		codecs           : [],
		headerExtensions : [],
		fecMechanisms    : []
	};

	for (const extendedCodec of extendedRtpCapabilities.codecs)
	{
		const codec =
		{
			mimeType             : extendedCodec.mimeType,
			kind                 : extendedCodec.kind,
			clockRate            : extendedCodec.clockRate,
			preferredPayloadType : extendedCodec.remotePayloadType,
			channels             : extendedCodec.channels,
			rtcpFeedback         : extendedCodec.rtcpFeedback,
			parameters           : extendedCodec.localParameters
		};

		if (!codec.channels)
			delete codec.channels;

		rtpCapabilities.codecs.push(codec);

		// Add RTX codec.
		if (extendedCodec.remoteRtxPayloadType)
		{
			const extendedRtxCodec: any =
			{
				mimeType             : `${extendedCodec.kind}/rtx`,
				kind                 : extendedCodec.kind,
				clockRate            : extendedCodec.clockRate,
				preferredPayloadType : extendedCodec.remoteRtxPayloadType,
				rtcpFeedback         : [],
				parameters           :
				{
					apt : extendedCodec.remotePayloadType
				}
			};

			rtpCapabilities.codecs.push(extendedRtxCodec);
		}
	}

	for (const extendedExtension of extendedRtpCapabilities.headerExtensions)
	{
		// Ignore RTP extensions not valid for receiving.
		if (
			extendedExtension.direction !== 'sendrecv' &&
			extendedExtension.direction !== 'recvonly'
		)
		{
			continue;
		}

		const ext =
		{
			kind        : extendedExtension.kind,
			uri         : extendedExtension.uri,
			preferredId : extendedExtension.recvId
		};

		rtpCapabilities.headerExtensions.push(ext);
	}

	rtpCapabilities.fecMechanisms = extendedRtpCapabilities.fecMechanisms;

	return rtpCapabilities;
}

/**
 * Generate RTP parameters of the given kind for sending media.
 * Just the first media codec per kind is considered.
 * NOTE: mid, encodings and rtcp fields are left empty.
 */
export function getSendingRtpParameters(kind: 'audio' | 'video', extendedRtpCapabilities: any): RtpParameters
{
	const rtpParameters: RtpParameters =
	{
		mid              : null,
		codecs           : [],
		headerExtensions : [],
		encodings        : [],
		rtcp             : {}
	};

	for (const extendedCodec of extendedRtpCapabilities.codecs)
	{
		if (extendedCodec.kind !== kind)
			continue;

		const codec =
		{
			mimeType     : extendedCodec.mimeType,
			clockRate    : extendedCodec.clockRate,
			payloadType  : extendedCodec.localPayloadType,
			channels     : extendedCodec.channels,
			rtcpFeedback : extendedCodec.rtcpFeedback,
			parameters   : extendedCodec.localParameters
		};

		if (!codec.channels)
			delete codec.channels;

		rtpParameters.codecs.push(codec);

		// Add RTX codec.
		if (extendedCodec.localRtxPayloadType)
		{
			const rtxCodec: RtpCodecParameters =
			{
				mimeType     : `${extendedCodec.kind}/rtx`,
				clockRate    : extendedCodec.clockRate,
				payloadType  : extendedCodec.localRtxPayloadType,
				rtcpFeedback : [],
				parameters   :
				{
					apt : extendedCodec.localPayloadType
				}
			};

			rtpParameters.codecs.push(rtxCodec);
		}

		// NOTE: We assume a single media codec plus an optional RTX codec.
		break;
	}

	for (const extendedExtension of extendedRtpCapabilities.headerExtensions)
	{
		// Ignore RTP extensions of a different kind and those not valid for sending.
		if (
			(extendedExtension.kind && extendedExtension.kind !== kind) ||
			(
				extendedExtension.direction !== 'sendrecv' &&
				extendedExtension.direction !== 'sendonly'
			)
		)
		{
			continue;
		}

		const ext =
		{
			uri : extendedExtension.uri,
			id  : extendedExtension.sendId
		};

		rtpParameters.headerExtensions.push(ext);
	}

	return rtpParameters;
}

/**
 * Generate RTP parameters of the given kind suitable for the remote SDP answer.
 */
export function getSendingRemoteRtpParameters(kind: 'audio' | 'video', extendedRtpCapabilities: any): RtpParameters
{
	const rtpParameters: RtpParameters =
	{
		mid              : null,
		codecs           : [],
		headerExtensions : [],
		encodings        : [],
		rtcp             : {}
	};

	for (const extendedCodec of extendedRtpCapabilities.codecs)
	{
		if (extendedCodec.kind !== kind)
			continue;

		const codec =
		{
			mimeType     : extendedCodec.mimeType,
			clockRate    : extendedCodec.clockRate,
			payloadType  : extendedCodec.localPayloadType,
			channels     : extendedCodec.channels,
			rtcpFeedback : extendedCodec.rtcpFeedback,
			parameters   : extendedCodec.remoteParameters
		};

		if (!codec.channels)
			delete codec.channels;

		rtpParameters.codecs.push(codec);

		// Add RTX codec.
		if (extendedCodec.localRtxPayloadType)
		{
			const rtxCodec: RtpCodecParameters =
			{
				mimeType     : `${extendedCodec.kind}/rtx`,
				clockRate    : extendedCodec.clockRate,
				payloadType  : extendedCodec.localRtxPayloadType,
				rtcpFeedback : [],
				parameters   :
				{
					apt : extendedCodec.localPayloadType
				}
			};

			rtpParameters.codecs.push(rtxCodec);
		}

		// NOTE: We assume a single media codec plus an optional RTX codec.
		break;
	}

	for (const extendedExtension of extendedRtpCapabilities.headerExtensions)
	{
		// Ignore RTP extensions of a different kind and those not valid for sending.
		if (
			(extendedExtension.kind && extendedExtension.kind !== kind) ||
			(
				extendedExtension.direction !== 'sendrecv' &&
				extendedExtension.direction !== 'sendonly'
			)
		)
		{
			continue;
		}

		const ext =
		{
			uri : extendedExtension.uri,
			id  : extendedExtension.sendId
		};

		rtpParameters.headerExtensions.push(ext);
	}

	// Reduce codecs' RTCP feedback. Use Transport-CC if available, REMB otherwise.
	if (
		rtpParameters.headerExtensions.some((ext) => (
			ext.uri === 'http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01'
		))
	)
	{
		for (const codec of rtpParameters.codecs)
		{
			codec.rtcpFeedback = (codec.rtcpFeedback || [])
				.filter((fb: any) => fb.type !== 'goog-remb');
		}
	}
	else if (
		rtpParameters.headerExtensions.some((ext) => (
			ext.uri === 'http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time'
		))
	)
	{
		for (const codec of rtpParameters.codecs)
		{
			codec.rtcpFeedback = (codec.rtcpFeedback || [])
				.filter((fb) => fb.type !== 'transport-cc');
		}
	}
	else
	{
		for (const codec of rtpParameters.codecs)
		{
			codec.rtcpFeedback = (codec.rtcpFeedback || [])
				.filter((fb: any) => (
					fb.type !== 'transport-cc' &&
					fb.type !== 'goog-remb'
				));
		}
	}

	return rtpParameters;
}

/**
 * Whether media can be sent based on the given RTP capabilities.
 */
export function canSend(kind: 'audio' | 'video', extendedRtpCapabilities: any): boolean
{
	return extendedRtpCapabilities.codecs.
		some((codec: any) => codec.kind === kind);
}

/**
 * Whether the given RTP parameters can be received with the given RTP
 * capabilities.
 */
export function canReceive(
	rtpParameters: RtpParameters, extendedRtpCapabilities: any
): boolean
{
	if (rtpParameters.codecs.length === 0)
		return false;

	const firstMediaCodec = rtpParameters.codecs[0];

	return extendedRtpCapabilities.codecs
		.some((codec: any) => codec.remotePayloadType === firstMediaCodec.payloadType);
}

/**
 * Create RTP parameters for a Consumer for the RTP probator.
 */
export function generateProbatorRtpParameters(
	videoRtpParameters: RtpParameters
): RtpParameters
{
	const rtpParameters: RtpParameters =
	{
		mid              : null,
		codecs           : [],
		headerExtensions : [],
		encodings        : [],
		rtcp             :
		{
			cname : 'probator'
		}
	};

	rtpParameters.codecs.push(videoRtpParameters.codecs[0]);

	rtpParameters.headerExtensions = videoRtpParameters.headerExtensions
		.filter((ext: any) => (
			ext.uri === 'http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time' ||
			ext.uri === 'http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01'
		));

	rtpParameters.encodings.push({ ssrc: PROBATOR_SSRC });

	return rtpParameters;
}

function matchCodecs(
	aCodec: any, bCodec: any, { strict = false, modify = false } = {}
): boolean
{
	const aMimeType = aCodec.mimeType.toLowerCase();
	const bMimeType = bCodec.mimeType.toLowerCase();

	if (aMimeType !== bMimeType)
		return false;

	if (aCodec.clockRate !== bCodec.clockRate)
		return false;

	if (
		/^audio\/.+$/i.test(aMimeType) &&
		(
			(aCodec.channels !== undefined && aCodec.channels !== 1) ||
			(bCodec.channels !== undefined && bCodec.channels !== 1)
		) &&
		aCodec.channels !== bCodec.channels
	)
	{
		return false;
	}

	// Per codec special checks.
	switch (aMimeType)
	{
		case 'video/h264':
		{
			const aPacketizationMode = (aCodec.parameters || {})['packetization-mode'] || 0;
			const bPacketizationMode = (bCodec.parameters || {})['packetization-mode'] || 0;

			if (aPacketizationMode !== bPacketizationMode)
				return false;

			// If strict matching check profile-level-id.
			if (strict)
			{
				if (!h264.isSameProfile(aCodec.parameters, bCodec.parameters))
					return false;

				let selectedProfileLevelId;

				try
				{
					selectedProfileLevelId =
						h264.generateProfileLevelIdForAnswer(aCodec.parameters, bCodec.parameters);
				}
				catch (error)
				{
					return false;
				}

				if (modify)
				{
					aCodec.parameters = aCodec.parameters || {};

					if (selectedProfileLevelId)
						aCodec.parameters['profile-level-id'] = selectedProfileLevelId;
					else
						delete aCodec.parameters['profile-level-id'];
				}
			}

			break;
		}

		case 'video/vp9':
		{
			// If strict matching check profile-id.
			if (strict)
			{
				const aProfileId = (aCodec.parameters || {})['profile-id'] || 0;
				const bProfileId = (bCodec.parameters || {})['profile-id'] || 0;

				if (aProfileId !== bProfileId)
					return false;
			}

			break;
		}
	}

	return true;
}

function matchHeaderExtensions(aExt: any, bExt: any): boolean
{
	if (aExt.kind && bExt.kind && aExt.kind !== bExt.kind)
		return false;

	if (aExt.uri !== bExt.uri)
		return false;

	return true;
}

function reduceRtcpFeedback(codecA: any, codecB: any): any
{
	const reducedRtcpFeedback = [];

	for (const aFb of codecA.rtcpFeedback || [])
	{
		const matchingBFb = (codecB.rtcpFeedback || [])
			.find((bFb: any) => (
				bFb.type === aFb.type &&
				(bFb.parameter === aFb.parameter || (!bFb.parameter && !aFb.parameter))
			));

		if (matchingBFb)
			reducedRtcpFeedback.push(matchingBFb);
	}

	return reducedRtcpFeedback;
}
