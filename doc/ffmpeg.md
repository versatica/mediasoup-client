# ffmpeg

Some stuff to make `ffmpeg` work with mediasoup v3.

Resources:

* [FFmpeg Protocols Documentation](https://ffmpeg.org/ffmpeg-protocols.html)
* [node-fluent-ffmpeg](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) - Unmaintained, but interesting. Do we need this?


## Sending a MP3 file encoded in Opus

Something like this:

```bash
$ ffmpeg \
  -re -f mp3 -i audio.mp3 -acodec libopus -ab 128k -ac 2 -ar 48000 \
  -ssrc 666 -payload_type 111 \
  -f rtp "rtp://1.2.3.4:1234?rtcpport=1234&localrtpport=10000&localrtcpport=10001"
```

The command produces this SDP output, which represents the **remote** SDP:

```
v=0
o=- 0 0 IN IP4 127.0.0.1
s=No Name
c=IN IP4 1.2.3.4
t=0 0
a=tool:libavformat 58.20.100
m=audio 1234 RTP/AVP 111
b=AS:128
a=rtpmap:111 opus/48000/2
a=fmtp:111 sprop-stereo=1
```

Commandline options and URL query parameters mean (some of them):

* `-ssrc 666`: Send RTP packets with SSRC 666 (great!).
* `-payload_type 111`: Use 111 as payload type (great!).
* `rtp://1.2.3.4:1234`:  Send RTP to IP 1.2.3.4 and port 1234.
* `?rtcpport=1234`: Send RTCP to port 1.2.3.4 (it works, great!).
* `?localrtpport=10000`: Use 10000 as RTP source port (great!).
* `?localrtcpport=10001`: Use 10001 as RTCP source port (it cannot be 10000, sad).

Notes:

* `ffmpeg` can send RTP and RTCP to the same port, which is great, but it cannot listen for RTP and RTCP in the same local port. So we need something in `PlainRtpTransport` to send RTP and RTCP to different destination ports.
