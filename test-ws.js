const WebSocket = require("ws");

const ORDER_ID = "9071c091-de50-426e-afa7-e79796d458c0";
const TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImUxZDQyYWU2LTc4MTktNGJlYy04YTVhLTIzYTU4OWM0OTlmYiIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzc0NjA4NjI2LCJleHAiOjE3NzQ2MTIyMjZ9.1y-9_QCvT4Qx_Kpsox8e0IpqqxoDlomHMfkLQYXQcuU";

const url =
  "ws://localhost:5000/api/orders/" + ORDER_ID + "/track/ws?token=" + TOKEN;
console.log("Connecting to:", url);

const ws = new WebSocket(url);

ws.on("open", function () {
  console.log("Connected!");
});
ws.on("message", function (data) {
  console.log("Data:", JSON.parse(data));
});
ws.on("error", function (err) {
  console.error("Error:", err.message);
});
ws.on("close", function (code) {
  console.log("Closed with code:", code);
});
