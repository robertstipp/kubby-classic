const EventSource = require("eventsource");
const eventSource = new EventSource("http://localhost:3000/events");

eventSource.onmessage = function (event) {
  console.log("Message:", event.data);
};

eventSource.onerror = function (err) {
  console.error("EventSource failed:", err);
};
