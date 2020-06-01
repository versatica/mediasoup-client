import * as h264 from 'h264-profile-level-id';
import {
	RtpCapabilities,
	MediaKind,
	RtpCodecCapability,
	RtpHeaderExtension,
	RtpParameters,
	RtpCodecParameters,
	RtcpFeedback,
	RtpEncodingParameters,
	RtpHeaderExtensionParameters,
	RtcpParameters
} from './RtpParameters';
import {
	SctpCapabilities,
	NumSctpStreams,
	SctpParameters,
	SctpStreamParameters
} from './SctpParameters';
import { clone } from './utils';

const RTP_PROBATOR_MID = 'probator';
const RTP_PROBATOR_SSRC = 1234;
const RTP_PROBATOR_CODEC_PAYLOAD_TYPE = 127;

/**
 * Validates RtpCapabilities. It may modify given data by adding missing
 * fields with default values.
 * It throws if invalid.
 */
export function validateRtpCapabilities(caps: RtpCapabilities): void
{
	if (typeof caps !== 'object')
		throw new TypeError('caps is not an object');

	// codecs is optional. If unset, fill with an empty array.
	if (caps.codecs && !Array.isArray(caps.codecs))
		throw new TypeError('caps.codecs is not an array');
	else if (!caps.codecs)
		caps.codecs = [];

	for (const codec of caps.codecs)
	{
		validateRtpCodecCapability(codec);
	}

	// headerExtensions is optional. If unset, fill with an empty array.
	if (caps.headerExtensions && !Array.isArray(caps.headerExtensions))
		throw new TypeError('caps.headerExtensions is not an array');
	else if (!caps.headerExtensions)
		caps.headerExtensions = [];

	for (const ext of caps.headerExtensions)
	{
		validateRtpHeaderExtension(ext);
	}
}

/**
 * Validates RtpCodecCapability. It may modify given data by adding missing
 * fields with default values.
 * It throws if invalid.
 */
export function validateRtpCodecCapability(codec: RtpCodecCapability): void
{
	const MimeTypeRegex = new RegExp('^(audio|video)/(.+)', 'i');

	if (typeof codec !== 'object')
		throw new TypeError('codec is not an object');

	// mimeType is mandatory.
	if (!codec.mimeType || typeof codec.mimeType !== 'string')
		throw new TypeError('missing codec.mimeType');

	const mimeTypeMatch = MimeTypeRegex.exec(codec.mimeType);

	if (!mimeTypeMatch)
		throw new TypeError('invalid codec.mimeType');

	// Just override kind with media component of mimeType.
	codec.kind = mimeTypeMatch[1].toLowerCase() as MediaKind;

	// preferredPayloadType is optional.
	if (codec.preferredPayloadType && typeof codec.preferredPayloadType !== 'number')
		throw new TypeError('invalid codec.preferredPayloadType');

	// clockRate is mandatory.
	if (typeof codec.clockRate !== 'number')
		throw new TypeError('missing codec.clockRate');

	// channels is optional. If unset, set it to 1 (just if audio).
	if (codec.kind === 'audio')
	{
		if (typeof codec.channels !== 'number')
			codec.channels = 1;
	}
	else
	{
		delete codec.channels;
	}

	// parameters is optional. If unset, set it to an empty object.
	if (!codec.parameters || typeof codec.parameters !== 'object')
		codec.parameters = {};

	for (const key of Object.keys(codec.parameters))
	{
		let value = codec.parameters[key];

		if (value === undefined)
		{
			codec.parameters[key] = '';
			value = '';
		}

		if (typeof value !== 'string' && typeof value !== 'number')
		{
			throw new TypeError(
				`invalid codec parameter [key:${key}s, value:${value}]`);
		}

		// Specific parameters validation.
		if (key === 'apt')
		{
			if (typeof value !== 'number')
				throw new TypeError('invalid codec apt parameter');
		}
	}

	// rtcpFeedback is optional. If unset, set it to an empty array.
	if (!codec.rtcpFeedback || !Array.isArray(codec.rtcpFeedback))
		codec.rtcpFeedback = [];

	for (const fb of codec.rtcpFeedback)
	{
		validateRtcpFeedback(fb);
	}
}

