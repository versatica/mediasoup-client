import { RtpCapabilities } from '../../RtpParameters';

/**
 * This function adds RTCP NACK support for OPUS codec in given capabilities.
 */
export function addNackSuppportForOpus(rtpCapabilities: RtpCapabilities): void
{
	for (const codec of (rtpCapabilities.codecs || []))
	{
		if (
			(
				codec.mimeType.toLowerCase() === 'audio/opus' ||
				codec.mimeType.toLowerCase() === 'audio/multiopus'
			) &&
			!codec.rtcpFeedback?.some((fb) => fb.type === 'nack' && !fb.parameter)
		)
		{
			if (!codec.rtcpFeedback)
			{
				codec.rtcpFeedback = [];
			}

			codec.rtcpFeedback.push({ type: 'nack' });
		}
	}
}
