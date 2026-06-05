#!/usr/bin/env node
const dgram = require("dgram");
const os = require("os");
const crypto = require("crypto");

const MDNS_ADDRESS = "224.0.0.251";
const MDNS_PORT = 5353;
const DEFAULT_AIRPLAY_PORT = 7000;
const DEFAULT_RAOP_PORT = 5000;
const TTL_SECONDS = 120;

function parseArgs(argv) {
  const options = {
    ip: process.env.AIRLINK_ADVERTISE_IP || "",
    name: process.env.AIRLINK_ADVERTISE_NAME || `AirLink-${os.hostname()}`,
    airplayPort: Number(process.env.AIRLINK_AIRPLAY_PORT || DEFAULT_AIRPLAY_PORT),
    raopPort: Number(process.env.AIRLINK_RAOP_PORT || DEFAULT_RAOP_PORT),
    intervalMs: Number(process.env.AIRLINK_ADVERTISE_INTERVAL_MS || 5000)
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--ip" && next) {
      options.ip = next;
      index += 1;
    } else if (arg === "--name" && next) {
      options.name = next;
      index += 1;
    } else if (arg === "--port" && next) {
      options.airplayPort = Number(next);
      index += 1;
    } else if (arg === "--raop-port" && next) {
      options.raopPort = Number(next);
      index += 1;
    } else if (arg === "--interval-ms" && next) {
      options.intervalMs = Number(next);
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelpAndExit();
    }
  }

  return options;
}

function printHelpAndExit() {
  console.log(`Usage: node scripts/airplay-mdns-advertise.js --ip <LAN_IP> [options]

Options:
  --ip <LAN_IP>          IPv4 address to advertise, usually from npm run diagnose:network.
  --name <SERVICE_NAME>  Friendly service name shown in logs and DNS-SD records.
  --port <PORT>          AirPlay-like TCP port to advertise. Default: ${DEFAULT_AIRPLAY_PORT}.
  --raop-port <PORT>     RAOP-like TCP port to advertise. Default: ${DEFAULT_RAOP_PORT}.
  --interval-ms <MS>     Interval for unsolicited mDNS announcements. Default: 5000.

This is a discovery-only Phase 0 PoC. It does not receive, decrypt, or display video.
`);
  process.exit(0);
}

function isIPv4(address) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(address) && address.split(".").every(part => {
    const value = Number(part);
    return Number.isInteger(value) && value >= 0 && value <= 255;
  });
}

function normalizeDnsLabel(value) {
  return value
    .replace(/[^A-Za-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50) || "airlink-phase0";
}

function fqdn(name) {
  return name.endsWith(".") ? name : `${name}.`;
}

function encodeName(name) {
  const labels = fqdn(name).split(".").filter(Boolean);
  const chunks = labels.map(label => {
    const bytes = Buffer.from(label, "utf8");
    if (bytes.length > 63) {
      throw new Error(`DNS label is too long: ${label}`);
    }
    return Buffer.concat([Buffer.from([bytes.length]), bytes]);
  });
  return Buffer.concat([...chunks, Buffer.from([0])]);
}

function uint16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16BE(value & 0xffff, 0);
  return buffer;
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  return buffer;
}

function record(name, type, dnsClass, ttl, rdata) {
  return Buffer.concat([
    encodeName(name),
    uint16(type),
    uint16(dnsClass),
    uint32(ttl),
    uint16(rdata.length),
    rdata
  ]);
}

function ptrRecord(name, target) {
  return record(name, 12, 0x0001, TTL_SECONDS, encodeName(target));
}

function srvRecord(name, port, target) {
  return record(name, 33, 0x8001, TTL_SECONDS, Buffer.concat([
    uint16(0),
    uint16(0),
    uint16(port),
    encodeName(target)
  ]));
}

function txtRecord(name, entries) {
  const rdata = Buffer.concat(entries.map(entry => {
    const bytes = Buffer.from(entry, "utf8");
    if (bytes.length > 255) {
      throw new Error(`TXT entry is too long: ${entry.slice(0, 40)}...`);
    }
    return Buffer.concat([Buffer.from([bytes.length]), bytes]);
  }));
  return record(name, 16, 0x8001, TTL_SECONDS, rdata);
}

function aRecord(name, ip) {
  const rdata = Buffer.from(ip.split(".").map(Number));
  return record(name, 1, 0x8001, TTL_SECONDS, rdata);
}