/**
 * Validates RtcpFeedback. It may modify given data by adding missing
 * fields with default values.
 * It throws if invalid.
 */
export function validateRtcpFeedback(fb: RtcpFeedback): void
{
	if (typeof fb !== 'object')
		throw new TypeError('fb is not an object');

	// type is mandatory.
	if (!fb.type || typeof fb.type !== 'string')
		throw new TypeError('missing fb.type');

	// parameter is optional. If unset set it to an empty string.
	if (!fb.parameter || typeof fb.parameter !== 'string')
		fb.parameter = '';
}

/**
 * Validates RtpHeaderExtension. It may modify given data by adding missing
 * fields with default values.
 * It throws if invalid.
 */
export function validateRtpHeaderExtension(ext: RtpHeaderExtension): void
{

	if (typeof ext !== 'object')
		throw new TypeError('ext is not an object');

	// kind is optional. If unset set it to an empty string.
	if (!ext.kind || typeof ext.kind !== 'string')
		ext.kind = '';

	if (ext.kind !== '' && ext.kind !== 'audio' && ext.kind !== 'video')
		throw new TypeError('invalid ext.kind');

	// uri is mandatory.
	if (!ext.uri || typeof ext.uri !== 'string')
		throw new TypeError('missing ext.uri');

	// preferredId is mandatory.
	if (typeof ext.preferredId !== 'number')
		throw new TypeError('missing ext.preferredId');

	// preferredEncrypt is optional. If unset set it to false.
	if (ext.preferredEncrypt && typeof ext.preferredEncrypt !== 'boolean')
		throw new TypeError('invalid ext.preferredEncrypt');
	else if (!ext.preferredEncrypt)
		ext.preferredEncrypt = false;

	// direction is optional. If unset set it to sendrecv.
	if (ext.direction && typeof ext.direction !== 'string')
		throw new TypeError('invalid ext.direction');
	else if (!ext.direction)
		ext.direction = 'sendrecv';
}

/**
 * Validates RtpParameters. It may modify given data by adding missing
 * fields with default values.
 * It throws if invalid.
 */
export function validateRtpParameters(params: RtpParameters): void
{
	if (typeof params !== 'object')
		throw new TypeError('params is not an object');

	// mid is optional.
	if (params.mid && typeof params.mid !== 'string')
		throw new TypeError('params.mid is not a string');

	// codecs is mandatory.
	if (!Array.isArray(params.codecs))
		throw new TypeError('missing params.codecs');

	for (const codec of params.codecs)
	{
		validateRtpCodecParameters(codec);
	}

	// headerExtensions is optional. If unset, fill with an empty array.
	if (params.headerExtensions && !Array.isArray(params.headerExtensions))
		throw new TypeError('params.headerExtensions is not an array');
	else if (!params.headerExtensions)
		params.headerExtensions = [];

	for (const ext of params.headerExtensions)
	{
		validateRtpHeaderExtensionParameters(ext);
	}

	// encodings is optional. If unset, fill with an empty array.
	if (params.encodings && !Array.isArray(params.encodings))
		throw new TypeError('params.encodings is not an array');
	else if (!params.encodings)
		params.encodings = [];

	for (const encoding of params.encodings)
	{
		validateRtpEncodingParameters(encoding);
	}

	// rtcp is optional. If unset, fill with an empty object.
	if (params.rtcp && typeof params.rtcp !== 'object')
		throw new TypeError('params.rtcp is not an object');
	else if (!params.rtcp)
		params.rtcp = {};

	validateRtcpParameters(params.rtcp);
}

