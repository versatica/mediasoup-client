import { EnhancedEventEmitter } from '../EnhancedEventEmitter';
import { ProducerCodecOptions } from '../Producer';
import { IceParameters } from '../Transport';
import { RtpParameters, RtpEncodingParameters } from '../RtpParameters';
import { SctpStreamParameters } from '../SctpParameters';
export declare abstract class HandlerInterface extends EnhancedEventEmitter {
    constructor();
    abstract close(): void;
    abstract getTransportStats(): Promise<any>;
    abstract updateIceServers({ iceServers }: {
        iceServers: RTCIceServer[];
    }): Promise<void>;
}
export declare abstract class SendHandlerInterface extends HandlerInterface {
    constructor();
    abstract send({ track, encodings, codecOptions }: {
        track: MediaStreamTrack;
        encodings?: RtpEncodingParameters[];
        codecOptions?: ProducerCodecOptions;
    }): Promise<any>;
    abstract stopSending({ localId }: {
        localId: string;
    }): Promise<void>;
    abstract replaceTrack({ localId, track }: {
        localId: string;
        track: MediaStreamTrack;
    }): Promise<void>;
    abstract setMaxSpatialLayer({ localId, spatialLayer }: {
        localId: string;
        spatialLayer: number;
    }): Promise<void>;
    abstract setRtpEncodingParameters({ localId, params }: {
        localId: string;
        params: any;
    }): Promise<void>;
    abstract getSenderStats({ localId }: {
        localId: string;
    }): Promise<any>;
    abstract sendDataChannel({ ordered, maxPacketLifeTime, maxRetransmits, label, protocol, priority }: SctpStreamParameters): Promise<any>;
    abstract restartIce({ iceParameters }: {
        iceParameters: IceParameters;
    }): Promise<void>;
}
export declare abstract class RecvHandlerInterface extends HandlerInterface {
    constructor();
    abstract receive({ id, kind, rtpParameters }: {
        id: string;
        kind: 'audio' | 'video';
        rtpParameters: RtpParameters;
    }): Promise<any>;
    abstract stopReceiving({ localId }: {
        localId: string;
    }): Promise<void>;
    abstract getReceiverStats({ localId }: {
        localId: string;
    }): Promise<any>;
    abstract receiveDataChannel({ sctpStreamParameters, label, protocol }: {
        sctpStreamParameters: SctpStreamParameters;
        label?: string;
        protocol?: string;
    }): Promise<any>;
    abstract restartIce({ iceParameters }: {
        iceParameters: IceParameters;
    }): Promise<void>;
}
//# sourceMappingURL=HandlerInterface.d.ts.map