function buildResponse(records) {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(0, 0); // transaction id is zero for multicast responses
  header.writeUInt16BE(0x8400, 2); // response + authoritative answer
  header.writeUInt16BE(0, 4); // questions
  header.writeUInt16BE(records.length, 6); // answers
  header.writeUInt16BE(0, 8); // authorities
  header.writeUInt16BE(0, 10); // additionals
  return Buffer.concat([header, ...records]);
}

function buildTxtEntries({ deviceId, stableId }) {
  return [
    "deviceid=" + deviceId,
    "features=0x5A7FFFF7,0x1E",
    "flags=0x44",
    "model=AirLinkPhase0,1",
    "srcvers=220.68",
    "vv=2",
    "pi=" + stableId,
    "note=phase0-discovery-only"
  ];
}

function buildRaopTxtEntries({ deviceId }) {
  return [
    "txtvers=1",
    "ch=2",
    "cn=0,1,2,3",
    "et=0,1",
    "md=0,1,2",
    "pw=false",
    "sr=44100",
    "ss=16",
    "tp=UDP",
    "vn=65537",
    "vs=220.68",
    "am=AirLinkPhase0,1",
    "sf=0x4",
    "deviceid=" + deviceId
  ];
}

function createRecords(options) {
  const safeHost = normalizeDnsLabel(os.hostname());
  const hostName = `${safeHost}.local`;
  const instance = `${options.name}._airplay._tcp.local`;
  const raopInstance = `${options.deviceId.replace(/:/g, "")}@${options.name}._raop._tcp.local`;

  return {
    hostName,
    instance,
    raopInstance,
    records: [
      ptrRecord("_services._dns-sd._udp.local", "_airplay._tcp.local"),
      ptrRecord("_services._dns-sd._udp.local", "_raop._tcp.local"),
      ptrRecord("_airplay._tcp.local", instance),
      srvRecord(instance, options.airplayPort, hostName),
      txtRecord(instance, buildTxtEntries(options)),
      ptrRecord("_raop._tcp.local", raopInstance),
      srvRecord(raopInstance, options.raopPort, hostName),
      txtRecord(raopInstance, buildRaopTxtEntries(options)),
      aRecord(hostName, options.ip)
    ]
  };
}

function createGoodbyeRecords(options) {
  const { hostName, instance, raopInstance } = createRecords(options);
  return [
    record("_airplay._tcp.local", 12, 0x0001, 0, encodeName(instance)),
    record(instance, 33, 0x8001, 0, Buffer.concat([uint16(0), uint16(0), uint16(options.airplayPort), encodeName(hostName)])),
    record(instance, 16, 0x8001, 0, Buffer.from([0])),
    record("_raop._tcp.local", 12, 0x0001, 0, encodeName(raopInstance)),
    record(raopInstance, 33, 0x8001, 0, Buffer.concat([uint16(0), uint16(0), uint16(options.raopPort), encodeName(hostName)])),
    record(raopInstance, 16, 0x8001, 0, Buffer.from([0])),
    record(hostName, 1, 0x8001, 0, Buffer.from(options.ip.split(".").map(Number)))
  ];
}

function formatNow() {
  return new Date().toISOString();
}

function logSection(title) {
  console.log(`\n## ${title}`);
}

function logStartup(options, dnsRecords) {
  logSection("AirPlay-like mDNS advertisement PoC");
  console.log(`Started at: ${formatNow()}`);
  console.log(`Hostname: ${os.hostname()}`);
  console.log(`Advertised host: ${dnsRecords.hostName}`);
  console.log(`Advertised IP: ${options.ip}`);
  console.log(`Friendly name: ${options.name}`);
  console.log(`AirPlay-like service: ${dnsRecords.instance}`);
  console.log(`AirPlay-like port: ${options.airplayPort}`);
  console.log(`RAOP-like service: ${dnsRecords.raopInstance}`);
  console.log(`RAOP-like port: ${options.raopPort}`);
  console.log(`mDNS multicast target: ${MDNS_ADDRESS}:${MDNS_PORT}`);
  console.log(`Announcement interval: ${options.intervalMs}ms`);

  logSection("Important limitations");
  console.log("- This only sends Bonjour/mDNS DNS-SD advertisements for Phase 0 discovery testing.");
  console.log("- It does not implement AirPlay session handling, video receive/decrypt/decode, or display.");
  console.log("- Seeing this service in iPhone Screen Mirroring is not guaranteed; use logs for investigation.");
}