/**
 * Validates RtpCodecParameters. It may modify given data by adding missing
 * fields with default values.
 * It throws if invalid.
 */
export function validateRtpCodecParameters(codec: RtpCodecParameters): void
{
	const MimeTypeRegex = new RegExp('^(audio|video)/(.+)', 'i');

	if (typeof codec !== 'object')
		throw new TypeError('codec is not an object');

	// mimeType is mandatory.
	if (!codec.mimeType || typeof codec.mimeType !== 'string')
		throw new TypeError('missing codec.mimeType');

	const mimeTypeMatch = MimeTypeRegex.exec(codec.mimeType);

	if (!mimeTypeMatch)
		throw new TypeError('invalid codec.mimeType');

	// payloadType is mandatory.
	if (typeof codec.payloadType !== 'number')
		throw new TypeError('missing codec.payloadType');

	// clockRate is mandatory.
	if (typeof codec.clockRate !== 'number')
		throw new TypeError('missing codec.clockRate');

	const kind = mimeTypeMatch[1].toLowerCase() as MediaKind;

	// channels is optional. If unset, set it to 1 (just if audio).
	if (kind === 'audio')
	{
		if (typeof codec.channels !== 'number')
			codec.channels = 1;
	}
	else
	{
		delete codec.channels;
	}

	// parameters is optional. If unset, set it to an empty object.
	if (!codec.parameters || typeof codec.parameters !== 'object')
		codec.parameters = {};

	for (const key of Object.keys(codec.parameters))
	{
		let value = codec.parameters[key];

		if (value === undefined)
		{
			codec.parameters[key] = '';
			value = '';
		}

		if (typeof value !== 'string' && typeof value !== 'number')
		{
			throw new TypeError(
				`invalid codec parameter [key:${key}s, value:${value}]`);
		}

		// Specific parameters validation.
		if (key === 'apt')
		{
			if (typeof value !== 'number')
				throw new TypeError('invalid codec apt parameter');
		}
	}

	// rtcpFeedback is optional. If unset, set it to an empty array.
	if (!codec.rtcpFeedback || !Array.isArray(codec.rtcpFeedback))
		codec.rtcpFeedback = [];

	for (const fb of codec.rtcpFeedback)
	{
		validateRtcpFeedback(fb);
	}
}

/**
 * Validates RtpHeaderExtensionParameteters. It may modify given data by adding missing
 * fields with default values.
 * It throws if invalid.
 */
export function validateRtpHeaderExtensionParameters(
	ext: RtpHeaderExtensionParameters
): void
{

	if (typeof ext !== 'object')
		throw new TypeError('ext is not an object');

	// uri is mandatory.
	if (!ext.uri || typeof ext.uri !== 'string')
		throw new TypeError('missing ext.uri');

	// id is mandatory.
	if (typeof ext.id !== 'number')
		throw new TypeError('missing ext.id');

	// encrypt is optional. If unset set it to false.
	if (ext.encrypt && typeof ext.encrypt !== 'boolean')
		throw new TypeError('invalid ext.encrypt');
	else if (!ext.encrypt)
		ext.encrypt = false;

	// parameters is optional. If unset, set it to an empty object.
	if (!ext.parameters || typeof ext.parameters !== 'object')
		ext.parameters = {};

	for (const key of Object.keys(ext.parameters))
	{
		let value = ext.parameters[key];

		if (value === undefined)
		{
			ext.parameters[key] = '';
			value = '';
		}

		if (typeof value !== 'string' && typeof value !== 'number')
			throw new TypeError('invalid header extension parameter');
	}
}

/**
 * Validates RtpEncodingParameters. It may modify given data by adding missing
 * fields with default values.
 * It throws if invalid.
 */
