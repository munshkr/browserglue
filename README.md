# browserglue

![status](https://github.com/munshkr/browserglue/actions/workflows/main.yml/badge.svg)

Exposes multiple OSC connections to the browser through WebSockets

*Work in progress, design and interface is subject to change*

## Development

After cloning repository, install dependencies with `yarn` or `yarn install` .

To create bundles for the browser and Nodejs, run `yarn build` . This will generate
a `dist/browserglue.js` library for browsers, and `dist/browserglue.node.js` for Nodejs.

Run `yarn docs` to build documentation.

## Design

### JavaScript API

```javascript
var client = new browserglue.Client();

// Add a channel that will only receive messages on port 5000
client.addChannel("/onlyReceive", 5000).then(channel => {
    channel.on(message => console.log("Message from /onlyReceive:", message));
});
// this is the same as:
//  client.addChannel("/onlyReceive").then(channel => channel.bindPort(5000));

// Add channel /sendReceive, and bind to port 5000
client.addChannel("/sendReceive", 5000, 5001).then(channel => {
    // Handle messages
    channel.on(message => {
        console.log("Message from /foo", message);
    });

    // Remove channel (close) after 10 seconds
    setTimeout(async () => {
        channel.close();

        // Get new list of channels. You can also listen to the "change" event
        const channels = await client.getChannels();
        console.log("Current channels:", channels);
    }, 10000);
});

// Add another channel, this will skip binding to a port and will only send messages to port 6001 and 6002
client.addChannel("/onlySend").then(channel => {
    channel.subscribePort(6001);
    channel.subscribePort(6002);

    // Broadcast a message to subscribed ports (6001 and 6002)
    channel.broadcast("this is a message");
});

// Get all channels
client.getChannels().then(channels => console.log("Current channels:", channels));

// Listen on any event in the server: change, addChannel, removeChannel,
// bindPort, subscribePort, unsubscribePort, unsubscribeAllPorts, etc.
client.on("addChannel", event => {
    console.log(event);
})
```

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
