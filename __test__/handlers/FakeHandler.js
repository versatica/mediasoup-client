import MediaStreamTrack from 'node-mediastreamtrack';
import Logger from '../../lib/Logger';
import EnhancedEventEmitter from '../../lib/EnhancedEventEmitter';
import * as utils from '../../lib/utils';
import * as ortc from '../../lib/ortc';

const logger = new Logger('FakeHandler');
let nativeRtpCapabilities;
let localDtlsParameters;

export default class FakeHandler extends EnhancedEventEmitter
{
	static setNativeRtpCapabilities(rtpCapabilities)
	{
		nativeRtpCapabilities = rtpCapabilities;
	}

	static setLocalDtlsParameters(dtlsParameters)
	{
		localDtlsParameters = dtlsParameters;
	}

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

	send({ track, simulcast }) // eslint-disable-line no-unused-vars
	{
		logger.debug('send() [kind:%s, trackId:%s]', track.kind, track.id);

		return Promise.resolve()
			.then(() =>
			{
				if (!this._transportReady)
					return this._setupTransport({ localDtlsRole: 'client' });
			})
			.then(() =>
			{
				const rtpParameters =
					utils.clone(this._rtpParametersByKind[track.kind]);

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
		logger.debug('replaceTrack() [newTrackId:%s]', newTrack);

		return Promise.resolve(newTrack);
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
