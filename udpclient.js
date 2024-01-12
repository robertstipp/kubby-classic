const dgram = require("dgram");
const client = dgram.createSocket("udp4");

client.on("error", (err) => {
  console.log(`client error:\n${err.stack}`);
  client.close();
});

client.on("message", (msg, rinfo) => {
  console.log(`client received: ${msg} from ${rinfo.address}:${rinfo.port}`);
});

client.bind(12345); // Bind to the port you expect to receive messages on
