/**
 * Reduce capabilities with others.
 *
 * @param {RTCRtpCapabilities} capsA - Capabilities to being reduced.
 * @param {RTCRtpCapabilities} capsB - Capabilities to reduce with.
 * @return {RTCRtpCapabilities} Reduced capabilities.
 */
export function reduceRtpCapabilities(capsA, capsB)
{
	const caps =
	{
		codecs : []
	};

	// Reduce codecs.

	// Map
	// - key {Number}: PT of codec in capsA.
	// - value {RTCRtpCodecCapability}: Associated codec in capsB.
	const ptAtoCodecB = new Map();

	// Match media codecs.
	for (let codecA of capsA.codecs || [])
	{
		if (codecA.name === 'rtx')
			continue;

		const matchingCodec = capsB.codecs
			.find((codecB) =>
			{
				return (
					codecB.mimeType === codecA.mimeType &&
					codecB.clockRate === codecB.clockRate
				);
			});

		if (matchingCodec)
		{
			caps.codecs.push(matchingCodec);
			ptAtoCodecB.set(codecA.preferredPayloadType, matchingCodec);
		}
	}

	// Match RTX codecs.
	for (let codecA of capsA.codecs || [])
	{
		if (codecA.name !== 'rtx')
			continue;

		const apt = codecA.parameters.apt;
		const associatedMatchingCodec = ptAtoCodecB.get(apt);

		if (!associatedMatchingCodec)
			continue;

		const matchingRtxCodec = capsB.codecs
			.find((codecB) =>
			{
				return (
					codecB.name === 'rtx' &&
					codecB.parameters.apt === associatedMatchingCodec.preferredPayloadType
				);
			});

		if (matchingRtxCodec)
			caps.codecs.push(matchingRtxCodec);
	}

	// TODO: Header extensions and FEC mechanisms.

	return caps;
}
