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

const topNodes = async () => {
  metricsClient
    .getNodeMetrics()
    .then((nodeMetricsList) => {
      console.log(
        nodeMetricsList.items.map((item) => `${item.usage.toString()}`)
      );
    })
    .catch((error) => {
      console.error(error);
    });
};

const getNodesPodsContainers = async () => {
  let nodesWithPods = [];
  try {
    const nodes = await k8sApi.listNode();
    for (let node of nodes.body.items) {
      let nodeDetail = {
        nodeName: node.metadata.name,
        pods: [],
      };

      // List all pods for a given node
      const pods = await k8sApi.listPodForAllNamespaces(
        null,
        null,
        null,
        `spec.nodeName=${node.metadata.name}`
      );

      for (let pod of pods.body.items) {
        // console.log(pod);
        let podDetail = {
          podName: pod.metadata.name,
          containers: pod.spec.containers.map((container) => container.name),
        };
        nodeDetail.pods.push(podDetail);
      }

      nodesWithPods.push(nodeDetail);
    }
  } catch (err) {
    console.log(err);
  }

  return nodesWithPods;
};

const getNodeStats = async () => {
  const response = await metricsClient.getNodeMetrics();
  const { items } = response;
  const nodes = [];
  for (const node of items) {
    nodes.push({
      nodeName: node.metadata.name,
      usage: node.usage,
    });
  }
  return nodes;
};

const getPodStats = async () => {
  const response = await metricsClient.getPodMetrics();
  const { items } = response;
  const pods = [];
  for (const pod of items) {
    const podObj = {
      podName: pod.metadata.name,
      containers: [],
    };

    for (const container of pod.containers) {
      const containerObj = {
        name: container.name,
        usage: container.usage,
      };
      podObj.containers.push(containerObj);
    }
    pods.push(podObj);
  }

  return pods;
};

const getClusterInfo = async () => {
  const servicesResponse = await k8sApi.listServiceForAllNamespaces();
  const serviceToPodsMapping = {};

  const promises = servicesResponse.body.items.map((service) => {
    return getServicePodsMapping(
      service.metadata.name,
      service.metadata.namespace
    ).then((pods) => {
      serviceToPodsMapping[service.metadata.name] = pods;
    });
  });

  const result = await k8sApi.listPodForAllNamespaces();
  const { items } = result.body;
  const nodes = [];
  const namespaces = {};
  for (const pod of items) {
    if (namespaces[pod.metadata.namespace] === undefined) {
      namespaces[pod.metadata.namespace] = [pod.metadata.name];
    } else {
      namespaces[pod.metadata.namespace].push(pod.metadata.name);
    }

    const { nodeName } = pod.spec;
    let nodeIndex = nodes.findIndex((el) => el.nodeName === nodeName);
    if (nodeIndex === -1) {
      nodes.push({ nodeName, pods: [] });
    }
    nodeIndex = nodeIndex === -1 ? nodes.length - 1 : nodeIndex;
    const { name: podName } = pod.metadata;
    const podObj = {
      namespace: pod.metadata.namespace,
      name: podName,
      containers: [],
    };

    for (const container of pod.spec.containers) {
      const containerObj = {
        name: container.name,
        image: container.image,
      };
      podObj.containers.push(containerObj);
    }

    nodes[nodeIndex].pods.push(podObj);
  }

  await Promise.all(promises)
    .catch((error) => {
      console.error("Error fetching service to pods mapping:", error);
        });
    // (async function fetchData() {
    //     try {
    //       await Promise.all(promises);
    //       // Now all async operations are complete, and we can safely return the fully populated object.
    //         // return { nodes, namespaces, serviceToPodsMapping };
    //         console.log(serviceToPodsMapping)
    //     } catch (error) {
    //       console.error("Error fetching service to pods mapping:", error);
    //       // Handle error appropriately. Maybe return null or throw an error.
    //     }
    //   })()

  return { nodes, namespaces, serviceToPodsMapping };
};

