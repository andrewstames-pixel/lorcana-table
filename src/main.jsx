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
  const [username, setUsername] = useState("");
  const [createdRoomCode, setCreatedRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [currentRoom, setCurrentRoom] = useState(null);
  const [message, setMessage] = useState("");

  function requireUsername() {
    if (!username.trim()) {
      setMessage("Enter your username first.");
      return false;
    }
    return true;
  }

  async function createRoom() {
    if (!requireUsername()) return;

    setMessage("Creating room...");
    const code = makeRoomCode();

    const { data, error } = await supabase
      .from("rooms")
      .insert({ code, max_players: 8, status: "lobby" })
      .select()
      .single();

    if (error) {
      setMessage("Error: " + error.message);
      return;
    }

    setCreatedRoomCode(code);
    setCurrentRoom(data);
    setMessage("Room created!");
  }

  async function joinRoom() {
    if (!requireUsername()) return;

    const code = joinCode.trim().toUpperCase();

    if (!code) {
      setMessage("Enter a room code first.");
      return;
    }

    setMessage("Looking for room...");

    const { data, error } = await supabase
      .from("rooms")
      .select("*")
      .eq("code", code)
      .single();

    if (error || !data) {
      setMessage("Room not found.");
      return;
    }

    setCurrentRoom(data);
    setMessage(`Joined room ${data.code}!`);
  }

  function leaveRoom() {
    setCurrentRoom(null);
    setJoinCode("");
    setMessage("Left room.");
  }

  if (currentRoom) {
    const players = [username.trim(), "Open Seat", "Open Seat", "Open Seat", "Open Seat", "Open Seat"];

    return (
      <div style={pageStyle}>
        <div style={roomPanelStyle}>
          <h1>Lorcana Table 🎴</h1>
          <h2>
            Room: <span style={{ color: "#facc15" }}>{currentRoom.code}</span>
          </h2>
          <p>
            You are playing as:{" "}
            <strong style={{ color: "#93c5fd" }}>{username}</strong>
          </p>

          <div style={tableStyle}>
            {players.map((player, index) => (
              <div key={index} style={seatStyle}>
                {player}
              </div>
            ))}

            <div style={centerStyle}>
              <h2>Shared Table</h2>
              <p>Cards and player boards will go here.</p>
            </div>
          </div>

          <button onClick={leaveRoom} style={buttonStyle}>
            Leave Room
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <h1>Lorcana Table 🎴</h1>

      <div style={panelStyle}>
        <h2>Your Name</h2>

        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter username"
          style={inputStyle}
        />

        <hr style={{ margin: "30px 0", borderColor: "#374151" }} />

        <h2>Create a Room</h2>

        <button onClick={createRoom} style={buttonStyle}>
          Create Room
        </button>

        {createdRoomCode && (
          <h2>
            Room Code:{" "}
            <span style={{ color: "#facc15" }}>{createdRoomCode}</span>
          </h2>
        )}

        <hr style={{ margin: "30px 0", borderColor: "#374151" }} />

        <h2>Join a Room</h2>

        <input
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          placeholder="Enter room code"
          style={inputStyle}
        />

        <button onClick={joinRoom} style={buttonStyle}>
          Join Room
        </button>

        {message && <p>{message}</p>}
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
  fontFamily: "Arial, sans-serif",
  padding: "20px"
};

const panelStyle = {
  width: "min(90vw, 500px)",
  border: "1px solid #374151",
  borderRadius: "16px",
  padding: "24px",
  background: "#111827",
  textAlign: "center"
};

const roomPanelStyle = {
  width: "min(95vw, 1000px)",
  border: "1px solid #374151",
  borderRadius: "16px",
  padding: "24px",
  background: "#111827",
  textAlign: "center"
};

const tableStyle = {
  marginTop: "20px",
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: "15px",
  alignItems: "center"
};

const seatStyle = {
  border: "1px solid #374151",
  borderRadius: "12px",
  padding: "20px",
  background: "#1f2937"
};

const centerStyle = {
  gridColumn: "1 / 4",
  border: "2px dashed #facc15",
  borderRadius: "16px",
  padding: "50px",
  background: "#020617"
};

const buttonStyle = {
  padding: "12px 20px",
  borderRadius: "10px",
  border: "none",
  cursor: "pointer",
  fontWeight: "bold",
  margin: "10px"
};

const inputStyle = {
  width: "80%",
  padding: "12px",
  borderRadius: "10px",
  border: "1px solid #374151",
  marginBottom: "10px"
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
