declare abstract class MediaSection {
    protected readonly _mediaObject: any;
    protected readonly _planB: boolean;
    constructor({ iceParameters, iceCandidates, dtlsParameters, planB }: {
        iceParameters: any;
        iceCandidates: any[];
        dtlsParameters: any;
        planB: boolean;
    });
    abstract setDtlsRole(role: 'client' | 'server' | 'auto'): void;
    readonly mid: string;
    readonly closed: boolean;
    getObject(): object;
    /**
     * @param {RTCIceParameters} iceParameters
     */
    setIceParameters(iceParameters: any): void;
    disable(): void;
    close(): void;
}
export declare class AnswerMediaSection extends MediaSection {
    constructor(data: any);
    /**
     * @param {String} role
     */
    setDtlsRole(role: 'client' | 'server' | 'auto'): void;
}
export declare class OfferMediaSection extends MediaSection {
    constructor(data: any);
    /**
     * @param {String} role
     */
    setDtlsRole(role: 'client' | 'server' | 'auto'): void;
    planBReceive({ offerRtpParameters, streamId, trackId }: {
        offerRtpParameters: any;
        streamId: string;
        trackId: string;
    }): void;
    planBStopReceiving({ offerRtpParameters }: {
        offerRtpParameters: any;
    }): void;
}
export {};
//# sourceMappingURL=MediaSection.d.ts.map