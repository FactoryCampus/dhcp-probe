// Copyright (c) 2014 Andrew Paprocki

const dhcpjs = require('dhcpjs');
const util = require('util');
const os = require('os');
const ip = require('ip');

const client = new dhcpjs.Client();

let xid = Math.round(Math.random()*10000);
const interfaces = os.networkInterfaces();
console.log(interfaces);
const myInterface = process.env.IFACE || 'eth0';

if(!(myInterface in interfaces)) {
    console.error("Interface not found.");
    process.exit(1);
}

const interface = interfaces[myInterface];
const mac = interface.pop().mac;

const makePacket = function() {
    const params = [1, 121, 3, 6, 15, 119, 252, 95, 44, 46];
    return {
        op: 1,
        htype: 1,
        hlen: 6,
        hops: 0,
        xid: xid++,
        chaddr: mac,
        flags: Math.pow(2, 15),
        options: {
            dhcpMessageType: dhcpjs.Protocol.DHCPMessageType.DHCPDISCOVER,
            clientIdentifier: 'TestMachine',
            parameterRequestList: params
        }
    }
}

const stopSocket = function(ret) {
    ret = ret || 0;
    client.client.close();
    process.exit(ret);
}

let timeout = null;
let lastPacket = null;
const sendRequest = function() {
    const payload = makePacket();
    lastPacket = payload;
    const request = client.createPacket(payload);
    client.broadcastPacket(request, undefined, function() {
        console.log(`dhcpRequest [${myInterface} | ${mac}]: sent`);
        timeout = setTimeout(() => { console.log("Request timeout"); stopSocket(1); }, 5000);
    });
}

client.on('dhcpOffer', function(pkt) {
    console.log('dhcpOffer received');

    // check if valid
    if(!lastPacket) {
        return;
    }

    if(pkt.xid !== lastPacket.xid) {
        console.log("Invalid xid:", pkt.xid);
        return;
    }

    if(pkt.chaddr.address !== mac) {
        console.log("Invalid mac address:", pkt.chaddr.address);
        return;
    }

    const subnet = ip.subnet(pkt.yiaddr, pkt.options.subnetMask);
    if(subnet.networkAddress !== '10.3.0.0') {
        console.log('Wrong/invalid ip address:', pkt.yiaddr);
        return;
    }

    clearTimeout(timeout);
    console.log("SUCCESS: Got valid offer");
    stopSocket(0);
});

client.bind('0.0.0.0', 68, function() {
    console.log('bound to 0.0.0.0:68');
    sendRequest();
});
