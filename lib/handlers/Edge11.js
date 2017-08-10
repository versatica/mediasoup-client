/* global RTCIceGatherer, RTCIceTransport, RTCDtlsTransport,
RTCRtpSender, RTCRtpReceiver */

import Logger from '../Logger';
import EnhancedEventEmitter from '../EnhancedEventEmitter';
// import * as utils from '../utils';

const logger = new Logger('Edge11');

// const CNAME = `cname-${utils.randomNumber()}`;

export default class Edge11 extends EnhancedEventEmitter
{
	static get name()
	{
		return 'Edge11';
	}

	static getLocalRtpCapabilities()
	{
		logger.debug('getLocalRtpCapabilities()');

		// TODO: Not enough since Edge does not set mimeType, etc.
		return RTCRtpReceiver.getCapabilities();
	}

	constructor(direction, extendedRtpCapabilities, settings)
	{
		logger.debug(
			'constructor() [direction:%s, extendedRtpCapabilities:%o]',
			direction, extendedRtpCapabilities);

		super();

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

		this._setIceGatherer(settings);
		this._setIceTransport();
		this._setDtlsTransport();

		// TODO
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
		for (let rtpSender of this._rtpSenders.values())
		{
			try { rtpSender.stop(); }
			catch (error) {}
		}

		// Close RTCRtpReceivers.
		for (let rtpReceiver of this._rtpReceivers.values())
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

		return Promise.resolve()
			.then(() =>
			{
				if (!this._transportReady)
					return this._setupTransport();
			});

		// TODO
	}

	removeProducer(producer)
	{
		const { track } = producer;

		logger.debug(
			'removeProducer() [id:%s, kind:%s, trackId:%s]',
			producer.id, producer.kind, track.id);

		// TODO
	}

	addConsumer(consumer)
	{
		logger.debug(
			'addConsumer() [id:%s, kind:%s]', consumer.id, consumer.kind);

		// TODO
	}

	removeConsumer(consumer)
	{
		logger.debug(
			'removeConsumer() [id:%s, kind:%s]', consumer.id, consumer.kind);

		// TODO
	}

	_setIceGatherer(settings)
	{
		const iceGatherer = new RTCIceGatherer(
			{
				iceServers   : settings.turnServers || [],
				gatherPolicy : 'relay'
			});

		iceGatherer.addEventListener('error', (event) =>
		{
			const { errorCode, errorText } = event;

			logger.error(
				`iceGatherer "error" event [errorCode:${errorCode}, errorText:${errorText}]`);
		});

		// NOTE: Not yet implemented by Edge, which starts gathering automatically.
		try
		{
			iceGatherer.gather();
		}
		catch (error)
		{
			logger.debug(`iceGatherer.gather() failed:${error}`);
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
				`iceTransport "candidatepairchange" event [pair:${event.pair}]`);
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
				`dtlsTransport "statechange" event [state:${dtlsTransport.state}]`);
		});

		// NOTE: Not standard, but implemented by Edge.
		dtlsTransport.addEventListener('dtlsstatechange', () =>
		{
			logger.debug(
				`dtlsTransport "dtlsstatechange" event [state:${dtlsTransport.state}]`);
		});

		dtlsTransport.addEventListener('error', (event) =>
		{
			let error;

			if (event.message)
				error = event.message;
			else if (event.error)
				error = event.error.message;

			logger.error(`dtlsTransport "error" event:${error}`);
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

				// Start the RTCDtlsTransport.
				this._dtlsTransport.start(remoteDtlsParameters);

				this._transportReady = true;
			});
	}
}