const getNodeResources = async () => {
  const result = await k8sApi.listNode();
  const { items } = result.body;

  const nodeArr = items.map((node) => {
    return {
      nodeName: node.metadata.name,
      resources: {
        memory: {
          allocatable: node.status.allocatable.memory,
          capacity: node.status.capacity.memory,
          requested: 0,
        },
        cpu: {
          allocatable: node.status.allocatable.cpu,
          capacity: node.status.capacity.cpu,
          requested: 0,
        },
        pods: {
          allocatable: node.status.allocatable.pods,
          capacity: node.status.capacity.pods,
          requested: 0,
        },
      },
    };
  });
  nodeArr.forEach((node) => console.log(node.resources));
  return nodeArr;
  for (const node of items) {
    const { name } = node.metadata;
    const { allocatable, capacity } = node.status;
    const nodeObj = {
      nodeName: name,
      memory: {
        allocatable: allocatable.memory,
        capacity: capacity.memory,
      },
      cpu: {
        allocatable: allocatable.cpu,
        capacity: capacity.cpu,
      },
      pods: {
        allocatable: allocatable.pods,
        capacity: capacity.pods,
      },
    };
    const resourcesArray = [
      { Resource: "CPU", Allocatable: allocatable.cpu, Capacity: capacity.cpu },
      {
        Resource: "Memory",
        Allocatable: allocatable.memory,
        Capacity: capacity.memory,
      },
      {
        Resource: "Pods",
        Allocatable: allocatable.pods,
        Capacity: capacity.pods,
      },
    ];
  }
};

const getPodResources = async () => {
  const result = await k8sApi.listPodForAllNamespaces();
  const { items } = result.body;
  const nodes = await getNodeResources();
  for (const pod of items) {
    const node =
      nodes[nodes.findIndex((node) => node.nodeName === pod.spec.nodeName)];
    if (node.pods === undefined) node.pods = [];
    const podObj = {
      podName: pod.metadata.name,
      containers: [],
    };

    for (let i = 0; i < pod.spec.containers.length; i++) {
      const containerObj = {
        name: pod.spec.containers[i].name,
        image: pod.spec.containers[i].image,
        resourcesRequested: pod.spec.containers[i].resources.requests,
        // CAN BE MADE BETTER
        state: pod.status.containerStatuses[i].state.running ? true : false,
      };
      podObj.containers.push(containerObj);
    }

    node.pods.push(podObj);
    node.resources.pods.usage += 1;
  }

  return nodes;
};

const getClusterMetrics = async () => {
  const result = await k8sApi.listPodForAllNamespaces();
  const podMap = {};
  const nodeMap = {};

  result.body.items.map((pod) => {
    const nodeName = pod.spec.nodeName;
    if (nodeMap[nodeName] === undefined) {
      nodeMap[nodeName] = { cpuUsage: 0, memUsage: 0, pods: [] };
    }
    const podObj = {
      name: pod.metadata.name,
      nameSpace: pod.metadata.namespace,
      nodeName: nodeName,
      nodeRef: nodeMap[nodeName],
    };
    // nodeMap[nodeName].pods.push(podObj);

    podMap[podObj.name] = podObj;
  });

  const response = await metricsClient.getPodMetrics();
  response.items.forEach((pod) => {
    const podName = pod.metadata.name;
    const podUsageObj = {
      podName: podName,
      cpuUsage: 0,
      memUsage: 0,
      containerUsage: pod.containers,
    };
    pod.containers.forEach((container) => {
      const { name, cpu, memory } = container.usage;
      const cpuNum =
        cpu.at(-1) === "u"
          ? Number(cpu.slice(0, -1)) * 1e3
          : Number(cpu.slice(0, -1));
      const memoryNum = Number(memory.slice(0, -2));
      podUsageObj.cpuUsage += cpuNum;
      podUsageObj.memUsage += memoryNum;
    });
    const podMapRef = podMap[podName];
    podMapRef.usage = podUsageObj;
    nodeMap[podMapRef.nodeName].pods.push(podUsageObj);
    nodeMap[podMapRef.nodeName].cpuUsage += podUsageObj.cpuUsage;
    nodeMap[podMapRef.nodeName].memUsage += podUsageObj.memUsage;
    podMap[podName].usage = podUsageObj;
  });
  const clusterUsage = [];
  for (const [key, value] of Object.entries(nodeMap)) {
    const pods = nodeMap[key].pods;
    const nodeCPUUsage = nodeMap[key].cpuUsage;
    const nodeMemUsage = nodeMap[key].memUsage;
    for (const pod of pods) {
      pod.cpuPct = (pod.cpuUsage / nodeCPUUsage) * 100;
      pod.memPct = (pod.memUsage / nodeMemUsage) * 100;
    }
    const nodeObj = { name: key, ...nodeMap[key] };
    clusterUsage.push(nodeObj);
  }
  return clusterUsage;
};

