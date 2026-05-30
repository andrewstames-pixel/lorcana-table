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

const INK_FILTERS = [
  "Amber",
  "Amethyst",
  "Emerald",
  "Ruby",
  "Sapphire",
  "Steel"
];
const TYPE_FILTERS = [
  "Character",
  "Action",
  "Item",
  "Location"
];
function cardLabel(card) {
  return typeof card === "string" ? card : card.name;
}

function cardImage(card) {
  return typeof card === "string" ? null : card.imageUrl;
}

function cardKey(card, index) {
  return typeof card === "string"
    ? `${card}-${index}`
    : card.instanceId || `${card.id}-${index}`;
}

function makeCardInstance(card) {
  return {
    ...card,
    instanceId: crypto.randomUUID()
  };
}

function loadSavedDecks() {
  try {
    return JSON.parse(localStorage.getItem("lorcana_saved_decks_v2") || "{}");
  } catch {
    return {};
  }
}

function saveSavedDecks(decks) {
  localStorage.setItem("lorcana_saved_decks_v2", JSON.stringify(decks));
}

async function searchLorcastCards(query) {
  const response = await fetch(
    `https://api.lorcast.com/v0/cards/search?q=${encodeURIComponent(query)}&unique=prints`
  );

  const data = await response.json();
  const results = data?.results || [];

  return results.slice(0, 24).map((card) => ({
    id: card.id,
    name: card.full_name || card.name,
    simpleName: card.name,
    imageUrl:
      card.image_uris?.digital?.normal ||
      card.image_uris?.digital?.large ||
      card.image_uris?.digital?.full ||
      null
  }));
}

