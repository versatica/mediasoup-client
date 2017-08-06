/**
 * mediasoup-client internally works with ORTC dictionaries. This module provides
 * utils for ORTC.
 */

/**
 * Generate extended RTP capabilities for sending and receiving.
 *
 * @param {RTCRtpCapabilities} aCaps - Local capabilities.
 * @param {RTCRtpCapabilities} bCaps - Remote capabilities.
 * @return {RTCExtendedRtpCapabilities}
 */
export function getExtendedRtpCapabilities(localCaps, remoteCaps)
{
	const extendedCaps =
	{
		codecs           : [],
		headerExtensions : [],
		fecMechanisms    : []
	};

	// Match media codecs and keep the order preferred by remoteCaps.
	for (let remoteCodec of remoteCaps.codecs || [])
	{
		// TODO: Ignore pseudo-codecs and feature codecs.
		if (remoteCodec.name === 'rtx')
			continue;

		const matchingLocalCodec = (localCaps.codecs || [])
			.find((localCodec) => matchCodecs(localCodec, remoteCodec));

		if (matchingLocalCodec)
		{
			const extendedCodec =
			{
				name               : remoteCodec.name,
				mimeType           : remoteCodec.mimeType,
				kind               : remoteCodec.kind,
				clockRate          : remoteCodec.clockRate,
				sendPayloadType    : matchingLocalCodec.preferredPayloadType,
				sendRtxPayloadType : null,
				recvPayloadType    : remoteCodec.preferredPayloadType,
				recvRtxPayloadType : null,
				channels           : remoteCodec.channels,
				rtcpFeedback       : reduceRtcpFeedback(matchingLocalCodec, remoteCodec),
				parameters         : remoteCodec.parameters
			};

			if (!(extendedCodec.channels > 1))
				delete extendedCodec.channels;

			extendedCaps.codecs.push(extendedCodec);
		}
	}

	// Match RTX codecs.
	for (let extendedCodec of extendedCaps.codecs || [])
	{
		const matchingLocalRtxCodec = (localCaps.codecs || [])
			.find((localCodec) =>
			{
				return (
					localCodec.name === 'rtx' &&
					localCodec.parameters.apt === extendedCodec.sendPayloadType
				);
			});

		const matchingRemoteRtxCodec = (remoteCaps.codecs || [])
			.find((remoteCodec) =>
			{
				return (
					remoteCodec.name === 'rtx' &&
					remoteCodec.parameters.apt === extendedCodec.recvPayloadType
				);
			});

		if (matchingLocalRtxCodec && matchingRemoteRtxCodec)
		{
			extendedCodec.sendRtxPayloadType = matchingLocalRtxCodec.preferredPayloadType;
			extendedCodec.recvRtxPayloadType = matchingRemoteRtxCodec.preferredPayloadType;
		}
	}

	// Match header extensions.
	for (let remoteExt of remoteCaps.headerExtensions || [])
	{
		const matchingLocalExt = (localCaps.headerExtensions || [])
			.find((localExt) => matchHeaderExtensions(localExt, remoteExt));

		if (matchingLocalExt)
		{
			const extendedExt =
			{
				kind   : remoteExt.kind,
				uri    : remoteExt.uri,
				sendId : matchingLocalExt.preferredId,
				recvId : remoteExt.preferredId
			};

			extendedCaps.headerExtensions.push(extendedExt);
		}
	}

	return extendedCaps;
}

/**
 * Generate RTP parameters of the given kind for sending media.
 * Just the first media codec per kind is considered.
 * NOTE: muxId, encodings and rtcp fields are left empty.
 *
 * @param {kind} kind
 * @param {RTCExtendedRtpCapabilities} extendedRtpCapabilities
 * @return {RTCRtpParameters}
 */
