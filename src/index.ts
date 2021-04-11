import Client from './Client';
import Channel from './Channel';
import Server from './Server';
import * as defaults from './defaults';

declare var __VERSION__: string;

const version = __VERSION__;

export { Client, Channel, Server, version, defaults };
