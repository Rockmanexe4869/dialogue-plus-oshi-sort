#!/usr/bin/env node
const os = require("os");
const dns = require("dns");

function isPrivateIPv4(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some(part => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = parts;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

function ipv4Network(address, cidr) {
  if (typeof cidr !== "number" || cidr < 0 || cidr > 32) {
    return "unknown";
  }

  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some(part => Number.isNaN(part))) {
    return "unknown";
  }

  const ipNumber = octets.reduce((acc, part) => ((acc << 8) | part) >>> 0, 0);
  const mask = cidr === 0 ? 0 : (0xffffffff << (32 - cidr)) >>> 0;
  const network = (ipNumber & mask) >>> 0;
  const networkOctets = [24, 16, 8, 0].map(shift => (network >>> shift) & 255);
  return `${networkOctets.join(".")}/${cidr}`;
}

function prefixLengthFromNetmask(netmask) {
  if (!netmask) return null;

  const octets = netmask.split(".").map(Number);
  if (octets.length !== 4 || octets.some(part => Number.isNaN(part) || part < 0 || part > 255)) {
    return null;
  }

  const binary = octets.map(part => part.toString(2).padStart(8, "0")).join("");
  const firstZero = binary.indexOf("0");
  const prefix = firstZero === -1 ? 32 : firstZero;
  const expected = `${"1".repeat(prefix)}${"0".repeat(32 - prefix)}`;
  return binary === expected ? prefix : null;
}

function collectInterfaces() {
  const interfaces = os.networkInterfaces();
  return Object.entries(interfaces).flatMap(([name, entries]) => {
    return (entries || []).map(entry => {
      const cidr = entry.family === "IPv4" ? prefixLengthFromNetmask(entry.netmask) : null;
      return {
        name,
        family: entry.family,
        address: entry.address,
        netmask: entry.netmask || null,
        cidr,
        network: entry.family === "IPv4" ? ipv4Network(entry.address, cidr) : "n/a",
        internal: entry.internal,
        privateIPv4: entry.family === "IPv4" ? isPrivateIPv4(entry.address) : false,
        mac: entry.mac
      };
    });
  });
}

function printSection(title) {
  console.log(`\n## ${title}`);
}

function printHostSummary() {
  printSection("Host");
  console.log(`Hostname: ${os.hostname()}`);
  console.log(`Platform: ${os.platform()} ${os.release()} (${os.arch()})`);
  console.log(`Node.js: ${process.version}`);
  console.log(`Working directory: ${process.cwd()}`);
}

function printInterfaces(interfaces) {
  printSection("Network interfaces");

  if (interfaces.length === 0) {
    console.log("No network interfaces were reported by the OS.");
    return;
  }

  interfaces.forEach((entry, index) => {
    console.log(`[${index + 1}] ${entry.name}`);
    console.log(`    family: ${entry.family}`);
    console.log(`    address: ${entry.address}`);
    console.log(`    netmask: ${entry.netmask || "n/a"}`);
    console.log(`    network: ${entry.network}`);
    console.log(`    internal: ${entry.internal ? "yes" : "no"}`);
    console.log(`    privateIPv4: ${entry.privateIPv4 ? "yes" : "no"}`);
    console.log(`    mac: ${entry.mac}`);
  });
}

function printLanCandidates(interfaces) {
  const candidates = interfaces.filter(entry => entry.family === "IPv4" && !entry.internal && entry.privateIPv4);

  printSection("Likely same-LAN candidates");
  if (candidates.length === 0) {
    console.log("No external private IPv4 address was found.");
    console.log("Before mDNS/Bonjour testing, connect this PC to the same Wi-Fi/LAN as the iPhone and rerun this script.");
    return;
  }

  candidates.forEach(entry => {
    console.log(`- ${entry.name}: ${entry.address} (${entry.network})`);
  });

  console.log("\nUse these addresses to compare with the iPhone's Wi-Fi IP/subnet.");
  console.log("For mDNS/Bonjour testing, prefer a simple private Wi-Fi without VPN, guest Wi-Fi, or AP isolation.");
}

function printDnsLookup() {
  printSection("Hostname lookup");
  dns.lookup(os.hostname(), { all: true }, (error, addresses) => {
    if (error) {
      console.log(`Could not resolve local hostname via dns.lookup: ${error.message}`);
    } else if (addresses.length === 0) {
      console.log("Local hostname lookup returned no addresses.");
    } else {
      addresses.forEach(result => {
        console.log(`- ${result.address} (IPv${result.family})`);
      });
    }

    printChecklistHints();
  });
}

function printChecklistHints() {
  printSection("Pre-mDNS checklist hints");
  console.log("- Confirm the iPhone and this PC are on the same Wi-Fi/LAN.");
  console.log("- Disable VPN on both devices during the first test.");
  console.log("- Use a private/trusted Windows network profile where possible.");
  console.log("- Check Windows Defender Firewall rules before testing UDP 5353 mDNS.");
  console.log("- Avoid guest Wi-Fi, AP isolation, and enterprise networks for the first PoC.");
}

function main() {
  const interfaces = collectInterfaces();
  printHostSummary();
  printInterfaces(interfaces);
  printLanCandidates(interfaces);
  printDnsLookup();
}

main();