function normalizeCardSearchName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[–—]/g, "-")
    .replace(/\s+-\s+/g, " - ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function findDreambornCard(cardName) {
  const cleanName = cardName.trim();
  const [baseName, subtitle] = cleanName.split(/\s+-\s+/, 2);

  const searches = [
    `\"${cleanName}\"`,
    cleanName,
    baseName
  ].filter(Boolean);

  const seen = new Set();
  const candidates = [];

  for (const search of searches) {
    const results = await searchLorcastCards(search);

    for (const card of results) {
      if (!seen.has(card.id)) {
        seen.add(card.id);
        candidates.push(card);
      }
    }
  }

  const wanted = normalizeCardSearchName(cleanName);
  const wantedBase = normalizeCardSearchName(baseName);
  const wantedSubtitle = normalizeCardSearchName(subtitle || "");

  return (
    candidates.find((card) => normalizeCardSearchName(card.name) === wanted) ||
    candidates.find((card) =>
      wantedSubtitle &&
      normalizeCardSearchName(card.name).includes(wantedBase) &&
      normalizeCardSearchName(card.name).includes(wantedSubtitle)
    ) ||
    candidates.find((card) => normalizeCardSearchName(card.simpleName) === wantedBase) ||
    candidates[0] ||
    null
  );
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

function makePlayerState(username, color, deckCards) {
  const deck = deckCards.map(makeCardInstance);
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
  const [deckCards, setDeckCards] = useState([]);
  const [savedDecks, setSavedDecks] = useState(loadSavedDecks);
  const [selectedSavedDeckName, setSelectedSavedDeckName] = useState("");

  const [cardSearch, setCardSearch] = useState("");
  const [selectedInkFilters, setSelectedInkFilters] = useState([]);
  const [selectedTypeFilters, setSelectedTypeFilters] = useState([]);

  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [dreambornImportText, setDreambornImportText] = useState("");
  const [isImportingDeck, setIsImportingDeck] = useState(false);
  const [isImportingTtsDeck, setIsImportingTtsDeck] = useState(false);

  const [joinCode, setJoinCode] = useState("");
  const [currentRoom, setCurrentRoom] = useState(null);
  const [players, setPlayers] = useState({});
  const [selectedCardKey, setSelectedCardKey] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [selectedMulliganCards, setSelectedMulliganCards] = useState([]);
  const [message, setMessage] = useState("");
  const [currentTurnPlayerId, setCurrentTurnPlayerId] = useState(null);
  const [rollResults, setRollResults] = useState([]);
  const [rollMessage, setRollMessage] = useState("");

 async function runCardSearch() {
  if (!cardSearch.trim()) {
    setMessage("Type a card name to search.");
    return;
  }

  setIsSearching(true);
  setMessage("");

  try {
    let query = cardSearch.trim();

    if (selectedInkFilters.length > 0) {
  query +=
    " " +
    selectedInkFilters
      .map((ink) => `ink:${ink.toLowerCase()}`)
      .join(" ");
}

if (selectedTypeFilters.length > 0) {
  query +=
    " " +
    selectedTypeFilters
      .map((type) => `type:${type.toLowerCase()}`)
      .join(" ");
}

    const results = await searchLorcastCards(query);

    setSearchResults(results);
    setMessage(`Found ${results.length} card(s).`);
  } catch {
    setMessage("Card search failed. Try again.");
  }

  setIsSearching(false);
}

  function addCardToDeck(card) {
    setDeckCards((cards) => [...cards, card]);
  }

  function removeDeckCard(indexToRemove) {
    setDeckCards((cards) => cards.filter((_, index) => index !== indexToRemove));
  }

  async function importDreambornDeck() {
    const lines = dreambornImportText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      setMessage("Paste a Dreamborn deck list first.");
      return;
    }

    setIsImportingDeck(true);
    setMessage("Importing Dreamborn deck...");

    const importedCards = [];
    const missedCards = [];

    for (const line of lines) {
      const match = line.match(/^(\d+)\s+(.+)$/);

      if (!match) {
        missedCards.push(line);
        continue;
      }

      const quantity = Number(match[1]);
      const cardName = match[2].trim();

      try {
        const foundCard = await findDreambornCard(cardName);

        if (foundCard) {
          for (let i = 0; i < quantity; i++) {
            importedCards.push(foundCard);
          }
        } else {
          missedCards.push(cardName);
        }
      } catch {
        missedCards.push(cardName);
      }
    }

    setDeckCards(importedCards);
    setIsImportingDeck(false);

    if (missedCards.length > 0) {
      setMessage(
        `Imported ${importedCards.length} card(s). Missed: ${missedCards.join(", ")}`
      );
    } else {
      setMessage(`Imported ${importedCards.length} card(s) from Dreamborn.`);
    }
  }


  async function importTtsDeckFile(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setIsImportingTtsDeck(true);
    setMessage("Importing TTS deck...");

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const objectStates = json.ObjectStates || [];

      const containedObjects = objectStates.flatMap((state) =>
        state.ContainedObjects || []
      );

      const customDeck = objectStates.reduce((acc, state) => {
        return {
          ...acc,
          ...(state.CustomDeck || {})
        };
      }, {});

      const importedCards = containedObjects
        .filter((object) => object.Nickname)
        .map((object) => {
          const deckKey = String(Math.floor(Number(object.CardID) / 100));
          const imageUrl = customDeck[deckKey]?.FaceURL || null;
          const name = object.Nickname.trim();

          return {
            id: `tts-${name}-${imageUrl || object.CardID}`,
            name,
            simpleName: name.split(" - ")[0],
            imageUrl
          };
        });

      if (importedCards.length === 0) {
        setMessage("No cards found in that TTS JSON file.");
      } else {
        setDeckCards(importedCards);
        setMessage(`Imported ${importedCards.length} card(s) from TTS JSON.`);
      }
    } catch {
      setMessage("Could not import that TTS JSON file.");
    }

    setIsImportingTtsDeck(false);
    event.target.value = "";
  }

  function saveCurrentDeck() {
    const name = deckName.trim();

    if (!name) {
      setMessage("Name your deck first.");
      return;
    }

    if (deckCards.length === 0) {
      setMessage("Add at least one card to your deck.");
      return;
    }

    const nextDecks = {
      ...savedDecks,
      [name]: deckCards
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
    setDeckCards(savedDecks[name] || []);
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
        [playerId]: makePlayerState(username.trim(), playerColor, deckCards)
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

    if (deckCards.length === 0) {
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
      [playerId]: makePlayerState(username.trim(), playerColor, deckCards)
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

    if (deckCards.length === 0) {
      setMessage("Add or load a deck first.");
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
    setSelectedCardKey(null);
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

  function toggleMulliganCard(card, key) {
    setSelectedCard(card);
    setSelectedCardKey(key);

    setSelectedMulliganCards((current) =>
      current.includes(key)
        ? current.filter((c) => c !== key)
        : [...current, key]
    );
  }

  function removeCardFromZone(cards, key) {
    return cards.filter((card, index) => cardKey(card, index) !== key);
  }

  function findCardInZones(me, key) {
    const zones = ["hand", "board", "inkwell", "discard"];

    for (const zone of zones) {
      const found = me[zone].find((card, index) => cardKey(card, index) === key);
      if (found) return { card: found, zone };
    }

    return null;
  }

  async function moveSelectedCard(targetZone) {
    if (!selectedCardKey) {
      setMessage("Click one of your cards first.");
      return;
    }

    const me = players[playerId];
    if (!me) return;

    const found = findCardInZones(me, selectedCardKey);
    if (!found) return;

    const nextMe = {
      ...me,
      hand: removeCardFromZone(me.hand, selectedCardKey),
      board: removeCardFromZone(me.board, selectedCardKey),
      inkwell: removeCardFromZone(me.inkwell, selectedCardKey),
      discard: removeCardFromZone(me.discard, selectedCardKey),
      exerted: (me.exerted || []).filter((c) => c !== selectedCardKey),
      damage: { ...(me.damage || {}) }
    };

    if (targetZone !== "board") {
      delete nextMe.damage[selectedCardKey];
    }

    nextMe[targetZone] = [...nextMe[targetZone], found.card];

    await updateMe(nextMe);
    setSelectedCard(null);
    setSelectedCardKey(null);
    setSelectedMulliganCards((cards) => cards.filter((c) => c !== selectedCardKey));
  }

  async function toggleExert(card, key) {
    const me = players[playerId];
    if (!me) return;

    const exerted = me.exerted || [];
    const nextExerted = exerted.includes(key)
      ? exerted.filter((c) => c !== key)
      : [...exerted, key];

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

    if (!me || !selectedCardKey || !me.board.some((card, index) => cardKey(card, index) === selectedCardKey)) {
      setMessage("Select one of your board cards first.");
      return;
    }

    const currentDamage = me.damage?.[selectedCardKey] || 0;
    const nextDamage = Math.max(0, currentDamage + amount);

    await updateMe({
      ...me,
      damage: {
        ...(me.damage || {}),
        [selectedCardKey]: nextDamage
      }
    });
  }

  async function clearDamage() {
    const me = players[playerId];

    if (!me || !selectedCardKey || !me.board.some((card, index) => cardKey(card, index) === selectedCardKey)) {
      setMessage("Select one of your board cards first.");
      return;
    }

    await updateMe({
      ...me,
      damage: {
        ...(me.damage || {}),
        [selectedCardKey]: 0
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
    setSelectedCardKey(null);
    setSelectedMulliganCards([]);
  }

  async function mulliganSelected() {
    const me = players[playerId];

    if (!me || selectedMulliganCards.length === 0) {
      setMessage("Select one or more cards in your hand first.");
      return;
    }

    const selectedSet = new Set(selectedMulliganCards);
    const keptHand = me.hand.filter((card, index) => !selectedSet.has(cardKey(card, index)));
    const returnedCards = me.hand.filter((card, index) => selectedSet.has(cardKey(card, index)));

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
    setSelectedCardKey(null);
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
          if (nextTurnPlayerId !== undefined) setCurrentTurnPlayerId(nextTurnPlayerId);
          if (nextRollResults !== undefined) setRollResults(nextRollResults);
          if (nextRollMessage !== undefined) setRollMessage(nextRollMessage);
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
                  />

                  <h4>Inkwell</h4>
                  <MiniCards
                    cards={player.inkwell}
                    exertedCards={player.exerted || []}
                  />

                  <h4>Discard</h4>
                  <MiniCards cards={player.discard} />
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
                  selectedCardKey={selectedCardKey}
                  setSelectedCard={setSelectedCard}
                  setSelectedCardKey={setSelectedCardKey}
                  selectedMulliganCards={selectedMulliganCards}
                  onCardClick={toggleMulliganCard}
                />

                <Zone
                  title="Your Board"
                  cards={me.board}
                  selectedCardKey={selectedCardKey}
                  setSelectedCard={setSelectedCard}
                  setSelectedCardKey={setSelectedCardKey}
                  exertedCards={me.exerted || []}
                  damage={me.damage || {}}
                  onDoubleClickCard={toggleExert}
                />

                <Zone
                  title="Your Inkwell"
                  cards={me.inkwell}
                  selectedCardKey={selectedCardKey}
                  setSelectedCard={setSelectedCard}
                  setSelectedCardKey={setSelectedCardKey}
                  exertedCards={me.exerted || []}
                  onDoubleClickCard={toggleExert}
                />

                <Zone
                  title="Your Discard"
                  cards={me.discard}
                  selectedCardKey={selectedCardKey}
                  setSelectedCard={setSelectedCard}
                  setSelectedCardKey={setSelectedCardKey}
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
              Selected: <strong style={{ color: "#facc15" }}>{cardLabel(selectedCard)}</strong>
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

        <h2>Deck Manager</h2>

        <div style={deckManagerGridStyle}>
          <div style={sectionStyle}>
            <h3>1. Choose a Saved Deck</h3>
            <p style={helperTextStyle}>
              Pick a saved deck before creating or joining a room.
            </p>

            {Object.keys(savedDecks).length === 0 ? (
              <p style={helperTextStyle}>No saved decks yet. Import or build one below.</p>
            ) : (
              <div style={savedDecksStyle}>
                {Object.entries(savedDecks).map(([name, cards]) => (
                  <button
                    key={name}
                    onClick={() => loadSelectedDeck(name)}
                    style={{
                      ...savedDeckButtonStyle,
                      borderColor:
                        selectedSavedDeckName === name ? "#facc15" : "#374151"
                    }}
                  >
                    <strong>{name}</strong>
                    <span>{cards.length} card(s)</span>
                    <small>{selectedSavedDeckName === name ? "Selected" : "Click to use"}</small>
                  </button>
                ))}
              </div>
            )}

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
          </div>

          <div style={sectionStyle}>
            <h3>2. Import a Dreamborn TTS Deck</h3>
            <p style={helperTextStyle}>
              In Dreamborn, export/download the Tabletop Simulator / TTS JSON file,
              then upload it here.
            </p>

            <input
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              placeholder="Deck name, like Ruby/Steel Toys"
              style={inputStyle}
            />

            <input
              type="file"
              accept=".json,application/json"
              onChange={importTtsDeckFile}
              style={inputStyle}
            />

            {isImportingTtsDeck && <p>Importing TTS deck...</p>}

            <button onClick={saveCurrentDeck} style={buttonStyle}>
              Save Current Deck
            </button>
          </div>
        </div>

        <div style={sectionStyle}>
          <h3>3. Build or Edit a Deck Manually</h3>
          <p style={helperTextStyle}>
            Search cards, use filters, and add exact card images to the current deck.
          </p>

          <div>
            <input
              value={cardSearch}
              onChange={(e) => setCardSearch(e.target.value)}
              placeholder="Search card, like Mickey Mouse"
              style={inputStyle}
            />

            <div style={{ margin: "10px 0" }}>
              <p>Ink Filters</p>
              {INK_FILTERS.map((ink) => (
                <button
                  key={ink}
                  onClick={() =>
                    setSelectedInkFilters((current) =>
                      current.includes(ink)
                        ? current.filter((i) => i !== ink)
                        : [...current, ink]
                    )
                  }
                  style={{
                    ...smallButtonStyle,
                    margin: "4px",
                    background: selectedInkFilters.includes(ink) ? "#facc15" : "#374151",
                    color: selectedInkFilters.includes(ink) ? "#111827" : "white"
                  }}
                >
                  {ink}
                </button>
              ))}

              <p>Type Filters</p>
              {TYPE_FILTERS.map((type) => (
                <button
                  key={type}
                  onClick={() =>
                    setSelectedTypeFilters((current) =>
                      current.includes(type)
                        ? current.filter((t) => t !== type)
                        : [...current, type]
                    )
                  }
                  style={{
                    ...smallButtonStyle,
                    margin: "4px",
                    background: selectedTypeFilters.includes(type) ? "#facc15" : "#374151",
                    color: selectedTypeFilters.includes(type) ? "#111827" : "white"
                  }}
                >
                  {type}
                </button>
              ))}
            </div>

            <button onClick={runCardSearch} style={buttonStyle}>
              {isSearching ? "Searching..." : "Search Cards"}
            </button>
          </div>

          <div style={searchResultsStyle}>
            {searchResults.map((card) => (
              <button
                key={card.id}
                onClick={() => addCardToDeck(card)}
                style={searchCardStyle}
              >
                {card.imageUrl ? (
                  <img src={card.imageUrl} alt={card.name} style={searchCardImageStyle} />
                ) : (
                  <span>{card.name}</span>
                )}
                <strong>{card.name}</strong>
                <small>Click to add</small>
              </button>
            ))}
          </div>
        </div>

        <div style={sectionStyle}>
          <h3>Current Deck: {deckCards.length} card(s)</h3>
          <p style={helperTextStyle}>
            Name the deck and click Save Current Deck when you're happy with it.
          </p>

          <div style={deckListStyle}>
            {Object.entries(
              deckCards.reduce((acc, card) => {
                acc[card.id] = acc[card.id] || { card, count: 0 };
                acc[card.id].count += 1;
                return acc;
              }, {})
            ).map(([id, { card, count }]) => (
              <div key={id} style={deckListItemStyle}>
                <span>{count}x {card.name}</span>
                <div>
                  <button
                    onClick={() => {
                      const indexToRemove = deckCards.findIndex((c) => c.id === card.id);
                      if (indexToRemove !== -1) removeDeckCard(indexToRemove);
                    }}
                    style={smallButtonStyle}
                  >
                    -
                  </button>
                  <button
                    onClick={() => addCardToDeck(card)}
                    style={smallButtonStyle}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

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

function CardVisual({ card, isMini = false }) {
  const imageUrl = cardImage(card);

  if (imageUrl) {
    return (
      <>
        <img
          src={imageUrl}
          alt={cardLabel(card)}
          style={isMini ? miniCardImageStyle : cardImageStyle}
        />

        {!isMini && (
          <div className="card-hover-preview">
            <img
              src={imageUrl}
              alt={cardLabel(card)}
              style={hoverPreviewImageStyle}
            />
          </div>
        )}
      </>
    );
  }

  return <span>{cardLabel(card)}</span>;
}

function MiniCards({ cards, exertedCards = [], damage = {} }) {
  if (!cards.length) return <p style={{ color: "#9ca3af" }}>Empty</p>;

  return (
    <div style={miniCardRowStyle}>
      {cards.map((card, index) => {
        const key = cardKey(card, index);

        return (
          <div
            key={key}
            style={{
              ...miniCardStyle,
              transform: exertedCards.includes(key) ? "rotate(90deg)" : "none"
            }}
          >
            <CardVisual card={card} isMini />

            {(damage[key] || 0) > 0 && (
              <div style={damageBadgeStyle}>
                {damage[key]}
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
  selectedCardKey,
  setSelectedCard,
  setSelectedCardKey,
  selectedMulliganCards = [],
  onCardClick,
  exertedCards = [],
  damage = {},
  onDoubleClickCard
}) {
  return (
    <div style={zoneStyle}>
      <h2>{title}</h2>
      <p>{cards.length} card(s)</p>

      <div style={cardRowStyle}>
        {cards.map((card, index) => {
          const key = cardKey(card, index);
          const isMulliganSelected = selectedMulliganCards.includes(key);
          const cardDamage = damage[key] || 0;

          return (
            <button
              key={key}
              onClick={() => {
                if (onCardClick) {
                  onCardClick(card, key);
                } else {
                  setSelectedCard(card);
                  setSelectedCardKey(key);
                }
              }}
              onDoubleClick={() => onDoubleClickCard?.(card, key)}
              style={{
                ...cardStyle,
                border: isMulliganSelected
                  ? "3px solid #38bdf8"
                  : selectedCardKey === key
                    ? "3px solid #facc15"
                    : "1px solid #374151",
                transform: exertedCards.includes(key) ? "rotate(90deg)" : "none"
              }}
            >
              <CardVisual card={card} />

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
  width: "min(90vw, 900px)",
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
  overflow: "visible"
};

const cardImageStyle = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  borderRadius: "8px",
  display: "block"
};

const hoverPreviewImageStyle = {
  position: "fixed",
  right: "20px",
  top: "20px",
  width: "350px",
  maxHeight: "80vh",
  objectFit: "contain",
  border: "3px solid #facc15",
  borderRadius: "12px",
  background: "#111827",
  zIndex: 9999,
  pointerEvents: "none"
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

const searchResultsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "12px",
  margin: "20px 0"
};

const searchCardStyle = {
  border: "1px solid #374151",
  borderRadius: "12px",
  background: "#020617",
  color: "white",
  padding: "10px",
  cursor: "pointer",
  display: "grid",
  gap: "8px",
  justifyItems: "center"
};

const searchCardImageStyle = {
  width: "110px",
  borderRadius: "8px"
};

const deckListStyle = {
  height: "500px",
  overflowY: "auto",
  border: "1px solid #374151",
  borderRadius: "12px",
  padding: "10px",
  background: "#020617",
  marginBottom: "15px"
};

const deckListItemStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "10px",
  borderBottom: "1px solid #1f2937",
  padding: "6px"
};

const smallButtonStyle = {
  padding: "6px 10px",
  borderRadius: "8px",
  border: "none",
  cursor: "pointer"
};

const sectionStyle = {
  border: "1px solid #374151",
  borderRadius: "16px",
  padding: "18px",
  background: "#020617",
  margin: "18px 0"
};

const deckManagerGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: "16px",
  alignItems: "start"
};

const savedDecksStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "10px",
  margin: "12px 0"
};

const savedDeckButtonStyle = {
  border: "2px solid #374151",
  borderRadius: "12px",
  background: "#111827",
  color: "white",
  padding: "12px",
  cursor: "pointer",
  display: "grid",
  gap: "6px",
  textAlign: "left"
};

const helperTextStyle = {
  color: "#cbd5e1",
  fontSize: "14px",
  lineHeight: "1.4"
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

const hoverStyle = document.createElement("style");
hoverStyle.textContent = `
  .card-hover-preview {
    display: none;
  }

  button:hover .card-hover-preview {
    display: block;
  }
`;
document.head.appendChild(hoverStyle);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);