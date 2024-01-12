const express = require("express");
const app = express();

app.get("/events", function (req, res) {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const sendEvent = setInterval(() => {
    res.write(`data: ${JSON.stringify({ message: "Hello from server" })}\n\n`);
  }, 1000);

  req.on("close", () => {
    clearInterval(sendEvent);
  });
});

app.listen(3000, () => {
  console.log("SSE server started on port 3000");
});
