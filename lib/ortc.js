/**
 * mediasoup-client internally works with ORTC dictionaries. This module provides
 * utils for ORTC.
 */

/**
 * Reduce remote RTP capabilities based on remote ones.
 *
 * @param {RTCRtpCapabilities} remoteCaps - Remote capabilities.
 * @param {RTCRtpCapabilities} localCaps - Local capabilities.
 * @return {RTCRtpCapabilities} Reduced capabilities.
 */
export function reduceRemoteRtpCapabilities(remoteCaps, localCaps)
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

	// Match media codecs and keep the order preferred by the server.
	for (let remoteCodec of remoteCaps.codecs || [])
	{
		if (remoteCodec.name === 'rtx')
			continue;

		const matchingLocalCodec = (localCaps.codecs || [])
			.find((localCodec) =>
			{
				return (
					localCodec.mimeType === remoteCodec.mimeType &&
					localCodec.clockRate === remoteCodec.clockRate
				);
			});

		if (matchingLocalCodec)
		{
			newCaps.codecs.push(remoteCodec);
			localPtToRemoteCodec.set(matchingLocalCodec.preferredPayloadType, remoteCodec);
		}
	}

	// Match RTX codecs.
	for (let localCodec of localCaps.codecs || [])
	{
		if (localCodec.name !== 'rtx')
			continue;

		const apt = localCodec.parameters.apt;
		const associatedRemoteCodec = localPtToRemoteCodec.get(apt);

		if (!associatedRemoteCodec)
			continue;

		const matchingRemoteRtxCodec = (remoteCaps.codecs || [])
			.find((remoteCodec) =>
			{
				return (
					remoteCodec.name === 'rtx' &&
					remoteCodec.parameters.apt === associatedRemoteCodec.preferredPayloadType
				);
			});

		if (matchingRemoteRtxCodec)
			newCaps.codecs.push(matchingRemoteRtxCodec);
	}

	// Reduce header extensions.

	for (let remoteExt of remoteCaps.headerExtensions || [])
	{
		const matchingLocalExt = (localCaps.headerExtensions || [])
			.find((localExt) =>
			{
				return (
					localExt.kind === remoteExt.kind &&
					localExt.uri === remoteExt.uri
				);
			});

		if (matchingLocalExt)
			newCaps.headerExtensions.push(remoteExt);
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
