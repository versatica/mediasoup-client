const Logger = require('../Logger');
const EnhancedEventEmitter = require('../EnhancedEventEmitter');
const { UnsupportedError, DuplicatedError } = require('../errors');
const utils = require('../utils');
const ortc = require('../ortc');
const edgeUtils = require('./ortc/edgeUtils');

const logger = new Logger('Edge11');

class Edge11 extends EnhancedEventEmitter
{
	static async getNativeRtpCapabilities()
	{
		logger.debug('getNativeRtpCapabilities()');

		return edgeUtils.getCapabilities();
	}

	constructor(
		{
			transportRemoteParameters,
			direction,
			iceServers,
			iceTransportPolicy,
			proprietaryConstraints, // eslint-disable-line no-unused-vars
			extendedRtpCapabilities
		}
	)
	{
		super(logger);

		logger.debug('constructor() [direction:%s]', direction);

		// Generic sending RTP parameters for audio and video.
		// @type {Object}
		this._sendingRtpParametersByKind =
		{
			audio : ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
			video : ortc.getSendingRtpParameters('video', extendedRtpCapabilities)
		};

		// Transport Remote parameters.
		// @type {Object}
		this._transportRemoteParameters = transportRemoteParameters;

		// Got transport local and remote parameters.
		// @type {Boolean}
		this._transportReady = false;

		// ICE gatherer.
		this._iceGatherer = null;

		// ICE transport.
		this._iceTransport = null;

		// DTLS transport.
		// @type {RTCDtlsTransport}
		this._dtlsTransport = null;

		// Map of RTCRtpSenders indexed by id.
		// @type {Map<String, RTCRtpSender}
		this._rtpSenders = new Map();

		// Map of RTCRtpReceivers indexed by id.
		// @type {Map<String, RTCRtpReceiver}
		this._rtpReceivers = new Map();

		// Local RTCP CNAME.
		// @type {String}
		this._cname = `CNAME-${utils.generateRandomNumber()}`;

		this._setIceGatherer({ iceServers, iceTransportPolicy });
		this._setIceTransport();
		this._setDtlsTransport();
	}

	close()
	{
		logger.debug('close()');

		// Close the ICE gatherer.
		// NOTE: Not yet implemented by Edge.
		try { this._iceGatherer.close(); }
		catch (error) {}

		// Close the ICE transport.
		try { this._iceTransport.stop(); }
		catch (error) {}

		// Close the DTLS transport.
		try { this._dtlsTransport.stop(); }
		catch (error) {}

		// Close RTCRtpSenders.
		for (const rtpSender of this._rtpSenders.values())
		{
			try { rtpSender.stop(); }
			catch (error) {}
		}

		// Close RTCRtpReceivers.
		for (const rtpReceiver of this._rtpReceivers.values())
		{
			try { rtpReceiver.stop(); }
			catch (error) {}
		}
	}

	async getTransportStats()
	{
		return this._iceTransport.getStats();
	}

	async send({ track, simulcast }) // eslint-disable-line no-unused-vars
	{
		logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);

		if (this._rtpSenders.has(track.id))
			throw new DuplicatedError('track already handled');

		if (!this._transportReady)
			await this._setupTransport({ localDtlsRole: 'server' });

		logger.debug('send() | calling new RTCRtpSender()');

		const rtpSender = new RTCRtpSender(track, this._dtlsTransport);
		const rtpParameters =
			utils.clone(this._sendingRtpParametersByKind[track.kind]);

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

		// NOTE: Convert our standard RTCRtpParameters into those that Edge
		// expects.
		const edgeRtpParameters = edgeUtils.mangleRtpParameters(rtpParameters);

		logger.debug(
			'send() | calling rtpSender.send() [params:%o]',
			edgeRtpParameters);

		await rtpSender.send(edgeRtpParameters);

		// Store it.
		this._rtpSenders.set(track.id, rtpSender);