export function validateRtpEncodingParameters(encoding: RtpEncodingParameters): void
{
	if (typeof encoding !== 'object')
		throw new TypeError('encoding is not an object');

	// ssrc is optional.
	if (encoding.ssrc && typeof encoding.ssrc !== 'number')
		throw new TypeError('invalid encoding.ssrc');

	// rid is optional.
	if (encoding.rid && typeof encoding.rid !== 'string')
		throw new TypeError('invalid encoding.rid');

	// rtx is optional.
	if (encoding.rtx && typeof encoding.rtx !== 'object')
	{
		throw new TypeError('invalid encoding.rtx');
	}
	else if (encoding.rtx)
	{
		// RTX ssrc is mandatory if rtx is present.
		if (typeof encoding.rtx.ssrc !== 'number')
			throw new TypeError('missing encoding.rtx.ssrc');
	}

	// dtx is optional. If unset set it to false.
	if (!encoding.dtx || typeof encoding.dtx !== 'boolean')
		encoding.dtx = false;

	// scalabilityMode is optional.
	if (encoding.scalabilityMode && typeof encoding.scalabilityMode !== 'string')
		throw new TypeError('invalid encoding.scalabilityMode');
}

/**
 * Validates RtcpParameters. It may modify given data by adding missing
 * fields with default values.
 * It throws if invalid.
 */
export function validateRtcpParameters(rtcp: RtcpParameters): void
{
	if (typeof rtcp !== 'object')
		throw new TypeError('rtcp is not an object');

	// cname is optional.
	if (rtcp.cname && typeof rtcp.cname !== 'string')
		throw new TypeError('invalid rtcp.cname');

	// reducedSize is optional. If unset set it to true.
	if (!rtcp.reducedSize || typeof rtcp.reducedSize !== 'boolean')
		rtcp.reducedSize = true;
}

/**
 * Validates SctpCapabilities. It may modify given data by adding missing
 * fields with default values.
 * It throws if invalid.
 */
export function validateSctpCapabilities(caps: SctpCapabilities): void
{
	if (typeof caps !== 'object')
		throw new TypeError('caps is not an object');

	// numStreams is mandatory.
	if (!caps.numStreams || typeof caps.numStreams !== 'object')
		throw new TypeError('missing caps.numStreams');

	validateNumSctpStreams(caps.numStreams);
}

/**
 * Validates NumSctpStreams. It may modify given data by adding missing
 * fields with default values.
 * It throws if invalid.
 */
export function validateNumSctpStreams(numStreams: NumSctpStreams): void
{
	if (typeof numStreams !== 'object')
		throw new TypeError('numStreams is not an object');

	// OS is mandatory.
	if (typeof numStreams.OS !== 'number')
		throw new TypeError('missing numStreams.OS');

	// MIS is mandatory.
	if (typeof numStreams.MIS !== 'number')
		throw new TypeError('missing numStreams.MIS');
}

/**
 * Validates SctpParameters. It may modify given data by adding missing
 * fields with default values.
 * It throws if invalid.
 */
export function validateSctpParameters(params: SctpParameters): void
{
	if (typeof params !== 'object')
		throw new TypeError('params is not an object');

	// port is mandatory.
	if (typeof params.port !== 'number')
		throw new TypeError('missing params.port');

	// OS is mandatory.
	if (typeof params.OS !== 'number')
		throw new TypeError('missing params.OS');

	// MIS is mandatory.
	if (typeof params.MIS !== 'number')
		throw new TypeError('missing params.MIS');

	// maxMessageSize is mandatory.
	if (typeof params.maxMessageSize !== 'number')
		throw new TypeError('missing params.maxMessageSize');
}

/**
 * Validates SctpStreamParameters. It may modify given data by adding missing
 * fields with default values.
 * It throws if invalid.
 */
