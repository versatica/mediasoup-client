/**
 * mediasoup-client internally works with ORTC dictionaries. This module provides
 * utils for ORTC.
 */

/**
 * Reduce RTP capabilities based on other capabilities.
 *
 * @param {RTCRtpCapabilities} aCaps - Capabilities to be reduced.
 * @param {RTCRtpCapabilities} bCaps - Capabilities to reduce with.
 * @return {RTCRtpCapabilities} Reduced capabilities.
 */
export function reduceRtpCapabilities(aCaps, bCaps)
{
	const newCaps =
	{
		codecs           : [],
		headerExtensions : []
	};

	// Reduce codecs.

	// Map
	// - key {Number}: PT of codec in aCaps.
	// - value {RTCRtpCodecCapability}: Associated codec in bCaps.
	const aPtToBCodec = new Map();

	// Match media codecs and keep the order preferred by aCaps.
	for (let aCodec of aCaps.codecs || [])
	{
		// TODO: Ignore pseudo-codecs and feature codecs.
		if (aCodec.name === 'rtx')
			continue;

		const matchingBCodec = (bCaps.codecs || [])
			.find((bCodec) => matchCodecs(bCodec, aCodec));

		if (matchingBCodec)
		{
			// Reduce RTCP feedbacks.
			reduceRtcpFbInCodec(aCodec, matchingBCodec);

			newCaps.codecs.push(aCodec);
			aPtToBCodec.set(aCodec.preferredPayloadType, matchingBCodec);
		}
	}

	// Match RTX codecs.
	for (let aCodec of aCaps.codecs || [])
	{
		if (aCodec.name !== 'rtx')
			continue;

		const apt = aCodec.parameters.apt;
		const associatedBCodec = aPtToBCodec.get(apt);

		if (!associatedBCodec)
			continue;

		const matchingBRtxCodec = (bCaps.codecs || [])
			.find((bCodec) =>
			{
				return (
					bCodec.name === 'rtx' &&
					bCodec.parameters.apt === associatedBCodec.preferredPayloadType
				);
			});

		if (matchingBRtxCodec)
		{
			// Reduce RTCP feedbacks.
			reduceRtcpFbInCodec(aCodec, matchingBRtxCodec);

			newCaps.codecs.push(aCodec);
		}
	}

	// Reduce header extensions.

	for (let aExt of aCaps.headerExtensions || [])
	{
		const matchingBExt = (bCaps.headerExtensions || [])
			.find((bExt) => matchHeaderExtensions(bExt, aExt));

		if (matchingBExt)
			newCaps.headerExtensions.push(aExt);
	}

	return newCaps;
}

/**
 * Get effective RTP parameters (without encoding) based on given RTP
 * capabilities.
 *
 * @param {RTCRtpParameters} params - RTP parameters.
 * @param {RTCRtpCapabilities} caps - RTP capabilities.
 * @return {RTCRtpParameters}
 */
export function getEffectiveRtpParameters(params, caps)
{
	const newParams =
	{
		codecs           : [],
		headerExtensions : [],
		encodings        : params.encodings,
		rtcp             : params.rtcp
	};

	// Get effective codecs.

	// Chosen params codec and its associated caps codec.
	let chosenParamCodec;
	let chosenCapCodec;

	// Iterate capability codecs and match the first one in sending parameters.
	for (let capCodec of caps.codecs || [])
	{
		// Ignore also pseudo-codecs and feature codecs.
		if (capCodec.name === 'rtx')
			continue;

		const matchingParamCodec = (params.codecs || [])
			.find((paramCodec) => matchCodecs(paramCodec, capCodec));

		if (matchingParamCodec)
		{
			chosenParamCodec = matchingParamCodec;
			chosenCapCodec = capCodec;

			// Exit the loop since we just want the effective media codec.
			break;
		}
	}

	if (chosenParamCodec)
	{
		// Reduce RTCP feedbacks.
		reduceRtcpFbInCodec(chosenParamCodec, chosenCapCodec);

		newParams.codecs.push(chosenParamCodec);

		// Add RTX codec.

		const matchingCapRtxCodec = (caps.codecs || [])
			.find((capCodec) =>
			{
				return (
					capCodec.name === 'rtx' &&
					capCodec.parameters.apt === chosenCapCodec.preferredPayloadType
				);
			});

		if (matchingCapRtxCodec)
		{
			const matchingParamRtxCodec = (params.codecs || [])
				.find((paramCodec) =>
				{
					return (
						paramCodec.name === 'rtx' &&
						paramCodec.parameters.apt === chosenParamCodec.payloadType
					);
				});

			if (matchingParamRtxCodec)
			{
				// Reduce RTCP feedbacks.
				reduceRtcpFbInCodec(matchingParamRtxCodec, matchingCapRtxCodec);

				newParams.codecs.push(matchingParamRtxCodec);
			}
		}
	}

	// Get effective header extensions.

	// Reduce header extensions.

	for (let paramExt of params.headerExtensions || [])
	{
		const matchingCapExt = (caps.headerExtensions || [])
			.find((capExt) => matchHeaderExtensions(capExt, paramExt));

		if (matchingCapExt)
			newParams.headerExtensions.push(paramExt);
	}

	return newParams;
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
	// NOTE: RTCRtpHeaderExtensionParameters (in RTCRtpParameters) does not have
	// kind, so don't check it if not present.
	if (aExt.kind && bExt.kind)
	{
		return (
			aExt.kind === bExt.kind &&
			aExt.uri === bExt.uri
		);
	}
	else
	{
		return (
			aExt.uri === bExt.uri
		);
	}
}

function reduceRtcpFbInCodec(aCodec, bCodec)
{
	const newRtcpFeedback = [];

	for (let aFb of (aCodec.rtcpFeedback || []))
	{
		const matchingBFb = (bCodec.rtcpFeedback || [])
			.find((bFb) =>
			{
				return (
					bFb.type === aFb.type &&
					bFb.parameter === aFb.parameter
				);
			});

		if (matchingBFb)
			newRtcpFeedback.push(matchingBFb);
	}

	// Assign the resuting RTCP feedback to the given codec.
	aCodec.rtcpFeedback = newRtcpFeedback;
}
