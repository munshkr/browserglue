# browserglue

![status](https://github.com/munshkr/browserglue/actions/workflows/main.yml/badge.svg)

> Exposes OSC connections to the browser through WebSockets.

*Work in progress, design and interface may change frequently*

## Features

* Send messages from local OSC applications to different channels.
* Publish messages to channels and broadcast them to multiple OSC application on your machine.
* Portable cross-platform executable that acts as the Server.
* Server can be controlled remotely from clients (Browser or Node.js library).

## Example

### Send and receive messages (SuperCollider example)

This example creates a single channel called `/sclang`, and binds it to the port
4000. It also subscribes port 57120 to forward all messages published to this
channel.

```javascript
const { Client, Message } = browserglue;
const osc = new Client();

console.log("Add channel /sclang binded to udp:4000")
osc.addChannel("/sclang", 4000).then(channel => {
    // Handle messages sent to port 4000
    channel.on("message", msg => {
        console.log("Received:", msg.address, msg.args);
    });

    // Subscribe to port 57120 (default SuperCollider interpreter port)
    channel.subscribePort(57120);

    setInterval(() => {
        const now = new Date();
        const msg = new Message("/chat", 42, now.toISOString());
        channel.publish(msg);
        console.log("Publish:", msg.address, msg.args);
    }, 1000);
});
```

You can try this on SuperCollider, by running the following pieces of code:

```smalltalk
s.boot;

// Listen messages on port 51720
(
OSCdef(\test, { |msg, time, addr, recvPort|
	"Received from browser: %".format([time, msg]).postln
}, '/chat');
)

// Send every 2  seconds an OSC message to port 4000
b = NetAddr("127.0.0.1", 4000);
(
r = Routine {
	inf.do { |i|
		"Sent: /hello there! %".format(i).postln;
		b.sendMsg("/hello", "there!", i);
		2.wait;
	}
}.play;
)
```

### Multiple channels

```javascript
(async () => {
    const { Client, Message } = browserglue;
    window.bg = new Client();

    // Subscribe to all server events
    bg.on('connect', (() => console.log("[connect]")));
    bg.on('disconnect', (() => console.log("[disconnect]")));
    bg.on('change', (msg => console.log("[change]", msg)));
    bg.on('add-channel', (msg => console.log("[add-channel]", msg)));
    bg.on('remove-channel', (msg => console.log("[remove-channel]", msg)));
    bg.on('bind-port', (msg => console.log("[bind-port]", msg)));
    bg.on('subscribe-port', (msg => console.log("[subscribe-port]", msg)));
    bg.on('unsubscribe-port', (msg => console.log("[unsubscribe-port]", msg)));

    console.log("Remove all channels first");
    await bg.removeAllChannels();

    console.log("Add channel /foo binded to udp:4000")
    const channel = await bg.addChannel("/foo", 4000);

    // Handle messages
    channel.on('message', msg => {
        console.log("[/foo]", msg.address, msg.args);
    });

    // Remove channel after 3 seconds
    console.log("Remove channel /foo in 3 seconds...");
    setTimeout(() => {
        console.log("Remove channel /foo");
        channel.remove();
        console.log("Current channels:", bg.channels);
    }, 3000);

    // Add another channel
    console.log("Add channel /bar binded to udp:5000");
    const barChannel = await bg.addChannel("/bar", 5000);
    console.log("Subscribe port 5010 on /bar");
    barChannel.subscribePort(5010);
    console.log("Subscribe port 5011 on /bar");
    barChannel.subscribePort(5011);
    // Handle messages
    barChannel.on('message', msg => {
        console.log("[/bar]", msg.args);
    });

    // Remove channel after 3 seconds
    setTimeout(() => {
        console.log("Unsubscribe port 5010 on channel /bar");
        barChannel.unsubscribePort(5010);
        console.log("/bar Channel instance:", barChannel);
    }, 500);

    // List all channels
    console.log("Current channels:", bg.channels);

    setInterval(() => {
        const now = new Date();
        const msg = new Message("/myaddress/1", 42, now.toISOString());
        if (barChannel.publish(msg)) {
            console.log("Publish to /bar:", msg.address, msg.args);
        }
    }, 3000);
})();
```

## Development

After cloning repository, install dependencies with `yarn` or `yarn install` .

You can start a development server by runnig `yarn dev`. It will watch source
files for changes and restart the BrowserGlue binary script automatically.

To create production bundles for the browser and Nodejs, run `yarn build` .
This will generate a `dist/browserglue.js` library for browsers, and
`dist/browserglue.node.js` for Nodejs.

Run `yarn docs` to build documentation.

## Design

### OSC Apps Supported Use Cases

![Diagram: OSC Apps Use Cases](media/osc-apps.png)

### Internals

![Diagram: Internals](media/internals.png)

## Contributing

Bug reports and pull requests are welcome on GitHub at the [issues
page](https://github.com/munshkr/browserglue). This project is intended to be a
safe, welcoming space for collaboration, and contributors are expected to
adhere to the [Contributor Covenant](http://contributor-covenant.org) code of
conduct.

## License

This project is licensed under AGPL 3+. Refer to [LICENSE.txt](LICENSE.txt).
