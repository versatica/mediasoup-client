const MediaStreamTrack = require('node-mediastreamtrack');
const Logger = require('../lib/Logger');
const EnhancedEventEmitter = require('../lib/EnhancedEventEmitter');
const { DuplicatedError } = require('../lib/errors');
const utils = require('../lib/utils');
const ortc = require('../lib/ortc');
const fakeParameters = require('./fakeParameters');

const logger = new Logger('FakeHandler');
const nativeRtpCapabilities = fakeParameters.generateNativeRtpCapabilities();
const localDtlsParameters = fakeParameters.generateLocalDtlsParameters();

class FakeHandler extends EnhancedEventEmitter
{
	static async getNativeRtpCapabilities()
	{
		logger.debug('getNativeRtpCapabilities()');

		return nativeRtpCapabilities;
	}

	constructor(
		{
			transportRemoteParameters, // eslint-disable-line no-unused-vars
			direction,
			turnServers, // eslint-disable-line no-unused-vars
			iceTransportPolicy, // eslint-disable-line no-unused-vars
			proprietaryConstraints, // eslint-disable-line no-unused-vars
			extendedRtpCapabilities
		}
	)
	{
		super(logger);

		logger.debug('constructor() [direction:%s]', direction);

		// Generic sending RTP parameters for audio and video.
		// @type {Object}
		this._rtpParametersByKind =
		{
			audio : ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
			video : ortc.getSendingRtpParameters('video', extendedRtpCapabilities)
		};

		// Local RTCP CNAME.
		// @type {String}
		this._cname = `CNAME-${utils.generateRandomNumber()}`;

		// Got transport local and remote parameters.
		// @type {Boolean}
		this._transportReady = false;

		// Sending tracks.
		// @type {Set<MediaStreamTrack>}
		this._sendingTracks = new Set();

		// Receiving sources.
		// @type {Set<Number>}
		this._receivingSources = new Set();
	}

	close()
	{
		logger.debug('close()');
	}

	// For simulation purposes.
	setConnectionState(connectionState)
	{
		this.emit('@connectionstatechange', connectionState);
	}

	async getTransportStats()
	{
		return new Map();
	}

	async restartIce({ remoteIceParameters } = {}) // eslint-disable-line no-unused-vars
	{
		return;
	}

	async updateIceServers({ iceServers }) // eslint-disable-line no-unused-vars
	{
		return;
	}

	async send({ track, simulcast }) // eslint-disable-line no-unused-vars
	{
		logger.debug('send() [kind:%s, trackId:%s]', track.kind, track.id);

		if (this._sendingTracks.has(track))
			throw new DuplicatedError('track already handled');

		if (!this._transportReady)
			await this._setupTransport({ localDtlsRole: 'server' });

		const rtpParameters =
			utils.clone(this._rtpParametersByKind[track.kind]);

		rtpParameters.mid = `mid-${utils.generateRandomNumber()}`;

		// Fill RTCRtpParameters.encodings.
		const encoding =
		{
			ssrc : utils.generateRandomNumber()
		};

		if (rtpParameters.codecs.some((codec) => codec.name === 'rtx'))
		{
			encoding.rtx =
			{
				ssrc : utils.generateRandomNumber()
			};
		}

		rtpParameters.encodings.push(encoding);

		// Fill RTCRtpParameters.rtcp.
		rtpParameters.rtcp =
		{
			cname       : this._cname,
			reducedSize : true,
			mux         : true
		};

		this._sendingTracks.add(track);

		return rtpParameters;
	}

	async stopSending({ track })
	{
		logger.debug('stopSending() [trackId:%s]', track.id);

		if (!this._sendingTracks.has(track))
			throw new Error('local track not found');

		this._sendingTracks.delete(track);
	}

	async replaceTrack({ track, newTrack }) // eslint-disable-line no-unused-vars
	{
		logger.debug('replaceTrack() [newTrackId:%s]', newTrack.id);

		if (this._sendingTracks.has(newTrack))
			throw new DuplicatedError('track already handled');

		this._sendingTracks.delete(track);
		this._sendingTracks.add(newTrack);
	}

	async getSenderStats({ track }) // eslint-disable-line no-unused-vars
	{
		return new Map();
	}

	async setMaxSpatialLayer({ track, spatialLayer }) // eslint-disable-line no-unused-vars
	{
		logger.debug(
			'setMaxSpatialLayer() [track.id:%s, spatialLayer:%s]',
			track.id, spatialLayer);
	}

	async receive({ id, kind, rtpParameters }) // eslint-disable-line no-unused-vars
	{
		logger.debug('receive() [id:%s, kind:%s]', id, kind);

		if (this._receivingSources.has(id))
			throw new DuplicatedError('already receiving this source');

		if (!this._transportReady)
			await this._setupTransport({ localDtlsRole: 'client' });

		this._receivingSources.add(id);

		const track = new MediaStreamTrack({ kind });

		return track;
	}

	async stopReceiving({ id })
	{
		logger.debug('stopReceiving() [id:%s]', id);

		this._receivingSources.delete(id);
	}

	async getReceiverStats({ track }) // eslint-disable-line no-unused-vars
	{
		return new Map();
	}

	async _setupTransport({ localDtlsRole } = {})
	{
		const dtlsParameters = utils.clone(localDtlsParameters);

		// Set our DTLS role.
		if (localDtlsRole)
			dtlsParameters.role = localDtlsRole;

		const transportLocalParameters = { dtlsParameters };

		// Need to tell the remote transport about our parameters.
		await this.safeEmitAsPromise('@connect', transportLocalParameters);

		this._transportReady = true;
	}
}

module.exports = FakeHandler;
