const mediasoupClient = require('../lib/index')
const { TimeoutError } = require('../lib/errors')

const ANY_ROOM_ID = 1;
const ANY_PRODUCER_ID = 1;
const ANY_PEER_NAME = 'me';


let room;

beforeEach(() => {
    room = new mediasoupClient.Room();
});

test('Room can be instantiated', () =>
{
	expect(room).toBeDefined();
});

test('Initial state', () =>
{
    expect(room.joined).toEqual(false);
    expect(room.closed).toEqual(false);
    expect(room.peerName).toBeNull();
    expect(room.transports).toEqual([]);
    expect(room.producers).toEqual([]);
    expect(room.peers).toEqual([]);
});

test('getTransportById if not found', () =>
{
    expect(room.getTransportById(ANY_ROOM_ID)).toBeUndefined();
});

test('getProducerById if not found', () =>
{
    expect(room.getProducerById(ANY_PRODUCER_ID)).toBeUndefined();
});

test('getProducerById if not found', () =>
{
    expect(room.getPeerByName(ANY_PEER_NAME)).toBeUndefined();
});

test('join with non string peerName', () =>
{
    return expect(room.join(1, {})).rejects.toThrow(TypeError);
});

test('join with string peerName rejecting with timeout', () =>
{
    room = new mediasoupClient.Room({ requestTimeout: 100 });
    return expect(room.join(ANY_PEER_NAME, {})).rejects.toEqual(new TimeoutError('timeout'))
});
