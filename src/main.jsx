import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const PLAYER_COLORS = [
  { name: "Blue", value: "#38bdf8", emoji: "🔵" },
  { name: "Green", value: "#22c55e", emoji: "🟢" },
  { name: "Purple", value: "#a855f7", emoji: "🟣" },
  { name: "Orange", value: "#f97316", emoji: "🟠" },
  { name: "Red", value: "#ef4444", emoji: "🔴" },
  { name: "Yellow", value: "#facc15", emoji: "🟡" },
  { name: "Pink", value: "#ec4899", emoji: "🩷" },
  { name: "White", value: "#e5e7eb", emoji: "⚪" }
];

const DEFAULT_DECK_TEXT = `4 Brave Mouse
4 Snow Singer
4 Thorn Queen
4 Island Hero
4 Ready Stance
4 Quest Again`;

function normalizeCardName(name) {
  return name.trim().toLowerCase();
}

function loadCachedCardImages() {
  try {
    return JSON.parse(localStorage.getItem("lorcana_card_images") || "{}");
  } catch {
    return {};
  }
}

function saveCachedCardImages(images) {
  localStorage.setItem("lorcana_card_images", JSON.stringify(images));
}

async function fetchCardImage(cardName) {
  const response = await fetch(
    `https://api.lorcast.com/v0/cards/search?q=${encodeURIComponent(cardName)}&unique=cards`
  );

  const data = await response.json();
  const results = data?.results || [];

  const exactMatch =
    results.find(
      (card) => normalizeCardName(card.name) === normalizeCardName(cardName)
    ) || results[0];

  return (
    exactMatch?.image_uris?.digital?.normal ||
    exactMatch?.image_uris?.digital?.large ||
    exactMatch?.image_uris?.digital?.full ||
    null
  );
}

function parseDeckList(text) {
  const cards = [];

  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const match = line.match(/^(\d+)\s+(.+)$/);

      if (match) {
        const quantity = Number(match[1]);
        const name = match[2].trim();

        for (let i = 0; i < quantity; i++) {
          cards.push(name);
        }
      } else {
        cards.push(line);
      }
    });

  return cards;
}

function loadSavedDecks() {
  try {
    return JSON.parse(localStorage.getItem("lorcana_saved_decks") || "{}");
  } catch {
    return {};
  }
}

function saveSavedDecks(decks) {
  localStorage.setItem("lorcana_saved_decks", JSON.stringify(decks));
}

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

function makePlayerState(username, color, deckListText) {
  const deck = parseDeckList(deckListText);
  const hand = deck.slice(0, 6);
  const remainingDeck = deck.slice(6);

  return {
    username,
    color,
    lore: 0,
    deck: remainingDeck,
    hand,
    board: [],
    inkwell: [],
    discard: [],
    exerted: [],
    damage: {}
  };
}

function rollD6() {
  return Math.floor(Math.random() * 6) + 1;
}