function logTroubleshooting() {
  logSection("If the service does not appear on iPhone");
  console.log("- Confirm --ip matches the Windows LAN IP from npm run diagnose:network.");
  console.log("- Confirm iPhone and PC are on the same non-guest Wi-Fi/LAN and VPN is off.");
  console.log("- Allow Node.js through Windows Defender Firewall for private networks.");
  console.log("- Check UDP 5353 multicast and the advertised TCP ports in local Firewall/router settings.");
  console.log("- If port 5353 cannot bind, another Bonjour/mDNS service may already be using it.");
}

function sendPacket(socket, packet, label) {
  socket.send(packet, 0, packet.length, MDNS_PORT, MDNS_ADDRESS, error => {
    if (error) {
      console.error(`[${formatNow()}] Failed to send ${label}: ${error.message}`);
      logTroubleshooting();
      return;
    }
    console.log(`[${formatNow()}] Sent ${label} (${packet.length} bytes)`);
  });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!isIPv4(options.ip)) {
    console.error("Missing or invalid --ip <LAN_IP>.");
    console.error("Run npm run diagnose:network first, then pass a likely same-LAN IPv4 address.");
    process.exit(1);
  }
  if (!Number.isInteger(options.airplayPort) || options.airplayPort <= 0 || options.airplayPort > 65535) {
    console.error("Invalid --port value. Use a TCP port between 1 and 65535.");
    process.exit(1);
  }
  if (!Number.isInteger(options.raopPort) || options.raopPort <= 0 || options.raopPort > 65535) {
    console.error("Invalid --raop-port value. Use a TCP port between 1 and 65535.");
    process.exit(1);
  }

  options.name = normalizeDnsLabel(options.name);
  options.deviceId = crypto.createHash("sha1").update(`${os.hostname()}-${options.ip}`).digest("hex").slice(0, 12).match(/../g).join(":").toUpperCase();
  options.stableId = crypto.createHash("sha1").update(`airlink-${os.hostname()}-${options.ip}`).digest("hex").replace(/(.{8})(.{4})(.{4})(.{4})(.{12}).*/, "$1-$2-$3-$4-$5");

  const dnsRecords = createRecords(options);
  const announcementPacket = buildResponse(dnsRecords.records);
  const goodbyePacket = buildResponse(createGoodbyeRecords(options));
  const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
  let interval = null;
  let shuttingDown = false;

  socket.on("error", error => {
    console.error(`[${formatNow()}] mDNS socket error: ${error.message}`);
    logTroubleshooting();
    process.exitCode = 1;
  });

  socket.on("message", (message, remote) => {
    if (message.length < 12) return;

    const flags = message.readUInt16BE(2);
    const isResponse = (flags & 0x8000) !== 0;
    if (isResponse) return;

    const ascii = message.toString("latin1");
    if (ascii.includes("_airplay") || ascii.includes("_raop") || ascii.includes("_services._dns-sd")) {
      console.log(`[${formatNow()}] mDNS query-like packet from ${remote.address}:${remote.port} (${message.length} bytes)`);
      sendPacket(socket, announcementPacket, "response to matching query");
    }
  });

  socket.bind(MDNS_PORT, () => {
    try {
      socket.addMembership(MDNS_ADDRESS, options.ip);
    } catch (error) {
      console.error(`[${formatNow()}] Could not join mDNS multicast group on ${options.ip}: ${error.message}`);
      logTroubleshooting();
    }

    try {
      socket.setMulticastInterface(options.ip);
    } catch (error) {
      console.error(`[${formatNow()}] Could not set multicast interface to ${options.ip}: ${error.message}`);
      logTroubleshooting();
    }

    socket.setMulticastTTL(255);
    socket.setMulticastLoopback(false);
    logStartup(options, dnsRecords);
    logTroubleshooting();
    sendPacket(socket, announcementPacket, "initial announcement");
    interval = setInterval(() => {
      sendPacket(socket, announcementPacket, "periodic announcement");
    }, options.intervalMs);
  });

  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[${formatNow()}] Received ${signal}; sending goodbye records and closing mDNS socket...`);
    if (interval) clearInterval(interval);
    sendPacket(socket, goodbyePacket, "goodbye announcement");
    setTimeout(() => {
      socket.close(() => {
        console.log(`[${formatNow()}] mDNS advertiser stopped cleanly.`);
        process.exit(0);
      });
    }, 250);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main();
