exports.nativeRtpCapabilities =
{
	codecs :
	[
		{
			name                 : 'opus',
			mimeType             : 'audio/opus',
			kind                 : 'audio',
			clockRate            : 48000,
			preferredPayloadType : 111,
			channels             : 2,
			rtcpFeedback         :
			[
				{ type: 'transport-cc' }
			],
			parameters :
			{
				minptime     : 10,
				useinbandfec : 1
			}
		},
		{
			name                 : 'ISAC',
			mimeType             : 'audio/ISAC',
			kind                 : 'audio',
			clockRate            : 16000,
			preferredPayloadType : 103,
			channels             : 1,
			rtcpFeedback         : [],
			parameters           : {}
		},
		{
			name                 : 'CN',
			mimeType             : 'audio/CN',
			kind                 : 'audio',
			clockRate            : 32000,
			preferredPayloadType : 106,
			channels             : 1,
			rtcpFeedback         : [],
			parameters           : {}
		},
		{
			name                 : 'VP8',
			mimeType             : 'video/VP8',
			kind                 : 'video',
			clockRate            : 90000,
			preferredPayloadType : 96,
			rtcpFeedback         :
			[
				{ type: 'goog-remb' },
				{ type: 'transport-cc' },
				{ type: 'ccm', parameter: 'fir' },
				{ type: 'nack' },
				{ type: 'nack', parameter: 'pli' }
			],
			parameters : {}
		},
		{
			name                 : 'rtx',
			mimeType             : 'video/rtx',
			kind                 : 'video',
			clockRate            : 90000,
			preferredPayloadType : 97,
			rtcpFeedback         : [],
			parameters           :
			{
				apt : 96
			}
		}
	],
	headerExtensions :
	[
		{
			kind        : 'audio',
			uri         : 'urn:ietf:params:rtp-hdrext:ssrc-audio-level',
			preferredId : 1
		},
		{
			kind        : 'audio',
			uri         : 'urn:ietf:params:rtp-hdrext:sdes:mid',
			preferredId : 9
		},
		{
			kind        : 'video',
			uri         : 'urn:ietf:params:rtp-hdrext:toffset',
			preferredId : 2
		},
		{
			kind        : 'video',
			uri         : 'http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time',
			preferredId : 3
		},
		{
			kind        : 'video',
			uri         : 'urn:3gpp:video-orientation',
			preferredId : 4
		},
		{
			kind        : 'video',
			uri         : 'http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01',
			preferredId : 5
		},
		{
			kind        : 'video',
			uri         : 'http://www.webrtc.org/experiments/rtp-hdrext/playout-delay',
			preferredId : 6
		},
		{
			kind        : 'video',
			uri         : 'http://www.webrtc.org/experiments/rtp-hdrext/video-content-type',
			preferredId : 7
		},
		{
			kind        : 'video',
			uri         : 'http://www.webrtc.org/experiments/rtp-hdrext/video-timing',
			preferredId : 8
		},
		{
			kind        : 'video',
			uri         : 'urn:ietf:params:rtp-hdrext:sdes:mid',
			preferredId : 9
		}
	],
	fecMechanisms : []
};