const getFlatClusterMetrics = async () => {
  const result = await k8sApi.listPodForAllNamespaces();
  const podMap = {};
  const nodeMap = {};

  result.body.items.map((pod) => {
    const nodeName = pod.spec.nodeName;
    if (nodeMap[nodeName] === undefined) {
      nodeMap[nodeName] = { cpuUsage: 0, memUsage: 0, pods: [] };
    }
    const podObj = {
      name: pod.metadata.name,
      nameSpace: pod.metadata.namespace,
      nodeName: nodeName,
      nodeRef: nodeMap[nodeName],
    };
    // nodeMap[nodeName].pods.push(podObj);

    podMap[podObj.name] = podObj;
  });

  const response = await metricsClient.getPodMetrics();
  const clusterUsage = {};
  response.items.forEach((pod) => {
    const podName = pod.metadata.name;
    const podUsageObj = {
      podName: podName,
      cpuUsage: 0,
      memUsage: 0,
      containerUsage: pod.containers,
    };
    pod.containers.forEach((container) => {
      const { cpu, memory } = container.usage;
      const { name } = container;
      const containerKey = `${name}/${podName}`;
      const cpuNum =
        cpu.at(-1) === "u"
          ? Number(cpu.slice(0, -1)) * 1e3
          : Number(cpu.slice(0, -1));
      const memoryNum = Number(memory.slice(0, -2));
      clusterUsage[containerKey] = {
        cpuUsage: cpuNum,
        memUsage: memoryNum,
        type: "container",
      };
      podUsageObj.cpuUsage += cpuNum;
      podUsageObj.memUsage += memoryNum;
    });
    const podMapRef = podMap[podName];
    pod.containers.forEach((container) => {
      const { name } = container;
      const containerKey = `${name}/${podName}`;
      clusterUsage[containerKey].cpuUsagePct =
        (clusterUsage[containerKey].cpuUsage / podUsageObj.cpuUsage) * 100 || 0;
      clusterUsage[containerKey].memUsagePct =
        (clusterUsage[containerKey].memUsage / podUsageObj.memUsage) * 100;
    });
    podMapRef.usage = podUsageObj;
    nodeMap[podMapRef.nodeName].pods.push(podUsageObj);
    nodeMap[podMapRef.nodeName].cpuUsage += podUsageObj.cpuUsage;
    nodeMap[podMapRef.nodeName].memUsage += podUsageObj.memUsage;
    podMap[podName].usage = podUsageObj;
  });

  for (const [key, value] of Object.entries(nodeMap)) {
    const pods = nodeMap[key].pods;
    const nodeCPUUsage = nodeMap[key].cpuUsage;
    const nodeMemUsage = nodeMap[key].memUsage;
    for (const pod of pods) {
      pod.cpuPct = (pod.cpuUsage / nodeCPUUsage) * 100;
      pod.memPct = (pod.memUsage / nodeMemUsage) * 100;
      clusterUsage[pod.podName] = {
        cpuUsage: pod.cpuUsage,
        cpuUsagePct: pod.cpuPct,
        memUsage: pod.memUsage,
        memUsagePct: pod.memPct,
        type: "pod",
      };
    }
    const nodeObj = { name: key, ...nodeMap[key] };
    clusterUsage[key] = {
      cpuUsage: nodeObj.cpuUsage,
      memUsage: nodeObj.memUsage,
      type: "node",
    };
  }

  const nodeInfo = await k8sApi.listNode();
  for (const node of nodeInfo.body.items) {
    const { cpu, memory, pods } = node.status.allocatable;
    const { name } = node.metadata;
    const cpuNum = Number(cpu.slice(0, -1)) * 1e6;
    const memNum = Number(memory.slice(0, -2));

    clusterUsage[name].cpuUtilPct =
      (clusterUsage[name].cpuUsage / cpuNum) * 100;
    clusterUsage[name].memUtilPct =
      (clusterUsage[name].memUsage / memNum) * 100;
  }
  return clusterUsage;
};

const getContainerLog = async (podName, nameSpace, containerName) => {
  try {
    const response = await k8sApi.readNamespacedPodLog(
      podName,
      nameSpace,
      containerName
    );
    // console.log(response.body);
  } catch (error) {
    console.log(error);
  }
};