export function validateSctpStreamParameters(params: SctpStreamParameters): void
{
	if (typeof params !== 'object')
		throw new TypeError('params is not an object');

	// streamId is mandatory.
	if (typeof params.streamId !== 'number')
		throw new TypeError('missing params.streamId');

	// ordered is optional.
	let orderedGiven = false;

	if (typeof params.ordered === 'boolean')
		orderedGiven = true;
	else
		params.ordered = true;

	// maxPacketLifeTime is optional.
	if (params.maxPacketLifeTime && typeof params.maxPacketLifeTime !== 'number')
		throw new TypeError('invalid params.maxPacketLifeTime');

	// maxRetransmits is optional.
	if (params.maxRetransmits && typeof params.maxRetransmits !== 'number')
		throw new TypeError('invalid params.maxRetransmits');

	if (params.maxPacketLifeTime && params.maxRetransmits)
		throw new TypeError('cannot provide both maxPacketLifeTime and maxRetransmits');

	if (
		orderedGiven &&
		params.ordered &&
		(params.maxPacketLifeTime || params.maxRetransmits)
	)
	{
		throw new TypeError('cannot be ordered with maxPacketLifeTime or maxRetransmits');
	}
	else if (!orderedGiven && (params.maxPacketLifeTime || params.maxRetransmits))
	{
		params.ordered = false;
	}

	// priority is optional.
	if (params.priority && typeof params.priority !== 'string')
		throw new TypeError('invalid params.priority');

	// label is optional.
	if (params.label && typeof params.label !== 'string')
		throw new TypeError('invalid params.label');

	// protocol is optional.
	if (params.protocol && typeof params.protocol !== 'string')
		throw new TypeError('invalid params.protocol');
}

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
		headerExtensions : []
	};

	// Match media codecs and keep the order preferred by remoteCaps.
	for (const remoteCodec of remoteCaps.codecs || [])
	{
		if (isRtxCodec(remoteCodec))
			continue;

		const matchingLocalCodec = (localCaps.codecs || [])
			.find((localCodec: RtpCodecCapability) => (
				matchCodecs(localCodec, remoteCodec, { strict: true, modify: true }))
			);

		if (!matchingLocalCodec)
			continue;

		const extendedCodec: any =
		{
			mimeType             : matchingLocalCodec.mimeType,
			kind                 : matchingLocalCodec.kind,
			clockRate            : matchingLocalCodec.clockRate,
			channels             : matchingLocalCodec.channels,
			localPayloadType     : matchingLocalCodec.preferredPayloadType,
			localRtxPayloadType  : undefined,
			remotePayloadType    : remoteCodec.preferredPayloadType,
			remoteRtxPayloadType : undefined,
			localParameters      : matchingLocalCodec.parameters,
			remoteParameters     : remoteCodec.parameters,
			rtcpFeedback         : reduceRtcpFeedback(matchingLocalCodec, remoteCodec)
		};

		extendedRtpCapabilities.codecs.push(extendedCodec);
	}

	// Match RTX codecs.
	for (const extendedCodec of extendedRtpCapabilities.codecs)
	{
		const matchingLocalRtxCodec = localCaps.codecs!
			.find((localCodec: RtpCodecCapability) => (
				isRtxCodec(localCodec) &&
				localCodec.parameters.apt === extendedCodec.localPayloadType
			));

		const matchingRemoteRtxCodec = remoteCaps.codecs!
			.find((remoteCodec: RtpCodecCapability) => (
				isRtxCodec(remoteCodec) &&
				remoteCodec.parameters.apt === extendedCodec.remotePayloadType
			));

		if (matchingLocalRtxCodec && matchingRemoteRtxCodec)
		{
			extendedCodec.localRtxPayloadType = matchingLocalRtxCodec.preferredPayloadType;
			extendedCodec.remoteRtxPayloadType = matchingRemoteRtxCodec.preferredPayloadType;
		}
	}

	// Match header extensions.
	for (const remoteExt of remoteCaps.headerExtensions!)
	{
		const matchingLocalExt = localCaps.headerExtensions!
			.find((localExt: RtpHeaderExtension) => (
				matchHeaderExtensions(localExt, remoteExt)
			));

		if (!matchingLocalExt)
			continue;

		const extendedExt =
		{
			kind      : remoteExt.kind,
			uri       : remoteExt.uri,
			sendId    : matchingLocalExt.preferredId,
			recvId    : remoteExt.preferredId,
			encrypt   : matchingLocalExt.preferredEncrypt,
			direction : 'sendrecv'
		};

		switch (remoteExt.direction)
		{
			case 'sendrecv':
				extendedExt.direction = 'sendrecv';
				break;
			case 'recvonly':
				extendedExt.direction = 'sendonly';
				break;
			case 'sendonly':
				extendedExt.direction = 'recvonly';
				break;
			case 'inactive':
				extendedExt.direction = 'inactive';
				break;
		}

		extendedRtpCapabilities.headerExtensions.push(extendedExt);
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
		headerExtensions : []
	};

	for (const extendedCodec of extendedRtpCapabilities.codecs)
	{
		const codec =
		{
			mimeType             : extendedCodec.mimeType,
			kind                 : extendedCodec.kind,
			preferredPayloadType : extendedCodec.remotePayloadType,
			clockRate            : extendedCodec.clockRate,
			channels             : extendedCodec.channels,
			parameters           : extendedCodec.localParameters,
			rtcpFeedback         : extendedCodec.rtcpFeedback
		};

		rtpCapabilities.codecs!.push(codec);

		// Add RTX codec.
		if (!extendedCodec.remoteRtxPayloadType)
			continue;

		const rtxCodec: RtpCodecCapability =
		{
			mimeType             : `${extendedCodec.kind}/rtx`,
			kind                 : extendedCodec.kind,
			preferredPayloadType : extendedCodec.remoteRtxPayloadType,
			clockRate            : extendedCodec.clockRate,
			parameters           :
			{
				apt : extendedCodec.remotePayloadType
			},
			rtcpFeedback : []
		};

		rtpCapabilities.codecs!.push(rtxCodec);

		// TODO: In the future, we need to add FEC, CN, etc, codecs.
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

		const ext: RtpHeaderExtension =
		{
			kind             : extendedExtension.kind,
			uri              : extendedExtension.uri,
			preferredId      : extendedExtension.recvId,
			preferredEncrypt : extendedExtension.encrypt,
			direction        : extendedExtension.direction
		};

		rtpCapabilities.headerExtensions!.push(ext);
	}

	return rtpCapabilities;
}

