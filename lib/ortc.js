/**
 * Generate extended RTP capabilities for sending and receiving.
 *
 * @param {RTCRtpCapabilities} localCaps - Local capabilities.
 * @param {RTCRtpCapabilities} remoteCaps - Remote capabilities.
 *
 * @returns {RTCExtendedRtpCapabilities}
 */
exports.getExtendedRtpCapabilities = function(localCaps, remoteCaps)
{
	const extendedRtpCapabilities =
	{
		codecs           : [],
		headerExtensions : [],
		fecMechanisms    : []
	};

	// Match media codecs and keep the order preferred by remoteCaps.
	for (const remoteCodec of remoteCaps.codecs || [])
	{
		if (/.+\/rtx$/i.test(remoteCodec.mimeType))
			continue;

		const matchingLocalCodec = (localCaps.codecs || [])
			.find((localCodec) => matchCapCodecs(localCodec, remoteCodec));

		if (matchingLocalCodec)
		{
			const extendedCodec =
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
			.find((localCodec) => (
				/.+\/rtx$/i.test(localCodec.mimeType) &&
				localCodec.parameters.apt === extendedCodec.localPayloadType
			));

		const matchingRemoteRtxCodec = (remoteCaps.codecs || [])
			.find((remoteCodec) => (
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
			.find((localExt) => matchCapHeaderExtensions(localExt, remoteExt));

		if (matchingLocalExt)
		{
			const extendedExt =
			{
				kind   : remoteExt.kind,
				uri    : remoteExt.uri,
				sendId : matchingLocalExt.preferredId,
				recvId : remoteExt.preferredId
			};

			extendedRtpCapabilities.headerExtensions.push(extendedExt);
		}
	}

	return extendedRtpCapabilities;
};

/**
 * Generate RTP capabilities for receiving media based on the given extended
 * RTP capabilities.
 *
 * @param {RTCExtendedRtpCapabilities} extendedRtpCapabilities
 *
 * @returns {RTCRtpCapabilities}
 */
exports.getRecvRtpCapabilities = function(extendedRtpCapabilities)
{
	const rtpCapabilities =
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
			const extendedRtxCodec =
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
};

/**
 * Generate RTP parameters of the given kind for sending media.
 * Just the first media codec per kind is considered.
 * NOTE: mid, encodings and rtcp fields are left empty.
 *
 * @param {kind} kind
 * @param {RTCExtendedRtpCapabilities} extendedRtpCapabilities
 *
 * @returns {RTCRtpParameters}
 */
exports.getSendingRtpParameters = function(kind, extendedRtpCapabilities)
{
	const rtpParameters =
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
			const rtxCodec =
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
		if (extendedExtension.kind && extendedExtension.kind !== kind)
			continue;

		const ext =
		{
			uri : extendedExtension.uri,
			id  : extendedExtension.sendId
		};

		rtpParameters.headerExtensions.push(ext);
	}

	return rtpParameters;
};

/**
 * Generate RTP parameters of the given kind suitable for the remote SDP answer.
 *
 * @param {kind} kind
 * @param {RTCExtendedRtpCapabilities} extendedRtpCapabilities
 *
 * @returns {RTCRtpParameters}
 */
exports.getSendingRemoteRtpParameters = function(kind, extendedRtpCapabilities)
{
	const rtpParameters =
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
			const rtxCodec =
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
		if (extendedExtension.kind && extendedExtension.kind !== kind)
			continue;

		const ext =
		{
			uri : extendedExtension.uri,
			id  : extendedExtension.sendId
		};

		rtpParameters.headerExtensions.push(ext);
	}

	return rtpParameters;
};

/**
 * Whether media can be sent based on the given RTP capabilities.
 *
 * @param {String} kind
 * @param {RTCExtendedRtpCapabilities} extendedRtpCapabilities
 *
 * @returns {Boolean}
 */
exports.canSend = function(kind, extendedRtpCapabilities)
{
	return extendedRtpCapabilities.codecs.
		some((codec) => codec.kind === kind);
};

/**
 * Whether the given RTP parameters can be received with the given RTP
 * capabilities.
 *
 * @param {RTCRtpParameters} rtpParameters
 * @param {RTCExtendedRtpCapabilities} extendedRtpCapabilities
 *
 * @returns {Boolean}
 */
exports.canReceive = function(rtpParameters, extendedRtpCapabilities)
{
	if (rtpParameters.codecs.length === 0)
		return false;

	const firstMediaCodec = rtpParameters.codecs[0];

	return extendedRtpCapabilities.codecs
		.some((codec) => codec.remotePayloadType === firstMediaCodec.payloadType);
};

function matchCapCodecs(aCodec, bCodec)
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

			const aProfileLevelId = (aCodec.parameters || {})['profile-level-id'];
			const bProfileLevelId = (bCodec.parameters || {})['profile-level-id'];

			if (!aProfileLevelId || aProfileLevelId !== bProfileLevelId)
				return false;

			break;
		}
	}

	return true;
}

function matchCapHeaderExtensions(aExt, bExt)
{
	if (aExt.kind && bExt.kind && aExt.kind !== bExt.kind)
		return false;

	if (aExt.uri !== bExt.uri)
		return false;

	return true;
}

function reduceRtcpFeedback(codecA, codecB)
{
	const reducedRtcpFeedback = [];

	for (const aFb of codecA.rtcpFeedback || [])
	{
		const matchingBFb = (codecB.rtcpFeedback || [])
			.find((bFb) => (
				bFb.type === aFb.type &&
				bFb.parameter === aFb.parameter
			));

		if (matchingBFb)
			reducedRtcpFeedback.push(matchingBFb);
	}

	return reducedRtcpFeedback;
}
