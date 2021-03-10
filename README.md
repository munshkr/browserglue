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

### OSC Apps Supported Use Cases

![Diagram: OSC Apps Use Cases](docs/media/osc-apps.png)

### Internals

![Diagram: Internals](docs/media/internals.png)

## Contributing

Bug reports and pull requests are welcome on GitHub at the [issues
page](https://github.com/munshkr/browserglue). This project is intended to be a
safe, welcoming space for collaboration, and contributors are expected to
adhere to the [Contributor Covenant](http://contributor-covenant.org) code of
conduct.

## License

This project is licensed under AGPL 3+. Refer to [LICENSE.txt](LICENSE.txt).
