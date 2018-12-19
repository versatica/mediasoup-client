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
	static getNativeRtpCapabilities()
	{
		logger.debug('getNativeRtpCapabilities()');

		return Promise.resolve(nativeRtpCapabilities);
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

	getTransportStats()
	{
		return Promise.resolve(new Map());
	}

	restartIce({ remoteIceParameters } = {}) // eslint-disable-line no-unused-vars
	{
		return Promise.resolve();
	}

	updateIceServers({ iceServers }) // eslint-disable-line no-unused-vars
	{
		return Promise.resolve();
	}

	send({ track, simulcast }) // eslint-disable-line no-unused-vars
	{
		logger.debug('send() [kind:%s, trackId:%s]', track.kind, track.id);

		if (this._sendingTracks.has(track))
			return Promise.reject(new DuplicatedError('track already handled'));

		return Promise.resolve()
			.then(() =>
			{
				if (!this._transportReady)
					return this._setupTransport({ localDtlsRole: 'server' });
			})
			.then(() =>
			{
				const rtpParameters =
					utils.clone(this._rtpParametersByKind[track.kind]);

				rtpParameters.muxId = String(utils.generateRandomNumber());

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
			});
	}

	stopSending({ track })
	{
		logger.debug('stopSending() [trackId:%s]', track.id);

		if (!this._sendingTracks.has(track))
			return Promise.reject(new Error('local track not found'));

		this._sendingTracks.delete(track);

		return Promise.resolve();
	}

	replaceTrack({ track, newTrack }) // eslint-disable-line no-unused-vars
	{
		logger.debug('replaceTrack() [newTrackId:%s]', newTrack.id);

		if (this._sendingTracks.has(newTrack))
			return Promise.reject(new DuplicatedError('track already handled'));

		this._sendingTracks.delete(track);
		this._sendingTracks.add(newTrack);

		return Promise.resolve();
	}

	getSenderStats({ track }) // eslint-disable-line no-unused-vars
	{
		return Promise.resolve(new Map());
	}

	setMaxSpatialLayer({ track, spatialLayer }) // eslint-disable-line no-unused-vars
	{
		logger.debug(
			'setMaxSpatialLayer() [track.id:%s, spatialLayer:%s]',
			track.id, spatialLayer);

		return Promise.resolve();
	}

	receive({ id, kind, rtpParameters }) // eslint-disable-line no-unused-vars
	{
		logger.debug('receive() [id:%s, kind:%s]', id, kind);

		if (this._receivingSources.has(id))
			return Promise.reject(new DuplicatedError('already receiving this source'));

		return Promise.resolve()
			.then(() =>
			{
				if (!this._transportReady)
					return this._setupTransport({ localDtlsRole: 'client' });
			})
			.then(() =>
			{
				this._receivingSources.add(id);

				const track = new MediaStreamTrack({ kind });

				return track;
			});
	}

	stopReceiving({ id })
	{
		logger.debug('stopReceiving() [id:%s]', id);

		this._receivingSources.delete(id);

		return Promise.resolve();
	}

	getReceiverStats({ track }) // eslint-disable-line no-unused-vars
	{
		return Promise.resolve(new Map());
	}

	_setupTransport({ localDtlsRole } = {})
	{
		return Promise.resolve()
			.then(() =>
			{
				const dtlsParameters = utils.clone(localDtlsParameters);

				// Set our DTLS role.
				if (localDtlsRole)
					dtlsParameters.role = localDtlsRole;

				const transportLocalParameters = { dtlsParameters };

				// Need to tell the remote transport about our parameters.
				return this.safeEmitAsPromise('@connect', transportLocalParameters);
			})
			.then(() =>
			{
				this._transportReady = true;
			});
	}
}

module.exports = FakeHandler;
