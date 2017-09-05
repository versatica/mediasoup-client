/* global RTCIceGatherer, RTCIceTransport, RTCDtlsTransport, RTCRtpReceiver, RTCRtpSender */

import Logger from '../Logger';
import EnhancedEventEmitter from '../EnhancedEventEmitter';
import * as utils from '../utils';
import * as ortc from '../ortc';
import * as edgeUtils from './ortc/edgeUtils';

const CNAME = `CNAME-EDGE-${utils.randomNumber()}`;

const logger = new Logger('Edge11');

export default class Edge11 extends EnhancedEventEmitter
{
	static get name()
	{
		return 'Edge11';
	}

	static getNativeRtpCapabilities()
	{
		logger.debug('getNativeRtpCapabilities()');

		return edgeUtils.getCapabilities();
	}

	constructor(direction, extendedRtpCapabilities, settings)
	{
		super(logger);

		logger.debug(
			'constructor() [direction:%s, extendedRtpCapabilities:%o]',
			direction, extendedRtpCapabilities);

		// Generic sending RTP parameters for audio and video.
		// @type {Object}
		this._rtpParametersByKind =
		{
			audio : ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
			video : ortc.getSendingRtpParameters('video', extendedRtpCapabilities)
		};

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

		// Map of RTCRtpSenders indexed by Producer.id.
		// @type {Map<Number, RTCRtpSender}
		this._rtpSenders = new Map();

		// Map of RTCRtpReceivers indexed by Consumer.id.
		// @type {Map<Number, RTCRtpReceiver}
		this._rtpReceivers = new Map();

		// Remote Transport parameters.
		// @type {Object}
		this._transportRemoteParameters = null;

		this._setIceGatherer(settings);
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

	addProducer(producer)
	{
		const { track } = producer;

		logger.debug(
			'addProducer() [id:%s, kind:%s, trackId:%s]',
			producer.id, producer.kind, track.id);

		if (this._rtpSenders.has(producer.id))
			return Promise.reject('Producer already added');

		return Promise.resolve()
			.then(() =>
			{
				if (!this._transportReady)
					return this._setupTransport();
			})
			.then(() =>
			{
				logger.debug('addProducer() | calling new RTCRtpSender()');

				const rtpSender = new RTCRtpSender(track, this._dtlsTransport);
				const rtpParameters =
					utils.clone(this._rtpParametersByKind[producer.kind]);

				// Fill RTCRtpParameters.encodings.
				const encoding =
				{
					ssrc : utils.randomNumber()
				};

				if (rtpParameters.codecs.some((codec) => codec.name === 'rtx'))
				{
					encoding.rtx =
					{
						ssrc : utils.randomNumber()
					};
				}

				rtpParameters.encodings.push(encoding);

				// Fill RTCRtpParameters.rtcp.
				rtpParameters.rtcp =
				{
					cname       : CNAME,
					reducedSize : true,
					mux         : true
				};

				// NOTE: Convert our standard RTCRtpParameters into those that Edge
				// expects.
				const edgeRtpParameters =
					edgeUtils.mangleRtpParameters(rtpParameters);

				logger.debug(
					'addProducer() | calling rtpSender.send() [params:%o]',
					edgeRtpParameters);

				rtpSender.send(edgeRtpParameters);

				// Store it.
				this._rtpSenders.set(producer.id, rtpSender);

				return rtpParameters;
			});
	}

	removeProducer(producer)
	{
		const { track } = producer;

		logger.debug(
			'removeProducer() [id:%s, kind:%s, trackId:%s]',
			producer.id, producer.kind, track.id);

		return Promise.resolve()
			.then(() =>
			{
				const rtpSender = this._rtpSenders.get(producer.id);

				if (!rtpSender)
					throw new Error('RTCRtpSender not found');

				this._rtpSenders.delete(producer.id);

				try
				{
					logger.debug('removeProducer() | calling rtpSender.stop()');

					rtpSender.stop();
				}
				catch (error)
				{
					logger.warn('rtpSender.stop() failed:%o', error);
				}
			});
	}

	replaceProducerTrack(producer, track)
	{
		logger.debug(
			'replaceProducerTrack() [id:%s, kind:%s, trackId:%s]',
			producer.id, producer.kind, track.id);

		return Promise.resolve()
			.then(() =>
			{
				const rtpSender = this._rtpSenders.get(producer.id);

				if (!rtpSender)
					throw new Error('RTCRtpSender not found');

				rtpSender.setTrack(track);
			});
	}

	addConsumer(consumer)
	{
		logger.debug(
			'addConsumer() [id:%s, kind:%s]', consumer.id, consumer.kind);

		if (this._rtpReceivers.has(consumer.id))
			return Promise.reject('Consumer already added');

		return Promise.resolve()
			.then(() =>
			{
				logger.debug('addProducer() | calling new RTCRtpReceiver()');

				const rtpReceiver =
					new RTCRtpReceiver(this._dtlsTransport, consumer.kind);

				rtpReceiver.addEventListener('error', (event) =>
				{
					logger.error('iceGatherer "error" event [event:%o]', event);
				});

				// NOTE: Convert our standard RTCRtpParameters into those that Edge
				// expects.
				const edgeRtpParameters =
					edgeUtils.mangleRtpParameters(consumer.rtpParameters);

				logger.debug(
					'addProducer() | calling rtpReceiver.receive() [params:%o]',
					edgeRtpParameters);

				rtpReceiver.receive(edgeRtpParameters);

				// Store it.
				this._rtpReceivers.set(consumer.id, rtpReceiver);
			});
	}

	removeConsumer(consumer)
	{
		logger.debug(
			'removeConsumer() [id:%s, kind:%s]', consumer.id, consumer.kind);

		return Promise.resolve()
			.then(() =>
			{
				const rtpReceiver = this._rtpReceivers.get(consumer.id);

				if (!rtpReceiver)
					throw new Error('RTCRtpReceiver not found');

				this._rtpReceivers.delete(consumer.id);

				try
				{
					logger.debug('removeConsumer() | calling rtpReceiver.stop()');

					rtpReceiver.stop();
				}
				catch (error)
				{
					logger.warn('rtpReceiver.stop() failed:%o', error);
				}
			});
	}

	restartIce(remoteIceParameters)
	{
		logger.debug('restartIce()');

		Promise.resolve()
			.then(() =>
			{
				this._transportRemoteParameters.iceParameters = remoteIceParameters;

				const remoteIceCandidates = this._transportRemoteParameters.iceCandidates;

				logger.debug('restartIce() | calling iceTransport.start()');

				this._iceTransport.start(
					this._iceGatherer, remoteIceParameters, 'controlling');

				for (const candidate of remoteIceCandidates)
				{
					this._iceTransport.addRemoteCandidate(candidate);
				}

				this._iceTransport.addRemoteCandidate({});
			});
	}

	_setIceGatherer(settings)
	{
		const iceGatherer = new RTCIceGatherer(
			{
				iceServers   : settings.turnServers || [],
				gatherPolicy : 'all'
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
			logger.debug('iceGatherer.gather() failed: %s', error.toString());
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
		});

		dtlsTransport.addEventListener('error', (event) =>
		{
			logger.error('dtlsTransport "error" event [event:%o]', event);
		});

		this._dtlsTransport = dtlsTransport;
	}

	_setupTransport()
	{
		logger.debug('_setupTransport()');

		return Promise.resolve()
			.then(() =>
			{
				// Get our local DTLS parameters.
				const transportLocalParameters = {};
				const dtlsParameters = this._dtlsTransport.getLocalParameters();

				// Let's decide that we'll be DTLS server (because we can).
				dtlsParameters.role = 'server';

				transportLocalParameters.dtlsParameters = dtlsParameters;

				// We need transport remote parameters.
				return this.safeEmitAsPromise(
					'@needcreatetransport', transportLocalParameters);
			})
			.then((transportRemoteParameters) =>
			{
				this._transportRemoteParameters = transportRemoteParameters;

				const remoteIceParameters = transportRemoteParameters.iceParameters;
				const remoteIceCandidates = transportRemoteParameters.iceCandidates;
				const remoteDtlsParameters = transportRemoteParameters.dtlsParameters;

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
			});
	}
}
