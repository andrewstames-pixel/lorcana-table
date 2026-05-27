import React from "react";
import ReactDOM from "react-dom/client";

function App() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      background: "#111827",
      color: "white",
      fontFamily: "Arial"
    }}>
      <div style={{textAlign:"center"}}>
        <h1>Lorcana Table</h1>
        <p>Your multiplayer card site is coming online 🎉</p>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
