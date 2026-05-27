import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function App() {
  const [roomCode, setRoomCode] = useState("");
  const [message, setMessage] = useState("");

  async function createRoom() {
    setMessage("Creating room...");

    const code = makeRoomCode();

    const { error } = await supabase.from("rooms").insert({
      code,
      max_players: 8,
      status: "lobby"
    });

    if (error) {
      setMessage("Error: " + error.message);
      return;
    }

    setRoomCode(code);
    setMessage("Room created!");
  }

  return (
    <div style={pageStyle}>
      <h1>Lorcana Table 🎴</h1>

      <div style={panelStyle}>
        <h2>Create a Room</h2>

        <button onClick={createRoom} style={buttonStyle}>
          Create Room
        </button>

        {message && <p>{message}</p>}

        {roomCode && (
          <h2>
            Room Code: <span style={{ color: "#facc15" }}>{roomCode}</span>
          </h2>
        )}
      </div>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: "#0f172a",
  color: "white",
  display: "grid",
  placeItems: "center",
  fontFamily: "Arial, sans-serif"
};

const panelStyle = {
  width: "min(90vw, 500px)",
  border: "1px solid #374151",
  borderRadius: "16px",
  padding: "24px",
  background: "#111827",
  textAlign: "center"
};

const buttonStyle = {
  padding: "12px 20px",
  borderRadius: "10px",
  border: "none",
  cursor: "pointer",
  fontWeight: "bold"
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
