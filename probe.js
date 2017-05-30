// Copyright (c) 2014 Andrew Paprocki

const dhcpjs = require('dhcpjs');
const util = require('util');
const os = require('os');
const ip = require('ip');
const slack = require('slack-notify');
require('dotenv').config({ silent: true });

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

const stopSocket = function() {
    client.client.close();
}

const slack_webhook = process.env.SLACK_WEBHOOK_URL;
const slack_channel = process.env.SLACK_CHANNEL;
const slackSend = slack(slack_webhook);
const fail = function(reason) {
    console.error(reason);
    slackSend.send({
        channel: slack_channel,
        text: "DHCP probe failed",
        username: "Network Probe",
        icon_emoji: ":warning:",
        attachments: [{
            color: "danger",
            fields: [
                { title: 'Reason', value: reason }
            ]
        }]
    }, err => {
        if(err) {
            console.error(err);
        }
        stopSocket();
        process.exit(1);
    });
}

let timeout = null;
let lastPacket = null;
const sendRequest = function() {
    const payload = makePacket();
    lastPacket = payload;
    const request = client.createPacket(payload);
    client.broadcastPacket(request, undefined, function() {
        console.log(`dhcpRequest [${myInterface} | ${mac}]: sent`);
        timeout = setTimeout(() => fail("Request timeout"), 5000);
    });
}

client.on('dhcpOffer', function(pkt) {
    console.log('dhcpOffer received');

    // check if valid
    if(!lastPacket) {
        return;
    }

    if(pkt.xid !== lastPacket.xid) {
        fail(`Invalid xid: ${pkt.xid}`);
    }

    if(pkt.chaddr.address !== mac) {
        fail(`Invalid mac address: ${pkt.chaddr.address}`);
        return;
    }

    const subnet = ip.subnet(pkt.yiaddr, pkt.options.subnetMask);
    if(subnet.networkAddress !== '10.3.0.0') {
        fail(`Wrong/invalid ip address: ${pkt.yiaddr}`);
        return;
    }

    clearTimeout(timeout);
    console.log("SUCCESS: Got valid offer");
    stopSocket();
    process.exit(0);
});

client.bind('0.0.0.0', 68, function() {
    console.log('bound to 0.0.0.0:68');
    sendRequest();
});
