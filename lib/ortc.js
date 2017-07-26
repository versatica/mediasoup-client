/**
 * mediasoup-client internally works with ORTC dictionaries. This module provides
 * utils for ORTC.
 */

/**
 * Reduce local RTP capabilities based on remote ones.
 *
 * @param {RTCRtpCapabilities} localCaps - Local capabilities.
 * @param {RTCRtpCapabilities} remoteCaps - Remote capabilities.
 * @return {RTCRtpCapabilities} Reduced capabilities.
 */
export function reduceLocalRtpCapabilities(localCaps, remoteCaps)
{
	// Reduced RTP capabilities.
	const newCaps =
	{
		codecs           : [],
		headerExtensions : []
	};

	// Reduce codecs.

	// Map
	// - key {Number}: PT of codec in localCaps.
	// - value {RTCRtpCodecCapability}: Associated codec in remoteCaps.
	const localPtToRemoteCodec = new Map();

	// Match media codecs.
	for (let localCodec of localCaps.codecs || [])
	{
		if (localCodec.name === 'rtx')
			continue;

		const matchingCodec = (remoteCaps.codecs || [])
			.find((remoteCodec) =>
			{
				return (
					remoteCodec.mimeType === localCodec.mimeType &&
					remoteCodec.clockRate === remoteCodec.clockRate
				);
			});

		if (matchingCodec)
		{
			newCaps.codecs.push(matchingCodec);
			localPtToRemoteCodec.set(localCodec.preferredPayloadType, matchingCodec);
		}
	}

	// Match RTX codecs.
	for (let localCodec of localCaps.codecs || [])
	{
		if (localCodec.name !== 'rtx')
			continue;

		const apt = localCodec.parameters.apt;
		const associatedMatchingCodec = localPtToRemoteCodec.get(apt);

		if (!associatedMatchingCodec)
			continue;

		const matchingRtxCodec = (remoteCaps.codecs || [])
			.find((remoteCodec) =>
			{
				return (
					remoteCodec.name === 'rtx' &&
					remoteCodec.parameters.apt === associatedMatchingCodec.preferredPayloadType
				);
			});

		if (matchingRtxCodec)
			newCaps.codecs.push(matchingRtxCodec);
	}

	// Reduce header extensions.
	for (let localExt of localCaps.headerExtensions || [])
	{
		const matchingExt = (remoteCaps.headerExtensions || [])
			.find((remoteExt) =>
			{
				return (
					remoteExt.kind === localExt.kind &&
					remoteExt.uri === localExt.uri
				);
			});

		if (matchingExt)
			newCaps.headerExtensions.push(matchingExt);
	}

	return newCaps;
}

/**
 * Update local DTLS parameters absed on remote ones.
 *
 * @param {RTCDtlsParameters} localParams - Local parameters.
 * @param {RTCDtlsParameters} remoteParams - Remote parameters.
 * @return {RTCDtlsParameters} Updated parameters.
 */
export function updateLocalDtlsParameters(localParams, remoteParams)
{
	// Updated DTLS parameters.
	const newParams =
	{
		fingerprints : [],
		role         : null
	};

	// Use the first local fingerprint.
	newParams.fingerprints.push(localParams.fingerprints[0]);

	// Set the local role based on remote one.
	switch (remoteParams.role)
	{
		case 'client':
			newParams.role = 'server';
			break;
		case 'server':
			newParams.role = 'client';
			break;
		default:
			throw new Error(`invalid remote DTLS role "${remoteParams.role}"`);
	}

	return newParams;
}
