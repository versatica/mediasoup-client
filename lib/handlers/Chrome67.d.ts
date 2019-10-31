export default class Chrome67 {
    static readonly label: string;
    static getNativeRtpCapabilities(): Promise<any>;
    static getNativeSctpCapabilities(): Promise<any>;
    constructor({ direction, iceParameters, iceCandidates, dtlsParameters, sctpParameters, iceServers, iceTransportPolicy, additionalSettings, proprietaryConstraints, extendedRtpCapabilities }: {
        direction: 'send' | 'recv';
        iceParameters: any;
        iceCandidates: any[];
        dtlsParameters: any;
        sctpParameters: any;
        iceServers: any[];
        iceTransportPolicy: string;
        additionalSettings: any;
        proprietaryConstraints: any;
        extendedRtpCapabilities: any;
    });
}
//# sourceMappingURL=Chrome67.d.ts.map