		return rtpParameters;
	}

	async stopSending({ track })
	{
		logger.debug('stopSending() [track.id:%s]', track.id);

		const rtpSender = this._rtpSenders.get(track.id);

		if (!rtpSender)
			throw new Error('RTCRtpSender not found');

		this._rtpSenders.delete(track.id);

		try
		{
			logger.debug('stopSending() | calling rtpSender.stop()');

			rtpSender.stop();
		}
		catch (error)
		{
			logger.warn('stopSending() | rtpSender.stop() failed:%o', error);

			throw error;
		}
	}

	async replaceTrack({ track, newTrack })
	{
		logger.debug('replaceTrack() [newTrack.id:%s]', newTrack.id);

		if (this._rtpSenders.has(newTrack.id))
			throw new DuplicatedError('track already handled');

		const rtpSender = this._rtpSenders.get(track.id);

		if (!rtpSender)
			throw new Error('RTCRtpSender not found');

		rtpSender.setTrack(newTrack);

		// Replace key.
		this._rtpSenders.delete(track.id);
		this._rtpSenders.set(newTrack.id, rtpSender);
	}

	async setMaxSpatialLayer({ track, spatialLayer })
	{
		logger.debug(
			'setMaxSpatialLayer() [track.id:%s, spatialLayer:%s]',
			track.id, spatialLayer);

		const rtpSender = this._rtpSenders.get(track.id);

		if (!rtpSender)
			throw new Error('local track not found');

		const parameters = rtpSender.getParameters();
		const lowEncoding = parameters.encodings[0];
		const mediumEncoding = parameters.encodings[1];
		const highEncoding = parameters.encodings[2];

		switch (spatialLayer)
		{
			case 'low':
			{
				lowEncoding && (lowEncoding.active = true);
				mediumEncoding && (mediumEncoding.active = false);
				highEncoding && (highEncoding.active = false);

				break;
			}

			case 'medium':
			{
				lowEncoding && (lowEncoding.active = true);
				mediumEncoding && (mediumEncoding.active = true);
				highEncoding && (highEncoding.active = false);

				break;
			}

			case 'high':
			{
				lowEncoding && (lowEncoding.active = true);
				mediumEncoding && (mediumEncoding.active = true);
				highEncoding && (highEncoding.active = true);

				break;
			}
		}

		await rtpSender.setParameters(parameters);
	}

	async getSenderStats({ track })
	{
		const rtpSender = this._rtpSenders.get(track.id);

		if (!rtpSender)
			throw new Error('local track not found');

		return rtpSender.getStats();
	}

	async receive({ id, kind, rtpParameters })
	{
		logger.debug('receive() [id:%s, kind:%s]', id, kind);

		if (this._rtpReceivers.has(id))
			throw new DuplicatedError('already receiving this source');

		if (!this._transportReady)
			await this._setupTransport({ localDtlsRole: 'server' });

		logger.debug('receive() | calling new RTCRtpReceiver()');

		const rtpReceiver = new RTCRtpReceiver(this._dtlsTransport, kind);

		rtpReceiver.addEventListener('error', (event) =>
		{
			logger.error('iceGatherer "error" event [event:%o]', event);
		});

		// NOTE: Convert our standard RTCRtpParameters into those that Edge
		// expects.
		const edgeRtpParameters =
			edgeUtils.mangleRtpParameters(rtpParameters);

		// Ignore MID RTP extension for receiving media.
		edgeRtpParameters.headerExtensions =
			edgeRtpParameters.headerExtensions
				.filter((extension) => (
					extension.uri !== 'urn:ietf:params:rtp-hdrext:sdes:mid'
				));

		logger.debug(
			'receive() | calling rtpReceiver.receive() [params:%o]',
			edgeRtpParameters);

		await rtpReceiver.receive(edgeRtpParameters);

		// Store it.
		this._rtpReceivers.set(id, rtpReceiver);

		return rtpReceiver.track;
	}

	async stopReceiving({ id })
	{
		logger.debug('stopReceiving() [id:%s]', id);

		const rtpReceiver = this._rtpReceivers.get(id);

		if (!rtpReceiver)
			throw new Error('RTCRtpReceiver not found');

		this._rtpReceivers.delete(id);

		try
		{
			logger.debug('stopReceiving() | calling rtpReceiver.stop()');

			rtpReceiver.stop();
		}
		catch (error)
		{
			logger.warn('stopReceiving() | rtpReceiver.stop() failed:%o', error);
		}
	}

	async getReceiverStats({ id })
	{
		const rtpReceiver = this._rtpReceivers.get(id);

		if (!rtpReceiver)
			throw new Error('RTCRtpReceiver not found');

		return rtpReceiver.getStats();
	}

	async restartIce({ remoteIceParameters })
	{
		logger.debug('restartIce()');

		this._transportRemoteParameters.iceParameters = remoteIceParameters;

		if (!this._transportReady)
			return;

		const remoteIceCandidates = this._transportRemoteParameters.iceCandidates;

		logger.debug('restartIce() | calling iceTransport.start()');

		this._iceTransport.start(
			this._iceGatherer, remoteIceParameters, 'controlling');

		for (const candidate of remoteIceCandidates)
		{
			this._iceTransport.addRemoteCandidate(candidate);
		}

		this._iceTransport.addRemoteCandidate({});
	}

	// eslint-disable-next-line no-unused-vars
	async updateIceServers({ iceServers })
	{
		logger.debug('updateIceServers()');

		// NOTE: Edge 11 does not implement iceGatherer.gater().
		throw new UnsupportedError('not supported');
	}

	_setIceGatherer({ iceServers, iceTransportPolicy })
	{
		const iceGatherer = new RTCIceGatherer(
			{
				iceServers   : iceServers || [],
				gatherPolicy : iceTransportPolicy || 'all'
			});

		iceGatherer.addEventListener('error', (event) =>
		{
			logger.error('iceGatherer "error" event [event:%o]', event);
		});

		// NOTE: Not yet implemented by Edge, which starts gathering automatically.
		try
		{
			iceGatherer.gather();
		}
		catch (error)
		{
			logger.debug(
				'_setIceGatherer() | iceGatherer.gather() failed: %s', error.toString());
		}

		this._iceGatherer = iceGatherer;
	}

	_setIceTransport()
	{
		const iceTransport = new RTCIceTransport(this._iceGatherer);

		// NOTE: Not yet implemented by Edge.
		iceTransport.addEventListener('statechange', () =>
		{
			switch (iceTransport.state)
			{
				case 'checking':
					this.emit('@connectionstatechange', 'connecting');
					break;
				case 'connected':
				case 'completed':
					this.emit('@connectionstatechange', 'connected');
					break;
				case 'failed':
					this.emit('@connectionstatechange', 'failed');
					break;
				case 'disconnected':
					this.emit('@connectionstatechange', 'disconnected');
					break;
				case 'closed':
					this.emit('@connectionstatechange', 'closed');
					break;
			}
		});

		// NOTE: Not standard, but implemented by Edge.
		iceTransport.addEventListener('icestatechange', () =>
		{
			switch (iceTransport.state)
			{
				case 'checking':
					this.emit('@connectionstatechange', 'connecting');
					break;
				case 'connected':
				case 'completed':
					this.emit('@connectionstatechange', 'connected');
					break;
				case 'failed':
					this.emit('@connectionstatechange', 'failed');
					break;
				case 'disconnected':
					this.emit('@connectionstatechange', 'disconnected');
					break;
				case 'closed':
					this.emit('@connectionstatechange', 'closed');
					break;
			}
		});

		iceTransport.addEventListener('candidatepairchange', (event) =>
		{
			logger.debug(
				'iceTransport "candidatepairchange" event [pair:%o]', event.pair);
		});

		this._iceTransport = iceTransport;
	}

	_setDtlsTransport()
	{
		const dtlsTransport = new RTCDtlsTransport(this._iceTransport);

		// NOTE: Not yet implemented by Edge.
		dtlsTransport.addEventListener('statechange', () =>
		{
			logger.debug(
				'dtlsTransport "statechange" event [state:%s]', dtlsTransport.state);
		});

		// NOTE: Not standard, but implemented by Edge.
		dtlsTransport.addEventListener('dtlsstatechange', () =>
		{
			logger.debug(
				'dtlsTransport "dtlsstatechange" event [state:%s]', dtlsTransport.state);

			if (dtlsTransport.state === 'closed')
				this.emit('@connectionstatechange', 'closed');
		});

		dtlsTransport.addEventListener('error', (event) =>
		{
			logger.error('dtlsTransport "error" event [event:%o]', event);
		});

		this._dtlsTransport = dtlsTransport;
	}

	async _setupTransport({ localDtlsRole } = {})
	{
		logger.debug('_setupTransport()');

		// Get our local DTLS parameters.
		const dtlsParameters = this._dtlsTransport.getLocalParameters();

		dtlsParameters.role = localDtlsRole || 'server';

		const transportLocalParameters = { dtlsParameters };

		// Need to tell the remote transport about our parameters.
		await this.safeEmitAsPromise('@connect', transportLocalParameters);

		const remoteIceParameters = this._transportRemoteParameters.iceParameters;
		const remoteIceCandidates = this._transportRemoteParameters.iceCandidates;
		const remoteDtlsParameters = this._transportRemoteParameters.dtlsParameters;

		// Start the RTCIceTransport.
		this._iceTransport.start(
			this._iceGatherer, remoteIceParameters, 'controlling');

		// Add remote ICE candidates.
		for (const candidate of remoteIceCandidates)
		{
			this._iceTransport.addRemoteCandidate(candidate);
		}

		// Also signal a 'complete' candidate as per spec.
		// NOTE: It should be {complete: true} but Edge prefers {}.
		// NOTE: If we don't signal end of candidates, the Edge RTCIceTransport
		// won't enter the 'completed' state.
		this._iceTransport.addRemoteCandidate({});

		// NOTE: Edge does not like SHA less than 256.
		remoteDtlsParameters.fingerprints = remoteDtlsParameters.fingerprints.
			filter((fingerprint) =>
			{
				return (
					fingerprint.algorithm === 'sha-256' ||
					fingerprint.algorithm === 'sha-384' ||
					fingerprint.algorithm === 'sha-512'
				);
			});

		// Start the RTCDtlsTransport.
		this._dtlsTransport.start(remoteDtlsParameters);

		this._transportReady = true;
	}
}

module.exports = Edge11;
