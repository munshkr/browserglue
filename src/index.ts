/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import Client from "./Client";
import Channel from "./Channel";
import Server from "./Server";
import * as defaults from "./defaults";
import { Message, Bundle } from "osc-js";

const version = __VERSION__;

export { Client, Channel, Server, Message, Bundle, version, defaults };
