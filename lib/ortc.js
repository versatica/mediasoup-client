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
	// Reduced RTP capabilities.
	const newCaps =
	{
		codecs           : [],
		headerExtensions : []
	};

	// Reduce codecs.

	// Map
	// - key {Number}: PT of codec in bCaps.
	// - value {RTCRtpCodecCapability}: Associated codec in aCaps.
	const bPtToACodec = new Map();

	// Match media codecs and keep the order preferred by aCaps.
	for (let aCodec of aCaps.codecs || [])
	{
		if (aCodec.name === 'rtx')
			continue;

		const matchingBCodec = (bCaps.codecs || [])
			.find((bCodec) =>
			{
				return (
					bCodec.mimeType === aCodec.mimeType &&
					bCodec.clockRate === aCodec.clockRate
				);
			});

		if (matchingBCodec)
		{
			newCaps.codecs.push(aCodec);
			bPtToACodec.set(matchingBCodec.preferredPayloadType, aCodec);
		}
	}

	// Match RTX codecs.
	for (let bCodec of bCaps.codecs || [])
	{
		if (bCodec.name !== 'rtx')
			continue;

		const apt = bCodec.parameters.apt;
		const associatedACodec = bPtToACodec.get(apt);

		if (!associatedACodec)
			continue;

		const matchingARtxCodec = (aCaps.codecs || [])
			.find((aCodec) =>
			{
				return (
					aCodec.name === 'rtx' &&
					aCodec.parameters.apt === associatedACodec.preferredPayloadType
				);
			});

		if (matchingARtxCodec)
			newCaps.codecs.push(matchingARtxCodec);
	}

	// Reduce header extensions.

	for (let aExt of aCaps.headerExtensions || [])
	{
		const matchingBExt = (bCaps.headerExtensions || [])
			.find((bExt) =>
			{
				return (
					bExt.kind === aExt.kind &&
					bExt.uri === aExt.uri
				);
			});

		if (matchingBExt)
			newCaps.headerExtensions.push(aExt);
	}

	return newCaps;
}