function App() {
  const playerId = makePlayerId();

  const [username, setUsername] = useState("");
  const [playerColor, setPlayerColor] = useState(PLAYER_COLORS[0].value);
  const [deckName, setDeckName] = useState("");
  const [deckListText, setDeckListText] = useState(DEFAULT_DECK_TEXT);
  const [savedDecks, setSavedDecks] = useState(loadSavedDecks);
  const [selectedSavedDeckName, setSelectedSavedDeckName] = useState("");

  const [joinCode, setJoinCode] = useState("");
  const [currentRoom, setCurrentRoom] = useState(null);
  const [players, setPlayers] = useState({});
  const [selectedCard, setSelectedCard] = useState(null);
  const [selectedMulliganCards, setSelectedMulliganCards] = useState([]);
  const [message, setMessage] = useState("");
  const [currentTurnPlayerId, setCurrentTurnPlayerId] = useState(null);
  const [rollResults, setRollResults] = useState([]);
  const [rollMessage, setRollMessage] = useState("");
  const [cardImages, setCardImages] = useState(loadCachedCardImages);

  useEffect(() => {
    if (!currentRoom) return;

    const visibleCards = new Set();

    Object.values(players).forEach((player) => {
      (player.board || []).forEach((card) => visibleCards.add(card));
      (player.inkwell || []).forEach((card) => visibleCards.add(card));
      (player.discard || []).forEach((card) => visibleCards.add(card));
    });

    const me = players[playerId];
    if (me) {
      (me.hand || []).forEach((card) => visibleCards.add(card));
    }

    const missingCards = [...visibleCards].filter(
      (card) => cardImages[normalizeCardName(card)] === undefined
    );

    if (!missingCards.length) return;

    async function loadImages() {
      const nextImages = { ...cardImages };

      for (const card of missingCards) {
        try {
          nextImages[normalizeCardName(card)] = await fetchCardImage(card);
        } catch {
          nextImages[normalizeCardName(card)] = null;
        }
      }

      setCardImages(nextImages);
      saveCachedCardImages(nextImages);
    }

    loadImages();
  }, [players, currentRoom]);

  function saveCurrentDeck() {
    const name = deckName.trim();

    if (!name) {
      setMessage("Name your deck first.");
      return;
    }

    const nextDecks = {
      ...savedDecks,
      [name]: deckListText
    };

    setSavedDecks(nextDecks);
    saveSavedDecks(nextDecks);
    setSelectedSavedDeckName(name);
    setMessage(`Saved deck: ${name}`);
  }

  function loadSelectedDeck(name) {
    if (!name) return;

    setSelectedSavedDeckName(name);
    setDeckName(name);
    setDeckListText(savedDecks[name]);
    setMessage(`Loaded deck: ${name}`);
  }

  function deleteSelectedDeck() {
    if (!selectedSavedDeckName) {
      setMessage("Choose a saved deck to delete.");
      return;
    }

    const nextDecks = { ...savedDecks };
    delete nextDecks[selectedSavedDeckName];

    setSavedDecks(nextDecks);
    saveSavedDecks(nextDecks);
    setSelectedSavedDeckName("");
    setMessage("Deck deleted.");
  }

  async function saveGameState(
    nextPlayers,
    nextTurnPlayerId = currentTurnPlayerId,
    nextRollResults = rollResults,
    nextRollMessage = rollMessage
  ) {
    if (!currentRoom) return;

    await supabase.from("game_state").upsert({
      room_id: currentRoom.id,
      state: {
        players: nextPlayers,
        currentTurnPlayerId: nextTurnPlayerId,
        rollResults: nextRollResults,
        rollMessage: nextRollMessage
      },
      updated_at: new Date().toISOString()
    });
  }

  async function enterRoom(room) {
    setCurrentRoom(room);

    const { data } = await supabase
      .from("game_state")
      .select("*")
      .eq("room_id", room.id)
      .maybeSingle();

    let nextPlayers = data?.state?.players || {};
    let nextTurnPlayerId = data?.state?.currentTurnPlayerId || null;
    let nextRollResults = data?.state?.rollResults || [];
    let nextRollMessage = data?.state?.rollMessage || "";

    if (!nextPlayers[playerId]) {
      nextPlayers = {
        ...nextPlayers,
        [playerId]: makePlayerState(username.trim(), playerColor, deckListText)
      };
    }

    if (!nextPlayers[playerId].damage) {
      nextPlayers[playerId].damage = {};
    }

    if (!nextTurnPlayerId) {
      nextTurnPlayerId = Object.keys(nextPlayers)[0];
    }

    await supabase.from("game_state").upsert({
      room_id: room.id,
      state: {
        players: nextPlayers,
        currentTurnPlayerId: nextTurnPlayerId,
        rollResults: nextRollResults,
        rollMessage: nextRollMessage
      },
      updated_at: new Date().toISOString()
    });

    setPlayers(nextPlayers);
    setCurrentTurnPlayerId(nextTurnPlayerId);
    setRollResults(nextRollResults);
    setRollMessage(nextRollMessage);
  }

  async function createRoom() {
    if (!username.trim()) {
      setMessage("Enter your username first.");
      return;
    }

    const deck = parseDeckList(deckListText);

    if (deck.length === 0) {
      setMessage("Add at least one card to your deck.");
      return;
    }

    const code = makeRoomCode();

    const { data, error } = await supabase
      .from("rooms")
      .insert({ code, max_players: 8, status: "lobby" })
      .select()
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    const initialPlayers = {
      [playerId]: makePlayerState(username.trim(), playerColor, deckListText)
    };

    await supabase.from("game_state").insert({
      room_id: data.id,
      state: {
        players: initialPlayers,
        currentTurnPlayerId: playerId,
        rollResults: [],
        rollMessage: ""
      }
    });

    await enterRoom(data);
  }

  async function joinRoom() {
    if (!username.trim()) {
      setMessage("Enter your username first.");
      return;
    }

    const deck = parseDeckList(deckListText);

    if (deck.length === 0) {
      setMessage("Add at least one card to your deck.");
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

    await enterRoom(data);
  }

  async function leaveRoom() {
    if (currentRoom) {
      const nextPlayers = { ...players };
      delete nextPlayers[playerId];

      let nextTurnPlayerId = currentTurnPlayerId;
      if (nextTurnPlayerId === playerId) {
        nextTurnPlayerId = Object.keys(nextPlayers)[0] || null;
      }

      await saveGameState(nextPlayers, nextTurnPlayerId);
    }

    setCurrentRoom(null);
    setPlayers({});
    setSelectedCard(null);
    setSelectedMulliganCards([]);
    setJoinCode("");
    setCurrentTurnPlayerId(null);
  }

  async function updateMe(nextMe) {
    const nextPlayers = {
      ...players,
      [playerId]: nextMe
    };

    setPlayers(nextPlayers);
    await saveGameState(nextPlayers);
  }

  function toggleMulliganCard(card) {
    setSelectedCard(card);

    setSelectedMulliganCards((current) =>
      current.includes(card)
        ? current.filter((c) => c !== card)
        : [...current, card]
    );
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
      discard: me.discard.filter((c) => c !== selectedCard),
      exerted: (me.exerted || []).filter((c) => c !== selectedCard),
      damage: { ...(me.damage || {}) }
    };

    if (targetZone !== "board") {
      delete nextMe.damage[selectedCard];
    }

    nextMe[targetZone] = [...nextMe[targetZone], selectedCard];

    await updateMe(nextMe);
    setSelectedCard(null);
    setSelectedMulliganCards((cards) => cards.filter((c) => c !== selectedCard));
  }

  async function toggleExert(card) {
    const me = players[playerId];
    if (!me) return;

    const exerted = me.exerted || [];
    const nextExerted = exerted.includes(card)
      ? exerted.filter((c) => c !== card)
      : [...exerted, card];

    await updateMe({
      ...me,
      exerted: nextExerted
    });
  }

  async function changeLore(amount) {
    const me = players[playerId];
    if (!me) return;

    await updateMe({
      ...me,
      lore: Math.max(0, me.lore + amount)
    });
  }

  async function readyAllCards() {
    const me = players[playerId];
    if (!me) return;

    await updateMe({
      ...me,
      exerted: []
    });
  }

  async function changeDamage(amount) {
    const me = players[playerId];

    if (!me || !selectedCard || !me.board.includes(selectedCard)) {
      setMessage("Select one of your board cards first.");
      return;
    }

    const currentDamage = me.damage?.[selectedCard] || 0;
    const nextDamage = Math.max(0, currentDamage + amount);

    await updateMe({
      ...me,
      damage: {
        ...(me.damage || {}),
        [selectedCard]: nextDamage
      }
    });
  }

  async function clearDamage() {
    const me = players[playerId];

    if (!me || !selectedCard || !me.board.includes(selectedCard)) {
      setMessage("Select one of your board cards first.");
      return;
    }

    await updateMe({
      ...me,
      damage: {
        ...(me.damage || {}),
        [selectedCard]: 0
      }
    });
  }

  async function drawCard() {
    const me = players[playerId];
    if (!me || !me.deck || me.deck.length === 0) return;

    const drawnCard = me.deck[0];

    await updateMe({
      ...me,
      deck: me.deck.slice(1),
      hand: [...me.hand, drawnCard]
    });
  }

  async function shuffleDeck() {
    const me = players[playerId];
    if (!me || !me.deck) return;

    const shuffledDeck = [...me.deck].sort(() => Math.random() - 0.5);

    await updateMe({
      ...me,
      deck: shuffledDeck
    });
  }

  async function mulliganHand() {
    const me = players[playerId];
    if (!me || !me.deck) return;

    const newDeck = [...me.deck, ...me.hand];
    const shuffledDeck = [...newDeck].sort(() => Math.random() - 0.5);

    await updateMe({
      ...me,
      deck: shuffledDeck.slice(6),
      hand: shuffledDeck.slice(0, 6)
    });

    setSelectedCard(null);
    setSelectedMulliganCards([]);
  }

  async function mulliganSelected() {
    const me = players[playerId];

    if (!me || selectedMulliganCards.length === 0) {
      setMessage("Select one or more cards in your hand first.");
      return;
    }

    const selectedSet = new Set(selectedMulliganCards);
    const keptHand = me.hand.filter((card) => !selectedSet.has(card));
    const returnedCards = me.hand.filter((card) => selectedSet.has(card));

    const deckWithReturnedCards = [...me.deck, ...returnedCards];
    const shuffledDeck = [...deckWithReturnedCards].sort(() => Math.random() - 0.5);

    const replacementCount = returnedCards.length;
    const replacementCards = shuffledDeck.slice(0, replacementCount);
    const remainingDeck = shuffledDeck.slice(replacementCount);

    await updateMe({
      ...me,
      hand: [...keptHand, ...replacementCards],
      deck: remainingDeck
    });

    setSelectedCard(null);
    setSelectedMulliganCards([]);
  }

  async function nextTurn() {
    const playerIds = Object.keys(players);
    if (playerIds.length === 0) return;

    const currentIndex = playerIds.indexOf(currentTurnPlayerId);
    const safeCurrentIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = (safeCurrentIndex + 1) % playerIds.length;
    const nextTurnPlayerId = playerIds[nextIndex];

    setCurrentTurnPlayerId(nextTurnPlayerId);
    await saveGameState(players, nextTurnPlayerId);
  }

  async function rollForFirstPlayer() {
    const playerEntries = Object.entries(players);
    if (playerEntries.length === 0) return;

    let contenders = playerEntries;
    const history = [];

    while (contenders.length > 1) {
      const roundRolls = contenders.map(([id, player]) => ({
        id,
        username: player.username,
        roll: rollD6()
      }));

      history.push(roundRolls);

      const highest = Math.max(...roundRolls.map((r) => r.roll));
      const tied = roundRolls.filter((r) => r.roll === highest);

      contenders = tied.map((roll) => [
        roll.id,
        players[roll.id]
      ]);
    }

    const winnerId = contenders[0][0];
    const winnerName = players[winnerId]?.username || "Unknown";

    const nextRollMessage = `${winnerName} goes first!`;
    const nextRollResults = history;

    setCurrentTurnPlayerId(winnerId);
    setRollResults(nextRollResults);
    setRollMessage(nextRollMessage);

    await saveGameState(players, winnerId, nextRollResults, nextRollMessage);
  }

  useEffect(() => {
    if (!currentRoom) return;

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
          const nextTurnPlayerId = payload.new?.state?.currentTurnPlayerId;
          const nextRollResults = payload.new?.state?.rollResults;
          const nextRollMessage = payload.new?.state?.rollMessage;

          if (nextPlayers) setPlayers(nextPlayers);
          if (nextTurnPlayerId !== undefined) {
            setCurrentTurnPlayerId(nextTurnPlayerId);
          }
          if (nextRollResults !== undefined) {
            setRollResults(nextRollResults);
          }
          if (nextRollMessage !== undefined) {
            setRollMessage(nextRollMessage);
          }
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

          <h3>
            Current Turn:{" "}
            <span style={{ color: players[currentTurnPlayerId]?.color || "#facc15" }}>
              {players[currentTurnPlayerId]?.username || "Waiting..."}
            </span>
          </h3>

          {rollMessage && (
            <div style={rollPanelStyle}>
              <h3>🎲 Roll for First Player</h3>
              <p>{rollMessage}</p>

              {rollResults.map((round, roundIndex) => (
                <div key={roundIndex}>
                  <strong>Round {roundIndex + 1}</strong>
                  <div>
                    {round.map((result) => (
                      <span
                        key={result.id}
                        style={{
                          ...rollResultStyle,
                          borderColor: players[result.id]?.color || "#374151"
                        }}
                      >
                        {result.username}: {result.roll}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={playersGridStyle}>
            {playerList.map(([id, player]) => {
              const isCurrentTurn = id === currentTurnPlayerId;

              return (
                <div
                  key={id}
                  style={{
                    ...seatStyle,
                    borderColor: player.color || "#374151",
                    boxShadow: isCurrentTurn
                      ? `0 0 20px ${player.color || "#facc15"}`
                      : "none"
                  }}
                >
                  <h3 style={{ color: player.color || "white" }}>
                    {player.username}
                  </h3>

                  {isCurrentTurn && (
                    <p style={{ color: player.color || "#facc15", fontWeight: "bold" }}>
                      Current Turn
                    </p>
                  )}

                  <p>Lore: {player.lore}</p>

                  <p>
                    Hand:{" "}
                    {id === playerId
                      ? player.hand.length
                      : `${player.hand.length} hidden`}
                    <br />
                    Deck: {player.deck?.length || 0}
                  </p>

                  <h4>Board</h4>
                  <MiniCards
                    cards={player.board}
                    exertedCards={player.exerted || []}
                    damage={player.damage || {}}
                    cardImages={cardImages}
                  />

                  <h4>Inkwell</h4>
                  <MiniCards
                    cards={player.inkwell}
                    exertedCards={player.exerted || []}
                    cardImages={cardImages}
                  />

                  <h4>Discard</h4>
                  <MiniCards cards={player.discard} cardImages={cardImages} />
                </div>
              );
            })}
          </div>

          {me && (
            <>
              <div style={gameAreaStyle}>
                <div style={zoneStyle}>
                  <h2>Your Deck</h2>
                  <button onClick={drawCard} style={deckPileStyle}>
                    <div style={{ fontSize: "18px", fontWeight: "bold" }}>DECK</div>
                    <div style={{ fontSize: "28px", fontWeight: "bold" }}>
                      {me.deck?.length || 0}
                    </div>
                    <div style={{ fontSize: "12px" }}>Click to draw</div>
                  </button>
                </div>

                <Zone
                  title="Your Hand"
                  cards={me.hand}
                  selectedCard={selectedCard}
                  setSelectedCard={setSelectedCard}
                  selectedMulliganCards={selectedMulliganCards}
                  onCardClick={toggleMulliganCard}
                  cardImages={cardImages}
                />

                <Zone
                  title="Your Board"
                  cards={me.board}
                  selectedCard={selectedCard}
                  setSelectedCard={setSelectedCard}
                  exertedCards={me.exerted || []}
                  damage={me.damage || {}}
                  onDoubleClickCard={toggleExert}
                  cardImages={cardImages}
                />

                <Zone
                  title="Your Inkwell"
                  cards={me.inkwell}
                  selectedCard={selectedCard}
                  setSelectedCard={setSelectedCard}
                  exertedCards={me.exerted || []}
                  onDoubleClickCard={toggleExert}
                  cardImages={cardImages}
                />

                <Zone
                  title="Your Discard"
                  cards={me.discard}
                  selectedCard={selectedCard}
                  setSelectedCard={setSelectedCard}
                  cardImages={cardImages}
                />
              </div>

              <p>
                Mulligan selected:{" "}
                <strong style={{ color: "#38bdf8" }}>
                  {selectedMulliganCards.length}
                </strong>
              </p>

              <div style={{ marginTop: "20px" }}>
                <button onClick={rollForFirstPlayer} style={buttonStyle}>
                  Roll for First Player
                </button>

                <button onClick={() => moveSelectedCard("board")} style={buttonStyle}>
                  Move to Board
                </button>

                <button onClick={() => moveSelectedCard("inkwell")} style={buttonStyle}>
                  Move to Inkwell
                </button>

                <button onClick={() => moveSelectedCard("discard")} style={buttonStyle}>
                  Move to Discard
                </button>

                <button onClick={() => moveSelectedCard("hand")} style={buttonStyle}>
                  Return to Hand
                </button>

                <button onClick={() => changeLore(-1)} style={buttonStyle}>
                  - Lore
                </button>

                <button onClick={() => changeLore(1)} style={buttonStyle}>
                  + Lore
                </button>

                <button onClick={readyAllCards} style={buttonStyle}>
                  Ready All
                </button>

                <button onClick={nextTurn} style={buttonStyle}>
                  Next Turn
                </button>

                <button onClick={() => changeDamage(1)} style={buttonStyle}>
                  + Damage
                </button>

                <button onClick={() => changeDamage(-1)} style={buttonStyle}>
                  - Damage
                </button>

                <button onClick={clearDamage} style={buttonStyle}>
                  Clear Damage
                </button>

                <button onClick={drawCard} style={buttonStyle}>
                  Draw Card
                </button>

                <button onClick={shuffleDeck} style={buttonStyle}>
                  Shuffle Deck
                </button>

                <button onClick={mulliganHand} style={buttonStyle}>
                  Mulligan Hand
                </button>

                <button onClick={mulliganSelected} style={buttonStyle}>
                  Mulligan Selected
                </button>
              </div>
            </>
          )}

          {selectedCard && (
            <p>
              Selected: <strong style={{ color: "#facc15" }}>{selectedCard}</strong>
            </p>
          )}

          {message && <p>{message}</p>}

          <button onClick={leaveRoom} style={buttonStyle}>
            Leave Room
          </button>
        </div>
      </div>
    );
  }

  const deckCardCount = parseDeckList(deckListText).length;

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

        <h2>Choose Your Color</h2>

        <div style={colorPickerStyle}>
          {PLAYER_COLORS.map((color) => (
            <button
              key={color.value}
              onClick={() => setPlayerColor(color.value)}
              style={{
                ...colorButtonStyle,
                background: color.value,
                outline:
                  playerColor === color.value
                    ? "4px solid white"
                    : "1px solid #374151"
              }}
              title={color.name}
            >
              {color.emoji}
            </button>
          ))}
        </div>

        <hr style={{ margin: "30px 0" }} />

        <h2>Deck Builder</h2>

        <input
          value={deckName}
          onChange={(e) => setDeckName(e.target.value)}
          placeholder="Deck name, like Ruby/Steel"
          style={inputStyle}
        />

        <textarea
          value={deckListText}
          onChange={(e) => setDeckListText(e.target.value)}
          placeholder={"One card per line, or use quantities like:\n4 Mickey Mouse\n2 Elsa"}
          style={textareaStyle}
        />

        <p>{deckCardCount} card(s) in deck</p>

        <button onClick={saveCurrentDeck} style={buttonStyle}>
          Save Deck
        </button>

        <select
          value={selectedSavedDeckName}
          onChange={(e) => loadSelectedDeck(e.target.value)}
          style={inputStyle}
        >
          <option value="">Choose saved deck</option>
          {Object.keys(savedDecks).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <button onClick={deleteSelectedDeck} style={buttonStyle}>
          Delete Selected Deck
        </button>

        <hr style={{ margin: "30px 0" }} />

        <h2>Create a Room</h2>

        <button onClick={createRoom} style={buttonStyle}>
          Create Room
        </button>

        <hr style={{ margin: "30px 0" }} />

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

function CardVisual({ card, imageUrl, isMini = false }) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={card}
        style={isMini ? miniCardImageStyle : cardImageStyle}
      />
    );
  }

  return <span>{card}</span>;
}

function MiniCards({ cards, exertedCards = [], damage = {}, cardImages = {} }) {
  if (!cards.length) return <p style={{ color: "#9ca3af" }}>Empty</p>;

  return (
    <div style={miniCardRowStyle}>
      {cards.map((card, index) => {
        const imageUrl = cardImages[normalizeCardName(card)];

        return (
          <div
            key={`${card}-${index}`}
            style={{
              ...miniCardStyle,
              transform: exertedCards.includes(card) ? "rotate(90deg)" : "none"
            }}
          >
            <CardVisual card={card} imageUrl={imageUrl} isMini />

            {(damage[card] || 0) > 0 && (
              <div style={damageBadgeStyle}>
                {damage[card]}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Zone({
  title,
  cards,
  selectedCard,
  setSelectedCard,
  selectedMulliganCards = [],
  onCardClick,
  exertedCards = [],
  damage = {},
  onDoubleClickCard,
  cardImages = {}
}) {
  return (
    <div style={zoneStyle}>
      <h2>{title}</h2>
      <p>{cards.length} card(s)</p>

      <div style={cardRowStyle}>
        {cards.map((card, index) => {
          const isMulliganSelected = selectedMulliganCards.includes(card);
          const cardDamage = damage[card] || 0;
          const imageUrl = cardImages[normalizeCardName(card)];

          return (
            <button
              key={`${card}-${index}`}
              onClick={() => {
                if (onCardClick) {
                  onCardClick(card);
                } else {
                  setSelectedCard(card);
                }
              }}
              onDoubleClick={() => onDoubleClickCard?.(card)}
              style={{
                ...cardStyle,
                border: isMulliganSelected
                  ? "3px solid #38bdf8"
                  : selectedCard === card
                    ? "3px solid #facc15"
                    : "1px solid #374151",
                transform: exertedCards.includes(card) ? "rotate(90deg)" : "none"
              }}
            >
              <CardVisual card={card} imageUrl={imageUrl} />

              {cardDamage > 0 && (
                <div style={damageBadgeStyle}>
                  {cardDamage}
                </div>
              )}
            </button>
          );
        })}
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
  width: "min(90vw, 700px)",
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

const rollPanelStyle = {
  border: "1px solid #facc15",
  borderRadius: "12px",
  background: "#1f2937",
  padding: "12px",
  margin: "16px auto",
  maxWidth: "700px"
};

const rollResultStyle = {
  display: "inline-block",
  margin: "6px",
  padding: "6px 10px",
  borderRadius: "8px",
  background: "#020617",
  border: "1px solid #374151"
};

const playersGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "12px",
  marginTop: "20px"
};

const seatStyle = {
  border: "3px solid #374151",
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
  width: "130px",
  minHeight: "180px",
  borderRadius: "12px",
  background: "#1f2937",
  color: "white",
  cursor: "pointer",
  padding: "6px",
  position: "relative",
  overflow: "hidden"
};

const cardImageStyle = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  borderRadius: "8px",
  display: "block"
};

const damageBadgeStyle = {
  position: "absolute",
  top: "6px",
  right: "6px",
  minWidth: "28px",
  height: "28px",
  borderRadius: "999px",
  background: "#ef4444",
  color: "white",
  display: "grid",
  placeItems: "center",
  fontWeight: "bold",
  border: "2px solid white",
  zIndex: 5
};

const miniCardRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
  justifyContent: "center"
};

const miniCardStyle = {
  width: "70px",
  minHeight: "98px",
  borderRadius: "8px",
  background: "#020617",
  border: "1px solid #374151",
  color: "white",
  fontSize: "11px",
  padding: "4px",
  display: "grid",
  placeItems: "center",
  position: "relative",
  overflow: "hidden"
};

const miniCardImageStyle = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  borderRadius: "6px",
  display: "block"
};

const deckPileStyle = {
  width: "120px",
  minHeight: "170px",
  borderRadius: "14px",
  background: "#111827",
  color: "white",
  border: "3px solid #facc15",
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
  margin: "0 auto",
  boxShadow: "0 8px 20px rgba(0,0,0,0.4)"
};

const colorPickerStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "10px",
  justifyContent: "center",
  margin: "16px 0"
};

const colorButtonStyle = {
  width: "44px",
  height: "44px",
  borderRadius: "999px",
  border: "none",
  cursor: "pointer",
  fontSize: "18px"
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

const textareaStyle = {
  width: "90%",
  minHeight: "180px",
  padding: "12px",
  borderRadius: "10px",
  border: "1px solid #374151",
  background: "#020617",
  color: "white",
  marginBottom: "10px"
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);