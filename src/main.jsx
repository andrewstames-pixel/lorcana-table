import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function makePlayerId() {
  let id = localStorage.getItem("player_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("player_id", id);
  }
  return id;
}

function App() {
  const [username, setUsername] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [currentRoom, setCurrentRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [message, setMessage] = useState("");
  const playerId = makePlayerId();

  async function loadPlayers(roomId) {
    const { data, error } = await supabase
      .from("room_seats")
      .select("*")
      .eq("room_id", roomId)
      .order("seat_index");

    if (!error) setPlayers(data || []);
  }

  async function claimSeat(roomId) {
    const { data: seats } = await supabase
      .from("room_seats")
      .select("seat_index")
      .eq("room_id", roomId);

    const taken = new Set((seats || []).map((s) => s.seat_index));
    const seatIndex = [...Array(8).keys()].find((i) => !taken.has(i));

    if (seatIndex === undefined) {
      setMessage("Room is full.");
      return;
    }

    await supabase.from("room_seats").insert({
      room_id: roomId,
      player_id: playerId,
      seat_index: seatIndex,
      lore: 0,
      ink: 0,
      username: username.trim()
    });

    await loadPlayers(roomId);
  }

  async function enterRoom(room) {
    setCurrentRoom(room);
    await claimSeat(room.id);
    await loadPlayers(room.id);
  }

  async function createRoom() {
    if (!username.trim()) {
      setMessage("Enter your username first.");
      return;
    }

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

    setMessage("Room created!");
    await enterRoom(data);
  }

  async function joinRoom() {
    if (!username.trim()) {
      setMessage("Enter your username first.");
      return;
    }

    const code = joinCode.trim().toUpperCase();

    const { data, error } = await supabase
      .from("rooms")
      .select("*")
      .eq("code", code)
      .single();

    if (error || !data) {
      setMessage("Room not found.");
      return;
    }

    setMessage(`Joined room ${data.code}!`);
    await enterRoom(data);
  }

  async function leaveRoom() {
    if (currentRoom) {
      await supabase
        .from("room_seats")
        .delete()
        .eq("room_id", currentRoom.id)
        .eq("player_id", playerId);
    }

    setCurrentRoom(null);
    setPlayers([]);
    setJoinCode("");
    setMessage("Left room.");
  }

  useEffect(() => {
    if (!currentRoom) return;

    const channel = supabase
      .channel("room-seats-" + currentRoom.id)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_seats",
          filter: `room_id=eq.${currentRoom.id}`
        },
        () => loadPlayers(currentRoom.id)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentRoom]);

  if (currentRoom) {
    const seats = Array.from({ length: 8 }, (_, i) => {
      return players.find((p) => p.seat_index === i);
    });

    return (
      <div style={pageStyle}>
        <div style={roomPanelStyle}>
          <h1>Lorcana Table 🎴</h1>
          <h2>
            Room: <span style={{ color: "#facc15" }}>{currentRoom.code}</span>
          </h2>

          <div style={tableStyle}>
            {seats.map((seat, index) => (
              <div key={index} style={seatStyle}>
                {seat ? seat.username : "Open Seat"}
              </div>
            ))}

            <div style={centerStyle}>
              <h2>Shared Table</h2>
              <p>Players now save to Supabase.</p>
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
  gridTemplateColumns: "repeat(4, 1fr)",
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
  gridColumn: "1 / 5",
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
