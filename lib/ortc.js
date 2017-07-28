/**
 * mediasoup-client internally works with ORTC dictionaries. This module provides
 * utils for ORTC.
 */

/**
 * Generate extended RTP capabilities for sending and receiving.
 *
 * @param {RTCRtpCapabilities} aCaps - Local capabilities.
 * @param {RTCRtpCapabilities} bCaps - Remote capabilities.
 * @return {Object} Extended capabilities.
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
				clockRate          : remoteCodec.clockRate,
				sendPayloadType    : matchingLocalCodec.preferredPayloadType,
				sendRtxPayloadType : null,
				recvPayloadType    : remoteCodec.preferredPayloadType,
				recvRtxPayloadType : null,
				rtcpFeedback       : reduceRtcpFeedback(matchingLocalCodec, remoteCodec),
				parameters         : remoteCodec.parameters
			};

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

