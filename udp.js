const k8s = require("@kubernetes/client-node");
const kubeSystemNamespcae = "kube-system";
const dgram = require("dgram");
const server = dgram.createSocket("udp4");

const CLIENT_HOST = "localhost"; // Client's host
const CLIENT_PORT = 12345; // Client's port

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
const metricsClient = new k8s.Metrics(kc);

const getPodMetrics = async () => {
  try {
    const podResponse = await metricsClient.getPodMetrics();
    const containerUsage = podResponse.items.map((pod) => pod.containers);
    return containerUsage;
  } catch (error) {
    console.log(error);
  }
};

server.on("listening", () => {
  // Server address it’s using to listen

  const address = server.address();

  console.log(
    "Listening to ",
    "Address: ",
    address.address,
    "Port: ",
    address.port
  );
});

server.on("message", (message, info) => {
  console.log("Message", message.toString());

  const response = Buffer.from("Message Received");

  //sending back response to client

  server.send(response, info.port, info.address, (err) => {
    if (err) {
      console.error("Failed to send response !!");
    } else {
      console.log("Response send Successfully");
    }
  });
});

setInterval(async () => {
  try {
    const data = await getPodMetrics();

    const message = Buffer.from(JSON.stringify(data));
    server.send(message, 0, message.length, CLIENT_PORT, CLIENT_HOST, (err) => {
      if (err) console.error(err);
      console.log("Metrics sent to " + CLIENT_HOST + ":" + CLIENT_PORT);
    });
  } catch (error) {
    console.error("Error fetching metrics:", error);
  }
}, 1000);