export function getSendingRtpParameters(kind, extendedRtpCapabilities)
{
	const params =
	{
		muxId            : null,
		codecs           : [],
		headerExtensions : [],
		encodings        : [],
		rtcp             : {}
	};

	for (let capCodec of extendedRtpCapabilities.codecs)
	{
		if (capCodec.kind !== kind)
			continue;

		const codec =
		{
			name         : capCodec.name,
			mimeType     : capCodec.mimeType,
			clockRate    : capCodec.clockRate,
			payloadType  : capCodec.sendPayloadType,
			channels     : capCodec.channels,
			rtcpFeedback : capCodec.rtcpFeedback,
			parameters   : capCodec.parameters
		};

		if (!(codec.channels > 1))
			delete codec.channels;

		params.codecs.push(codec);

		// Add RTX codec.
		if (capCodec.sendRtxPayloadType)
		{
			const rtxCodec =
			{
				name         : 'rtx',
				mimeType     : `${capCodec.kind}/rtx`,
				clockRate    : capCodec.clockRate,
				payloadType  : capCodec.sendRtxPayloadType,
				parameters   :
				{
					apt : capCodec.sendPayloadType
				}
			};

			params.codecs.push(rtxCodec);
		}

		// NOTE: We assume a single media codec plus an optional RTX codec for now.
		// TODO: In the future, we need to add FEC, CN, etc, codecs.
		break;
	}

	for (let capExt of extendedRtpCapabilities.headerExtensions)
	{
		if (capExt.kind !== kind)
			continue;

		const ext =
		{
			uri   : capExt.uri,
			id    : capExt.sendId
		};

		params.headerExtensions.push(ext);
	}

	return params;
}

/**
 * Generate RTP parameters of the given kind for receiving media.
 * All the media codecs per kind are considered.
 * NOTE: muxId, encodings and rtcp fields are left empty.
 *
 * @param {kind} kind
 * @param {RTCExtendedRtpCapabilities} extendedRtpCapabilities.
 * @return {RTCRtpParameters}
 */
export function getReceivingRtpParameters(kind, extendedRtpCapabilities)
{
	const params =
	{
		muxId            : null,
		codecs           : [],
		headerExtensions : [],
		encodings        : [],
		rtcp             : {}
	};

	for (let capCodec of extendedRtpCapabilities.codecs)
	{
		if (capCodec.kind !== kind)
			continue;

		const codec =
		{
			name         : capCodec.name,
			mimeType     : capCodec.mimeType,
			clockRate    : capCodec.clockRate,
			payloadType  : capCodec.recvPayloadType,
			channels     : capCodec.channels,
			rtcpFeedback : capCodec.rtcpFeedback,
			parameters   : capCodec.parameters
		};

		if (!(codec.channels > 1))
			delete codec.channels;

		params.codecs.push(codec);

		// Add RTX codec.
		if (capCodec.recvRtxPayloadType)
		{
			const rtxCodec =
			{
				name         : 'rtx',
				mimeType     : `${capCodec.kind}/rtx`,
				clockRate    : capCodec.clockRate,
				payloadType  : capCodec.recvRtxPayloadType,
				parameters   :
				{
					apt : capCodec.recvPayloadType
				}
			};

			params.codecs.push(rtxCodec);
		}

		// TODO: In the future, we need to add FEC, CN, etc, codecs.
	}

	for (let capExt of extendedRtpCapabilities.headerExtensions)
	{
		if (capExt.kind !== kind)
			continue;

		const ext =
		{
			uri   : capExt.uri,
			id    : capExt.recvId
		};

		params.headerExtensions.push(ext);
	}

	return params;
}

/**
 * Whether the given RTP parameters can be received given the given RTP
 * capabilities.
 *
 * @param {RTCRtpParameters} rtpParameters
 * @param {RTCExtendedRtpCapabilities} extendedRtpCapabilities
 * @return {Boolean}
 */
export function canReceive(rtpParameters, extendedRtpCapabilities)
{
	const firstMediaCodec = rtpParameters.codecs[0];

	return extendedRtpCapabilities.codecs
		.some((codec) => codec.recvPayloadType === firstMediaCodec.payloadType);
}

function matchCodecs(aCodec, bCodec)
{
	return (
		aCodec.mimeType === bCodec.mimeType &&
		aCodec.clockRate === bCodec.clockRate
	);
}

function matchHeaderExtensions(aExt, bExt)
{
	return (
		aExt.kind === bExt.kind &&
		aExt.uri === bExt.uri
	);
}

function reduceRtcpFeedback(codecA, codecB)
{
	const reducedRtcpFeedback = [];

	for (let aFb of (codecA.rtcpFeedback || []))
	{
		const matchingBFb = (codecB.rtcpFeedback || [])
			.find((bFb) =>
			{
				return (
					bFb.type === aFb.type &&
					bFb.parameter === aFb.parameter
				);
			});

		if (matchingBFb)
			reducedRtcpFeedback.push(matchingBFb);
	}

	return reducedRtcpFeedback;
}