// async function findPodsForService(serviceName, namespace) {
//     console.log(`Service ${serviceName} in ${namespace} namespace:`)
//     try {
//         // Fetch the service to get its selector
//         const { body: service } = await k8sApi.readNamespacedService(serviceName, namespace);
//         const selector = service.spec.selector;

//         // Convert selector object into a selector string
//         const labelSelector = Object.entries(selector).map(([key, value]) => `${key}=${value}`).join(',');

//         // Use the selector to find pods
//         const { body: { items: pods } } = await k8sApi.listNamespacedPod(namespace, undefined, undefined, undefined, undefined, labelSelector);

//         // Mapping of service to its pods
//         // console.log(`Service ${serviceName} in ${namespace} namespace has the following pods:`);
//         pods.forEach(pod => {

//             console.log(`- ${pod.metadata.name}`);
//         });
//     } catch (error) {
//         console.error('Error fetching service or pods:', error);
//     }
// }

async function getServicePodsMapping(serviceName, namespace) {
  try {
    // Fetch the service to get its selector
    const { body: service } = await k8sApi.readNamespacedService(
      serviceName,
      namespace
    );
    const selector = service.spec.selector;

    // Convert selector object into a selector string
    if (!selector) {
      return {};
    }
      
    const labelSelector = Object.entries(selector)
      .map(([key, value]) => `${key}=${value}`)
      .join(",");

    // Use the selector to find pods
    const {
      body: { items: pods },
    } = await k8sApi.listNamespacedPod(
      namespace,
      undefined,
      undefined,
      undefined,
      undefined,
      labelSelector
    );

    return pods.map((pod) => pod.metadata.name);
  } catch (error) {
    console.error("Error fetching service or pods:", error);
    return {};
  }
}

app.get("/", (req, res) => {
  res.send("KUBBY --- A faros backend");
});

app.get("/clusterInfo", async (req, res) => {
  try {
    const data = await getClusterInfo();
    res.status(200).json(data);
  } catch (err) {
    console.log(err);
  }
});

app.get("/clusterResources", async (req, res) => {
  const data = await getPodResources();
  res.status(200).json(data);
});

app.get("/nodeStats", async (req, res) => {
  try {
    const data = await getNodeStats();
    res.status(200).json(data);
  } catch (err) {
    console.log(err);
  }
});

app.get("/podStats", async (req, res) => {
  try {
    const data = await getPodStats();
    res.status(200).json(data);
  } catch (err) {
    console.log(err);
  }
});

app.get("/clusterMetrics", async (req, res) => {
  try {
    const data = await getClusterMetrics();
    res.status(200).json(data);
  } catch (err) {
    console.log(err);
  }
});

app.get("/containerLog", async (req, res) => {
  const { podName, nameSpace, containerName } = req.query;

  try {
    const response = await getContainerLog(podName, nameSpace, containerName);
  } catch (error) {
    console.log(error);
  }
});

app.get("/clusterMetricsMap", async (req, res) => {
  try {
    const data = await getFlatClusterMetrics();
    res.status(200).json(data);
  } catch (err) {
    console.log(err);
  }
});

const watch = new k8s.Watch(kc);
const namespace = "default"; // Define your namespace

io.on("connection", () => {
  console.log("Connected");
});

function startWatching() {
  watch
    .watch(
      `/api/v1/namespaces/${namespace}/pods`, // Watch specific namespace
      {},
      (type, apiObj, watchObj) => {
        if (type === "ADDED") {
          //   console.log("New Pod Added:", apiObj.metadata.name);
          io.emit("podAdded", apiObj);
        } else if (type === "MODIFIED") {
          //   console.log("Pod Modified:", apiObj.metadata.name);
          io.emit("podModified", apiObj);
        } else if (type === "DELETED") {
          //   console.log("Pod Deleted:", apiObj.metadata.name);
          io.emit("podDeleted", apiObj);
        }
      },
      (err) => {
        console.error(err);
        io.emit("watchError", err);
        setTimeout(startWatching, 5000);
      }
    )
    .then((req) => {
      console.log("Watching for changes in namespace:", namespace);
    })
    .catch((err) => {
      console.error("Error starting the watch:", err);
      ub -= gt;
      setTimeout(startWatching, 5000);
    });
}
startWatching();

// Express
server.listen(PORT, () => {
  console.log(`Server listening ${PORT}`);
});

// async function run() {
//   //   console.log("running...");
//   const OBJECT = await getClusterInfo();
//   console.log(OBJECT);
// }
// run();