/**
 * Generate RTP parameters of the given kind for sending media.
 * NOTE: mid, encodings and rtcp fields are left empty.
 */
export function getSendingRtpParameters(
	kind: MediaKind,
	extendedRtpCapabilities: any
): RtpParameters
{
	const rtpParameters: RtpParameters =
	{
		mid              : undefined,
		codecs           : [],
		headerExtensions : [],
		encodings        : [],
		rtcp             : {}
	};

	for (const extendedCodec of extendedRtpCapabilities.codecs)
	{
		if (extendedCodec.kind !== kind)
			continue;

		const codec: RtpCodecParameters =
		{
			mimeType     : extendedCodec.mimeType,
			payloadType  : extendedCodec.localPayloadType,
			clockRate    : extendedCodec.clockRate,
			channels     : extendedCodec.channels,
			parameters   : extendedCodec.localParameters,
			rtcpFeedback : extendedCodec.rtcpFeedback
		};

		rtpParameters.codecs.push(codec);

		// Add RTX codec.
		if (extendedCodec.localRtxPayloadType)
		{
			const rtxCodec: RtpCodecParameters =
			{
				mimeType    : `${extendedCodec.kind}/rtx`,
				payloadType : extendedCodec.localRtxPayloadType,
				clockRate   : extendedCodec.clockRate,
				parameters  :
				{
					apt : extendedCodec.localPayloadType
				},
				rtcpFeedback : []
			};

			rtpParameters.codecs.push(rtxCodec);
		}
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

		const ext: RtpHeaderExtensionParameters =
		{
			uri        : extendedExtension.uri,
			id         : extendedExtension.sendId,
			encrypt    : extendedExtension.encrypt,
			parameters : {}
		};

		rtpParameters.headerExtensions!.push(ext);
	}

	return rtpParameters;
}

