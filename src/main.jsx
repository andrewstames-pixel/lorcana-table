import React from "react";
import ReactDOM from "react-dom/client";

function App() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        color: "white",
        padding: "20px",
        fontFamily: "Arial, sans-serif"
      }}
    >
      <h1 style={{ textAlign: "center" }}>
        Lorcana Table 🎴
      </h1>

      <div
        style={{
          margin: "30px auto",
          maxWidth: "900px",
          border: "1px solid #374151",
          borderRadius: "16px",
          padding: "20px",
          background: "#111827"
        }}
      >
        <h2>Room: R7-K9M2</h2>
        <p>Signed in as: Player 1</p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3,1fr)",
            gap: "15px",
            marginTop: "20px"
          }}
        >
          <div style={boxStyle}>
            <h3>Hand</h3>
            <p>6 cards</p>
          </div>

          <div style={boxStyle}>
            <h3>In Play</h3>
            <p>0 cards</p>
          </div>

          <div style={boxStyle}>
            <h3>Inkwell</h3>
            <p>0 cards</p>
          </div>

          <div style={boxStyle}>
            <h3>Discard</h3>
            <p>0 cards</p>
          </div>

          <div style={boxStyle}>
            <h3>Lore</h3>
            <p>0</p>
          </div>

          <div style={boxStyle}>
            <h3>Players</h3>
            <p>1 / 8</p>
          </div>
        </div>

        <button
          style={{
            marginTop: "30px",
            padding: "12px 20px",
            borderRadius: "10px",
            border: "none",
            cursor: "pointer"
          }}
        >
          Create Room
        </button>
      </div>
    </div>
  );
}

const boxStyle = {
  border: "1px solid #374151",
  borderRadius: "10px",
  padding: "15px",
  textAlign: "center",
  background: "#1f2937"
};

ReactDOM.createRoot(
  document.getElementById("root")
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
