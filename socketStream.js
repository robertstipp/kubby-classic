const express = require("express");
const app = express();
const cors = require("cors");
const k8s = require("@kubernetes/client-node");
const kubeSystemNamespcae = "kube-system";
app.use(cors());
const server = require("http").createServer(app);

const io = require("socket.io")(server, {
  cors: {
    // origin: ["http://localhost:3001", "http://localhost:8080"],
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
// kc.loadFromFile("./edwins.yaml");
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
const PORT = 8000;
const metricsClient = new k8s.Metrics(kc);

io.on("connection", () => {
  console.log("Connected");
});

const getPodMetrics = async () => {
  try {
    const podResponse = await metricsClient.getPodMetrics();
    const containerUsage = podResponse.items.map((pod) => pod.containers);
    return containerUsage;
  } catch (error) {
    console.log(error);
  }
};

const axios = require("axios");

async function scrapeMetrics(cadvisorUrl) {
  try {
    const response = await axios.get(cadvisorUrl);
    return response.data; // cAdvisor metrics in plain text format
  } catch (error) {
    console.error("Error scraping cAdvisor metrics:", error.message);
    return null;
  }
}

const getNodeIps = async () => {
  try {
    const response = await k8sApi.listNode();
    const nodes = response.body.items;

    const nodeIps = nodes.map((node) => {
      const addresses = node.status.addresses;
      const internalIp = addresses.find((addr) => addr.type === "InternalIP");
      return internalIp ? internalIp.address : "Unavailable";
    });

    console.log(nodeIps);
  } catch (error) {
    console.error("Error fetching node IPs:", error);
  }
};

// getNodeIps();
const cadvisorUrl = "http://10.128.0.13:4194/metrics";
scrapeMetrics(cadvisorUrl)
  .then((metrics) => {
    console.log(metrics); // Process or print metrics
  })
  .catch((error) => {
    console.log(error);
  });

getPodMetrics();

setInterval(async () => {
  try {
    const data = await getPodMetrics();
    io.emit("metrics", data);
  } catch (error) {
    console.log(error);
  }
}, 1000);

// server.listen(PORT, () => {
//   console.log(`Server listening ${PORT}`);
// });
