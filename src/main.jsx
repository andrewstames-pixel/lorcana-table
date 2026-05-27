import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const STARTING_HAND = [
  "Brave Mouse",
  "Snow Singer",
  "Thorn Queen",
  "Island Hero",
  "Ready Stance",
  "Quest Again"
];

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

function makePlayerState(username) {
  return {
    username,
    lore: 0,
    hand: [...STARTING_HAND],
    board: [],
    inkwell: [],
    discard: []
  };
}

function App() {
  const playerId = makePlayerId();

  const [username, setUsername] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [currentRoom, setCurrentRoom] = useState(null);
  const [players, setPlayers] = useState({});
  const [selectedCard, setSelectedCard] = useState(null);
  const [message, setMessage] = useState("");

  async function savePlayers(nextPlayers) {
    if (!currentRoom) return;

    await supabase.from("game_state").upsert({
      room_id: currentRoom.id,
      state: { players: nextPlayers },
      updated_at: new Date().toISOString()
    });
  }

  async function loadGameState(roomId) {
    const { data } = await supabase
      .from("game_state")
      .select("*")
      .eq("room_id", roomId)
      .maybeSingle();

    if (data?.state?.players) {
      setPlayers(data.state.players);
    }
  }

  async function enterRoom(room) {
    setCurrentRoom(room);

    const { data } = await supabase
      .from("game_state")
      .select("*")
      .eq("room_id", room.id)
      .maybeSingle();

    let nextPlayers = data?.state?.players || {};

    if (!nextPlayers[playerId]) {
      nextPlayers = {
        ...nextPlayers,
        [playerId]: makePlayerState(username.trim())
      };

      await supabase.from("game_state").upsert({
        room_id: room.id,
        state: { players: nextPlayers },
        updated_at: new Date().toISOString()
      });
    }

    setPlayers(nextPlayers);
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

    await supabase.from("game_state").insert({
      room_id: data.id,
      state: {
        players: {
          [playerId]: makePlayerState(username.trim())
        }
      }
    });

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
      const nextPlayers = { ...players };
      delete nextPlayers[playerId];
      await savePlayers(nextPlayers);
    }

    setCurrentRoom(null);
    setPlayers({});
    setSelectedCard(null);
    setJoinCode("");
  }

  async function moveSelectedCard(targetZone) {
    if (!selectedCard) {
      setMessage("Click one of your cards first.");
      return;
    }

    const me = players[playerId];
    if (!me) return;

    const nextMe = {
      ...me,
      hand: me.hand.filter((c) => c !== selectedCard),
      board: me.board.filter((c) => c !== selectedCard),
      inkwell: me.inkwell.filter((c) => c !== selectedCard),
      discard: me.discard.filter((c) => c !== selectedCard)
    };

    nextMe[targetZone] = [...nextMe[targetZone], selectedCard];

    const nextPlayers = {
      ...players,
      [playerId]: nextMe
    };

    setPlayers(nextPlayers);
    await savePlayers(nextPlayers);

    setMessage(`${selectedCard} moved to ${targetZone}.`);
    setSelectedCard(null);
  }

  async function changeLore(amount) {
    const me = players[playerId];
    if (!me) return;

    const nextPlayers = {
      ...players,
      [playerId]: {
        ...me,
        lore: Math.max(0, me.lore + amount)
      }
    };

    setPlayers(nextPlayers);
    await savePlayers(nextPlayers);
  }

  useEffect(() => {
    if (!currentRoom) return;

    loadGameState(currentRoom.id);

    const channel = supabase
      .channel("game-state-" + currentRoom.id)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_state",
          filter: `room_id=eq.${currentRoom.id}`
        },
        (payload) => {
          const nextPlayers = payload.new?.state?.players;
          if (nextPlayers) setPlayers(nextPlayers);
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [currentRoom]);

  if (currentRoom) {
    const me = players[playerId];
    const playerList = Object.entries(players);

    return (
      <div style={pageStyle}>
        <div style={roomPanelStyle}>
          <h1>Lorcana Table 🎴</h1>
          <h2>
            Room: <span style={{ color: "#facc15" }}>{currentRoom.code}</span>
          </h2>

          <div style={playersGridStyle}>
            {playerList.map(([id, player]) => (
              <div key={id} style={seatStyle}>
                <h3>{player.username}</h3>
                <p>Lore: {player.lore}</p>
                <p>Hand: {id === playerId ? player.hand.length : "Hidden"}</p>
                <p>Board: {player.board.length}</p>
                <p>Inkwell: {player.inkwell.length}</p>
                <p>Discard: {player.discard.length}</p>
              </div>
            ))}
          </div>

          {me && (
            <>
              <div style={gameAreaStyle}>
                <Zone title="Your Hand" cards={me.hand} selectedCard={selectedCard} setSelectedCard={setSelectedCard} />
                <Zone title="Your Board" cards={me.board} selectedCard={selectedCard} setSelectedCard={setSelectedCard} />
                <Zone title="Your Inkwell" cards={me.inkwell} selectedCard={selectedCard} setSelectedCard={setSelectedCard} />
                <Zone title="Your Discard" cards={me.discard} selectedCard={selectedCard} setSelectedCard={setSelectedCard} />
              </div>

              <div>
                <button onClick={() => moveSelectedCard("board")} style={buttonStyle}>Move to Board</button>
                <button onClick={() => moveSelectedCard("inkwell")} style={buttonStyle}>Move to Inkwell</button>
                <button onClick={() => moveSelectedCard("discard")} style={buttonStyle}>Move to Discard</button>
                <button onClick={() => moveSelectedCard("hand")} style={buttonStyle}>Return to Hand</button>
              </div>

              <div>
                <button onClick={() => changeLore(-1)} style={buttonStyle}>- Lore</button>
                <button onClick={() => changeLore(1)} style={buttonStyle}>+ Lore</button>
              </div>
            </>
          )}

          {selectedCard && <p>Selected: <strong style={{ color: "#facc15" }}>{selectedCard}</strong></p>}
          {message && <p>{message}</p>}

          <button onClick={leaveRoom} style={buttonStyle}>Leave Room</button>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <h1>Lorcana Table 🎴</h1>

      <div style={panelStyle}>
        <h2>Your Name</h2>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter username" style={inputStyle} />

        <hr style={{ margin: "30px 0", borderColor: "#374151" }} />

        <h2>Create a Room</h2>
        <button onClick={createRoom} style={buttonStyle}>Create Room</button>

        <hr style={{ margin: "30px 0", borderColor: "#374151" }} />

        <h2>Join a Room</h2>
        <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Enter room code" style={inputStyle} />
        <button onClick={joinRoom} style={buttonStyle}>Join Room</button>

        {message && <p>{message}</p>}
      </div>
    </div>
  );
}

function Zone({ title, cards, selectedCard, setSelectedCard }) {
  return (
    <div style={zoneStyle}>
      <h2>{title}</h2>
      <p>{cards.length} card(s)</p>

      <div style={cardRowStyle}>
        {cards.map((card, index) => (
          <button
            key={`${card}-${index}`}
            onClick={() => setSelectedCard(card)}
            style={{
              ...cardStyle,
              border: selectedCard === card ? "3px solid #facc15" : "1px solid #374151"
            }}
          >
            {card}
          </button>
        ))}
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
  width: "min(95vw, 1200px)",
  border: "1px solid #374151",
  borderRadius: "16px",
  padding: "24px",
  background: "#111827",
  textAlign: "center"
};

const playersGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "12px",
  marginTop: "20px"
};

const seatStyle = {
  border: "1px solid #374151",
  borderRadius: "12px",
  padding: "15px",
  background: "#1f2937"
};

const gameAreaStyle = {
  marginTop: "30px",
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: "20px"
};

const zoneStyle = {
  border: "1px solid #374151",
  borderRadius: "16px",
  padding: "16px",
  background: "#020617",
  minHeight: "180px"
};

const cardRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "10px",
  justifyContent: "center"
};

const cardStyle = {
  width: "110px",
  minHeight: "150px",
  borderRadius: "12px",
  background: "#1f2937",
  color: "white",
  cursor: "pointer",
  padding: "10px"
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
