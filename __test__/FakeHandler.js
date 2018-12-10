const MediaStreamTrack = require('node-mediastreamtrack');
const Logger = require('../lib/Logger');
const EnhancedEventEmitter = require('../lib/EnhancedEventEmitter');
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

				return rtpParameters;
			});
	}

	stopSending({ track })
	{
		logger.debug('stopSending() [trackId:%s]', track.id);

		return Promise.resolve();
	}

	replaceTrack({ track, newTrack }) // eslint-disable-line no-unused-vars
	{
		logger.debug('replaceTrack() [newTrackId:%s]', newTrack.id);

		return Promise.resolve();
	}

	getSenderStats({ track }) // eslint-disable-line no-unused-vars
	{
		return Promise.resolve(new Map());
	}

	receive({ id, kind, rtpParameters }) // eslint-disable-line no-unused-vars
	{
		logger.debug('receive() [id:%s, kind:%s]', id, kind);

		return Promise.resolve()
			.then(() =>
			{
				if (!this._transportReady)
					return this._setupTransport({ localDtlsRole: 'client' });
			})
			.then(() =>
			{
				const track = new MediaStreamTrack({ kind });

				return track;
			});
	}

	stopReceiving({ id })
	{
		logger.debug('stopReceiving() [id:%s]', id);

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