/**
 * Generate RTP parameters of the given kind suitable for the remote SDP answer.
 */
export function getSendingRemoteRtpParameters(
	kind: MediaKind,
	extendedRtpCapabilities: any
): RtpParameters
{
	const rtpParameters: RtpParameters =
	{
		mid              : undefined,
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
			payloadType  : extendedCodec.localPayloadType,
			clockRate    : extendedCodec.clockRate,
			channels     : extendedCodec.channels,
			parameters   : extendedCodec.remoteParameters,
			rtcpFeedback : extendedCodec.rtcpFeedback
		};

		rtpParameters.codecs.push(codec);

		// Add RTX codec.
		if (extendedCodec.localRtxPayloadType)
		{
			const rtxCodec: RtpCodecParameters =
			{
				mimeType    : `${extendedCodec.kind}/rtx`,
				payloadType : extendedCodec.localRtxPayloadType,
				clockRate   : extendedCodec.clockRate,
				parameters  :
				{
					apt : extendedCodec.localPayloadType
				},
				rtcpFeedback : []
			};

			rtpParameters.codecs.push(rtxCodec);
		}
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

		const ext: RtpHeaderExtensionParameters =
		{
			uri        : extendedExtension.uri,
			id         : extendedExtension.sendId,
			encrypt    : extendedExtension.encrypt,
			parameters : {}

		};

		rtpParameters.headerExtensions!.push(ext);
	}

	// Reduce codecs' RTCP feedback. Use Transport-CC if available, REMB otherwise.
	if (
		rtpParameters.headerExtensions!.some((ext) => (
			ext.uri === 'http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01'
		))
	)
	{
		for (const codec of rtpParameters.codecs)
		{
			codec.rtcpFeedback = (codec.rtcpFeedback || [])
				.filter((fb: RtcpFeedback) => fb.type !== 'goog-remb');
		}
	}
	else if (
		rtpParameters.headerExtensions!.some((ext) => (
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
				.filter((fb: RtcpFeedback) => (
					fb.type !== 'transport-cc' &&
					fb.type !== 'goog-remb'
				));
		}
	}

	return rtpParameters;
}

/**
 * Reduce given codecs by returning an array of codecs "compatible" with the
 * given capability codec. If no capability codec is given, take the first
 * one(s).
 *
 * Given codecs must be generated by ortc.getSendingRtpParameters() or
 * ortc.getSendingRemoteRtpParameters().
 *
 * The returned array of codecs also include a RTX codec if available.
 */
export function reduceCodecs(
	codecs: RtpCodecParameters[],
	capCodec?: RtpCodecCapability
): RtpCodecParameters[]
{
	const filteredCodecs: RtpCodecParameters[] = [];

	// If no capability codec is given, take the first one (and RTX).
	if (!capCodec)
	{
		filteredCodecs.push(codecs[0]);

		if (isRtxCodec(codecs[1]))
			filteredCodecs.push(codecs[1]);
	}
	// Otherwise look for a compatible set of codecs.
	else
	{
		for (let idx = 0; idx < codecs.length; ++idx)
		{
			if (matchCodecs(codecs[idx], capCodec))
			{
				filteredCodecs.push(codecs[idx]);

				if (isRtxCodec(codecs[idx + 1]))
					filteredCodecs.push(codecs[idx + 1]);

				break;
			}
		}

		if (filteredCodecs.length === 0)
			throw new TypeError('no matching codec found');
	}

	return filteredCodecs;
}

/**
 * Create RTP parameters for a Consumer for the RTP probator.
 */
export function generateProbatorRtpParameters(
	videoRtpParameters: RtpParameters
): RtpParameters
{
	// Clone given reference video RTP parameters.
	videoRtpParameters = clone(videoRtpParameters) as RtpParameters;

	// This may throw.
	validateRtpParameters(videoRtpParameters);

	const rtpParameters: RtpParameters =
	{
		mid              : RTP_PROBATOR_MID,
		codecs           : [],
		headerExtensions : [],
		encodings        : [ { ssrc: RTP_PROBATOR_SSRC } ],
		rtcp             : { cname: 'probator' }
	};

	rtpParameters.codecs.push(videoRtpParameters.codecs[0]);
	rtpParameters.codecs[0].payloadType = RTP_PROBATOR_CODEC_PAYLOAD_TYPE;
	rtpParameters.headerExtensions = videoRtpParameters.headerExtensions;

	return rtpParameters;
}

/**
 * Whether media can be sent based on the given RTP capabilities.
 */
export function canSend(kind: MediaKind, extendedRtpCapabilities: any): boolean
{
	return extendedRtpCapabilities.codecs.
		some((codec: any) => codec.kind === kind);
}

/**
 * Whether the given RTP parameters can be received with the given RTP
 * capabilities.
 */
export function canReceive(
	rtpParameters: RtpParameters,
	extendedRtpCapabilities: any
): boolean
{
	// This may throw.
	validateRtpParameters(rtpParameters);

	if (rtpParameters.codecs.length === 0)
		return false;

	const firstMediaCodec = rtpParameters.codecs[0];

	return extendedRtpCapabilities.codecs
		.some((codec: any) => codec.remotePayloadType === firstMediaCodec.payloadType);
}

function isRtxCodec(codec?: RtpCodecCapability | RtpCodecParameters): boolean
{
	if (!codec)
		return false;

	return /.+\/rtx$/i.test(codec.mimeType);
}

function matchCodecs(
	aCodec: RtpCodecCapability | RtpCodecParameters,
	bCodec: RtpCodecCapability | RtpCodecParameters,
	{ strict = false, modify = false } = {}
): boolean
{
	const aMimeType = aCodec.mimeType.toLowerCase();
	const bMimeType = bCodec.mimeType.toLowerCase();

	if (aMimeType !== bMimeType)
		return false;

	if (aCodec.clockRate !== bCodec.clockRate)
		return false;

	if (aCodec.channels !== bCodec.channels)
		return false;

	// Per codec special checks.
	switch (aMimeType)
	{
		case 'video/h264':
		{
			const aPacketizationMode = aCodec.parameters['packetization-mode'] || 0;
			const bPacketizationMode = bCodec.parameters['packetization-mode'] || 0;

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
				const aProfileId = aCodec.parameters['profile-id'] || 0;
				const bProfileId = bCodec.parameters['profile-id'] || 0;

				if (aProfileId !== bProfileId)
					return false;
			}

			break;
		}
	}

	return true;
}

function matchHeaderExtensions(
	aExt: RtpHeaderExtension,
	bExt: RtpHeaderExtension
): boolean
{
	if (aExt.kind && bExt.kind && aExt.kind !== bExt.kind)
		return false;

	if (aExt.uri !== bExt.uri)
		return false;

	return true;
}

function reduceRtcpFeedback(
	codecA: RtpCodecCapability | RtpCodecParameters,
	codecB: RtpCodecCapability | RtpCodecParameters
): RtcpFeedback[]
{
	const reducedRtcpFeedback: RtcpFeedback[] = [];

	for (const aFb of codecA.rtcpFeedback || [])
	{
		const matchingBFb = (codecB.rtcpFeedback || [])
			.find((bFb: RtcpFeedback) => (
				bFb.type === aFb.type &&
				(bFb.parameter === aFb.parameter || (!bFb.parameter && !aFb.parameter))
			));

		if (matchingBFb)
			reducedRtcpFeedback.push(matchingBFb);
	}

	return reducedRtcpFeedback;
}
