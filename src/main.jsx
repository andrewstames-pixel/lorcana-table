import React, { useEffect, useRef, useState } from "react";
import DailyIframe from "@daily-co/daily-js";
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

const CARD_TAG_OPTIONS = [
  "Character",
  "Item",
  "Location",
  "Custom"
];

const CARD_TOKEN_OPTIONS = [
  "Can’t Quest",
  "Reckless",
  "Can't Ready",
  "Ward",
  "Bodyguard",
  "Evasive",
  "Custom"
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

function shuffleArray(array) {
  const shuffled = [...array];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [shuffled[i], shuffled[j]] = [
      shuffled[j],
      shuffled[i]
    ];
  }

  return shuffled;
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
  const deck = shuffleArray(deckCards.map(makeCardInstance));

  const hand = deck.slice(0, 7);
  const remainingDeck = deck.slice(7);

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
    damage: {},
    tags: {},
    tokens: {},
    attachments: {},
    boosts: {},
    boostHolding: [],
    boardPositions: {},
    revealedCards: []
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
  const [selectedMultiCardKeys, setSelectedMultiCardKeys] = useState([]);
  const [selectedMulliganCards, setSelectedMulliganCards] = useState([]);
  const [message, setMessage] = useState("");
  const [currentTurnPlayerId, setCurrentTurnPlayerId] = useState(null);
  const [rollResults, setRollResults] = useState([]);
  const [rollMessage, setRollMessage] = useState("");
  const [cardContextMenu, setCardContextMenu] = useState(null);
  const [deckSearchState, setDeckSearchState] = useState(null);
  const [deckPeekState, setDeckPeekState] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [gameLog, setGameLog] = useState([]);
  const [isShufflingDeck, setIsShufflingDeck] = useState(false);
  const [revealedHiddenCardKeys, setRevealedHiddenCardKeys] = useState([]);
  const [expandedBoardIds, setExpandedBoardIds] = useState([]);

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
    nextRollMessage = rollMessage,
    nextGameLog = gameLog
  ) {
    if (!currentRoom) return;

    await supabase.from("game_state").upsert({
      room_id: currentRoom.id,
      state: {
        players: nextPlayers,
        currentTurnPlayerId: nextTurnPlayerId,
        rollResults: nextRollResults,
        rollMessage: nextRollMessage,
        gameLog: nextGameLog
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
    let nextGameLog = data?.state?.gameLog || [];

    if (!nextPlayers[playerId]) {
      nextPlayers = {
        ...nextPlayers,
        [playerId]: makePlayerState(username.trim(), playerColor, deckCards)
      };
    }

    if (!nextPlayers[playerId].damage) {
      nextPlayers[playerId].damage = {};
    }

    if (!nextPlayers[playerId].tags) {
      nextPlayers[playerId].tags = {};
    }

    if (!nextPlayers[playerId].tokens) {
      nextPlayers[playerId].tokens = {};
    }

    if (!nextPlayers[playerId].attachments) {
      nextPlayers[playerId].attachments = {};
    }

    if (!nextPlayers[playerId].boosts) {
      nextPlayers[playerId].boosts = {};
    }

    if (!nextPlayers[playerId].boostHolding) {
      nextPlayers[playerId].boostHolding = [];
    }

    if (!nextPlayers[playerId].boardPositions) {
      nextPlayers[playerId].boardPositions = {};
    }

    if (!nextPlayers[playerId].revealedCards) {
      nextPlayers[playerId].revealedCards = [];
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
        rollMessage: nextRollMessage,
        gameLog: nextGameLog
      },
      updated_at: new Date().toISOString()
    });

    setPlayers(nextPlayers);
    setCurrentTurnPlayerId(nextTurnPlayerId);
    setRollResults(nextRollResults);
    setRollMessage(nextRollMessage);
    setGameLog(nextGameLog);
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
        rollMessage: "",
        gameLog: [{ id: crypto.randomUUID(), message: `${username.trim()} created the room.`, timestamp: new Date().toISOString() }]
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
    setSelectedMultiCardKeys([]);
    setSelectedMulliganCards([]);
    setJoinCode("");
    setCurrentTurnPlayerId(null);
  }

  async function updateMe(nextMe, logText = null) {
    const previousMe = players[playerId];

    if (previousMe) {
      setUndoStack((current) => [previousMe, ...current].slice(0, 20));
    }

    const nextPlayers = {
      ...players,
      [playerId]: nextMe
    };

    const nextGameLog = logText
      ? [
          {
            id: crypto.randomUUID(),
            message: `${nextMe.username || username || "Player"}: ${logText}`,
            timestamp: new Date().toISOString()
          },
          ...(gameLog || [])
        ].slice(0, 80)
      : (gameLog || []);

    setPlayers(nextPlayers);
    setGameLog(nextGameLog);
    await saveGameState(nextPlayers, currentTurnPlayerId, rollResults, rollMessage, nextGameLog);
  }

  async function undoLastMove() {
    const previousMe = undoStack[0];

    if (!previousMe) {
      setMessage("Nothing to undo.");
      return;
    }

    const nextPlayers = {
      ...players,
      [playerId]: previousMe
    };

    const logEntry = {
      id: crypto.randomUUID(),
      message: `${previousMe.username || username || "Player"}: undid their last move.`,
      timestamp: new Date().toISOString()
    };
    const nextGameLog = [logEntry, ...(gameLog || [])].slice(0, 80);

    setUndoStack((current) => current.slice(1));
    setPlayers(nextPlayers);
    setGameLog(nextGameLog);
    setSelectedCard(null);
    setSelectedCardKey(null);
    setSelectedMultiCardKeys([]);
    setMessage("Undid last move.");
    await saveGameState(nextPlayers, currentTurnPlayerId, rollResults, rollMessage, nextGameLog);
  }

  async function resetGame() {
    const playerEntries = Object.entries(players || {});

    if (playerEntries.length === 0) {
      setMessage("No players to reset.");
      return;
    }

    const confirmed = window.confirm("Are you sure you want to end this game and reset everyone to a fresh opening hand?");
    if (!confirmed) return;

    const nextPlayers = {};

    playerEntries.forEach(([id, player]) => {
      const allCards = [
        ...(player.deck || []),
        ...(player.hand || []),
        ...(player.board || []),
        ...(player.inkwell || []),
        ...(player.discard || []),
        ...(player.boostHolding || []),
        ...Object.values(player.boosts || {}).flat()
      ];

      const shuffledDeck = shuffleArray(allCards);

      nextPlayers[id] = {
        ...player,
        deck: shuffledDeck.slice(7),
        hand: shuffledDeck.slice(0, 7),
        board: [],
        inkwell: [],
        discard: [],
        exerted: [],
        damage: {},
        tags: {},
        tokens: {},
        attachments: {},
        boosts: {},
        boostHolding: [],
        boardPositions: {},
        revealedCards: []
      };
    });

    const nextTurnPlayerId = Object.keys(nextPlayers)[0] || null;
    const nextGameLog = [
      {
        id: crypto.randomUUID(),
        message: `${players[playerId]?.username || username || "Player"}: started a new game.`,
        timestamp: new Date().toISOString()
      }
    ];

    setPlayers(nextPlayers);
    setCurrentTurnPlayerId(nextTurnPlayerId);
    setRollResults([]);
    setRollMessage("");
    setGameLog(nextGameLog);
    setUndoStack([]);
    setSelectedCard(null);
    setSelectedCardKey(null);
    setSelectedMultiCardKeys([]);
    setSelectedMulliganCards([]);
    setRevealedHiddenCardKeys([]);
    setExpandedBoardIds([]);
    setMessage("Started a new game and dealt fresh opening hands.");

    await saveGameState(nextPlayers, nextTurnPlayerId, [], "", nextGameLog);
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
    const zones = ["hand", "board", "inkwell", "discard", "boostHolding"];

    for (const zone of zones) {
      const found = me[zone].find((card, index) => cardKey(card, index) === key);
      if (found) return { card: found, zone };
    }

    return null;
  }

  function cleanBoardMetadata(me, movedKey) {
    const nextTags = { ...(me.tags || {}) };
    const nextTokens = { ...(me.tokens || {}) };
    const nextAttachments = { ...(me.attachments || {}) };
    const nextBoosts = { ...(me.boosts || {}) };
    const nextBoardPositions = { ...(me.boardPositions || {}) };

    delete nextTokens[movedKey];
    delete nextAttachments[movedKey];
    delete nextBoosts[movedKey];
    delete nextBoardPositions[movedKey];

    Object.keys(nextAttachments).forEach((childKey) => {
      if (nextAttachments[childKey] === movedKey) {
        delete nextAttachments[childKey];
      }
    });

    return {
      tags: nextTags,
      tokens: nextTokens,
      attachments: nextAttachments,
      boosts: nextBoosts,
      boardPositions: nextBoardPositions
    };
  }

  function getSelectedBoardCard() {
    const me = players[playerId];
    if (!me || !selectedCardKey) return null;

    const found = me.board.find((card, index) => cardKey(card, index) === selectedCardKey);
    return found || null;
  }

  function getActiveTargetKeys({ boardOnly = false } = {}) {
    const me = players[playerId];
    if (!me || !selectedCardKey) return [];

    const selectedSet = new Set(selectedMultiCardKeys || []);
    const candidateKeys = selectedSet.has(selectedCardKey) && selectedSet.size > 0
      ? [...selectedSet]
      : [selectedCardKey];

    const boardKeys = new Set((me.board || []).map((card, index) => cardKey(card, index)));

    return [...new Set(candidateKeys)].filter((key) => {
      if (boardOnly && !boardKeys.has(key)) return false;
      return Boolean(findCardInZones(me, key));
    });
  }

  async function toggleCardTag(tag) {
    const me = players[playerId];
    const targetKeys = getActiveTargetKeys();

    if (!me || targetKeys.length === 0) {
      setMessage("Select one or more of your cards first.");
      return;
    }

    let finalTag = tag;
    if (tag === "Custom") {
      finalTag = window.prompt("Enter custom tag:");
      if (!finalTag?.trim()) return;
      finalTag = finalTag.trim();
    }

    const nextTags = { ...(me.tags || {}) };
    const selectedHasTag = (nextTags[selectedCardKey] || []).includes(finalTag);

    targetKeys.forEach((key) => {
      const currentTags = nextTags[key] || [];
      nextTags[key] = selectedHasTag
        ? currentTags.filter((existingTag) => existingTag !== finalTag)
        : currentTags.includes(finalTag)
          ? currentTags
          : [...currentTags, finalTag];
    });

    await updateMe({
      ...me,
      tags: nextTags
    }, `${selectedHasTag ? "removed" : "added"} ${finalTag} tag on ${targetKeys.length} card(s).`);
  }

  async function addCardToken(token) {
    const me = players[playerId];
    const targetKeys = getActiveTargetKeys({ boardOnly: true });

    if (!me || targetKeys.length === 0) {
      setMessage("Select one or more of your board cards first.");
      return;
    }

    let finalToken = token;
    if (token === "Custom") {
      finalToken = window.prompt("Enter custom token:");
      if (!finalToken?.trim()) return;
      finalToken = finalToken.trim();
    }

    const nextTokens = { ...(me.tokens || {}) };

    targetKeys.forEach((key) => {
      const currentTokens = nextTokens[key] || [];
      nextTokens[key] = currentTokens.includes(finalToken)
        ? currentTokens
        : [...currentTokens, finalToken];
    });

    await updateMe({
      ...me,
      tokens: nextTokens
    }, `added ${finalToken} token to ${targetKeys.length} card(s).`);
  }

  async function removeCardToken(token) {
    const me = players[playerId];
    const targetKeys = getActiveTargetKeys({ boardOnly: true });

    if (!me || targetKeys.length === 0) return;

    const nextTokens = { ...(me.tokens || {}) };

    targetKeys.forEach((key) => {
      nextTokens[key] = (nextTokens[key] || []).filter((existingToken) => existingToken !== token);
    });

    await updateMe({
      ...me,
      tokens: nextTokens
    }, `removed ${token} token from ${targetKeys.length} card(s).`);
  }

  async function assignSelectedCardTo(targetKey) {
    const me = players[playerId];
    const selectedBoardCard = getSelectedBoardCard();

    if (!me || !selectedCardKey || !selectedBoardCard) {
      setMessage("Select one of your board cards first.");
      return;
    }

    if (!targetKey || targetKey === selectedCardKey) return;

    await updateMe({
      ...me,
      attachments: {
        ...(me.attachments || {}),
        [selectedCardKey]: targetKey
      }
    }, `attached ${cardLabel(selectedBoardCard)} to another card.`);
  }

  async function clearSelectedAssignment() {
    const me = players[playerId];
    if (!me || !selectedCardKey) return;

    const nextAttachments = { ...(me.attachments || {}) };
    delete nextAttachments[selectedCardKey];

    await updateMe({
      ...me,
      attachments: nextAttachments
    });
  }

  function openCardContextMenu(event, card, key, zoneName) {
    event.preventDefault();
    event.stopPropagation();

    if (zoneName !== "inkwell" && zoneName !== "boostHolding") {
      setSelectedCard(card);
      setSelectedCardKey(key);
    }

    setCardContextMenu({
      x: event.clientX,
      y: event.clientY,
      card,
      key,
      zoneName
    });
  }

  function closeCardContextMenu() {
    setCardContextMenu(null);
  }

  function openDeckContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();

    setCardContextMenu({
      kind: "deck",
      x: event.clientX,
      y: event.clientY,
      zoneName: "deck"
    });
  }

  function openZoneContextMenu(event, zoneName) {
    event.preventDefault();
    event.stopPropagation();

    setCardContextMenu({
      kind: "zone",
      x: event.clientX,
      y: event.clientY,
      zoneName
    });
  }

  function deckSearchText(card) {
    return [
      card?.name,
      card?.simpleName,
      card?.type,
      card?.typeLine,
      card?.type_line,
      card?.cardType,
      card?.classification,
      card?.classifications?.join?.(" ")
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  async function searchDeckForType(searchType) {
    startDeckSearch();
  }

  function startDeckSearch() {
    const me = players[playerId];

    if (!me || !me.deck || me.deck.length === 0) {
      setMessage("Your deck is empty.");
      closeCardContextMenu();
      return;
    }

    setDeckSearchState({
      index: 0,
      skippedCards: []
    });
    closeCardContextMenu();
  }

  function buildDeckAfterSearch(deck, index, skippedCards = [], selectedCard = null, placement = "remove") {
    const beforeCurrent = deck.slice(0, index);
    const afterCurrent = deck.slice(index + 1);
    const skippedKeys = new Set((skippedCards || []).map((card) => card.instanceId || card.id || card.name));
    const unskippedBefore = beforeCurrent.filter((card) => !skippedKeys.has(card.instanceId || card.id || card.name));
    const baseDeck = [...unskippedBefore, ...afterCurrent, ...(skippedCards || [])];

    if (!selectedCard || placement === "remove") return baseDeck;
    if (placement === "top") return [selectedCard, ...baseDeck];
    if (placement === "bottom") return [...baseDeck, selectedCard];
    return baseDeck;
  }

  async function takeCurrentDeckSearchCard() {
    const me = players[playerId];
    if (!me || !deckSearchState || !me.deck?.length) return;

    const index = Math.min(deckSearchState.index, me.deck.length - 1);
    const chosenCard = me.deck[index];
    const skippedCards = deckSearchState.skippedCards || [];
    let remainingDeck = buildDeckAfterSearch(me.deck, index, skippedCards, null, "remove");

    if (deckSearchState.shuffleAfter) {
      remainingDeck = shuffleArray(remainingDeck);
    }

    await updateMe({
      ...me,
      deck: remainingDeck,
      hand: [...me.hand, chosenCard]
    }, "searched their deck.");

    setDeckSearchState(null);
    setMessage(`Moved ${cardLabel(chosenCard)} to your hand.`);
  }

  async function putCurrentDeckSearchCardOnTop() {
    const me = players[playerId];
    if (!me || !deckSearchState || !me.deck?.length) return;

    const index = Math.min(deckSearchState.index, me.deck.length - 1);
    const chosenCard = me.deck[index];
    const skippedCards = deckSearchState.skippedCards || [];
    let nextDeck = buildDeckAfterSearch(me.deck, index, skippedCards, chosenCard, "top");

    if (deckSearchState.shuffleAfter) {
      nextDeck = [chosenCard, ...shuffleArray(nextDeck.slice(1))];
    }

    await updateMe({
      ...me,
      deck: nextDeck
    }, "searched their deck.");

    setDeckSearchState(null);
    setMessage(`Put ${cardLabel(chosenCard)} on top of your deck.`);
  }

  async function skipCurrentDeckSearchCard() {
    const me = players[playerId];
    if (!me || !deckSearchState || !me.deck?.length) return;

    const index = Math.min(deckSearchState.index, me.deck.length - 1);
    const currentCard = me.deck[index];
    const skippedCards = [...(deckSearchState.skippedCards || []), currentCard];
    const nextIndex = index + 1;

    if (nextIndex >= me.deck.length) {
      let nextDeck = [...skippedCards];
      if (deckSearchState.shuffleAfter) {
        nextDeck = shuffleArray(nextDeck);
      }

      await updateMe({
        ...me,
        deck: nextDeck
      }, "searched their deck.");

      setDeckSearchState(null);
      setMessage("You looked through the whole deck and did not choose a card.");
      return;
    }

    setDeckSearchState({
      ...deckSearchState,
      index: nextIndex,
      skippedCards
    });
  }

  async function putCurrentDeckSearchCardOnBottom() {
    await skipCurrentDeckSearchCard();
  }

  function toggleDeckSearchShuffleAfter() {
    setDeckSearchState((current) => current ? { ...current, shuffleAfter: !current.shuffleAfter } : current);
  }

  function cancelDeckSearch() {
    setDeckSearchState(null);
    setMessage("Deck search canceled.");
  }

  function startDeckPeek(count = 3) {
    const me = players[playerId];

    if (!me || !me.deck || me.deck.length === 0) {
      setMessage("Your deck is empty.");
      closeCardContextMenu();
      return;
    }

    const safeCount = Math.min(count, me.deck.length);
    setDeckPeekState({
      cards: me.deck.slice(0, safeCount),
      rest: me.deck.slice(safeCount)
    });
    closeCardContextMenu();
  }

  function movePeekCard(index, direction) {
    setDeckPeekState((current) => {
      if (!current) return current;
      const nextCards = [...current.cards];
      const targetIndex = index + direction;

      if (targetIndex < 0 || targetIndex >= nextCards.length) {
        return current;
      }

      [nextCards[index], nextCards[targetIndex]] = [nextCards[targetIndex], nextCards[index]];
      return { ...current, cards: nextCards };
    });
  }

  async function saveDeckPeekOrder() {
    const me = players[playerId];
    if (!me || !deckPeekState) return;

    await updateMe({
      ...me,
      deck: [...deckPeekState.cards, ...deckPeekState.rest]
    }, "looked at and rearranged cards in their deck.");

    setDeckPeekState(null);
    setMessage("Saved top-deck order.");
  }

  function cancelDeckPeek() {
    setDeckPeekState(null);
    setMessage("Peek canceled.");
  }

  async function returnCardsToBottomOfDeck(cardKeys) {
    const me = players[playerId];
    const keys = [...new Set(cardKeys || [])].filter(Boolean);
    if (!me || keys.length === 0) return;

    const selectedSet = new Set(keys);
    const foundCards = keys
      .map((key) => ({ key, found: findCardInZones(me, key) }))
      .filter((entry) => entry.found);

    if (foundCards.length === 0) {
      setMessage("No selected cards found.");
      closeCardContextMenu();
      return;
    }

    const boostCardsToHold = [];
    const nextTags = { ...(me.tags || {}) };
    const nextTokens = { ...(me.tokens || {}) };
    const nextAttachments = { ...(me.attachments || {}) };
    const nextBoosts = { ...(me.boosts || {}) };
    const nextDamage = { ...(me.damage || {}) };
    const nextBoardPositions = { ...(me.boardPositions || {}) };

    for (const { key, found } of foundCards) {
      delete nextDamage[key];
      delete nextTokens[key];
      delete nextAttachments[key];
      delete nextBoardPositions[key];

      if (found.zone === "board" && (me.boosts || {})[key]?.length > 0) {
        boostCardsToHold.push(...((me.boosts || {})[key] || []));
      }

      delete nextBoosts[key];
    }

    Object.keys(nextAttachments).forEach((childKey) => {
      if (selectedSet.has(nextAttachments[childKey])) {
        delete nextAttachments[childKey];
      }
    });

    const movedCards = foundCards.map(({ found }) => found.card);

    const nextMe = {
      ...me,
      hand: me.hand.filter((card, index) => !selectedSet.has(cardKey(card, index))),
      board: me.board.filter((card, index) => !selectedSet.has(cardKey(card, index))),
      inkwell: me.inkwell.filter((card, index) => !selectedSet.has(cardKey(card, index))),
      discard: me.discard.filter((card, index) => !selectedSet.has(cardKey(card, index))),
      boostHolding: (me.boostHolding || []).filter((card, index) => !selectedSet.has(cardKey(card, index))),
      deck: [...me.deck, ...movedCards],
      exerted: (me.exerted || []).filter((key) => !selectedSet.has(key)),
      damage: nextDamage,
      tags: nextTags,
      tokens: nextTokens,
      attachments: nextAttachments,
      boosts: nextBoosts,
      boardPositions: nextBoardPositions
    };

    if (boostCardsToHold.length > 0) {
      nextMe.boostHolding = [...(nextMe.boostHolding || []), ...boostCardsToHold];
    }

    setRevealedHiddenCardKeys((current) => current.filter((key) => !selectedSet.has(key)));

    await updateMe(nextMe, `returned ${movedCards.length} card(s) to the bottom of their deck.`);

    setSelectedCard(null);
    setSelectedCardKey(null);
    setSelectedMultiCardKeys([]);
    setSelectedMulliganCards((cards) => cards.filter((key) => !selectedSet.has(key)));
    closeCardContextMenu();
    setMessage(`Returned ${movedCards.length} card(s) to the bottom of your deck.`);
  }

  async function returnContextCardToBottomOfDeck() {
    if (!cardContextMenu?.key) return;
    await returnCardsToBottomOfDeck([cardContextMenu.key]);
  }

  async function returnSelectedCardsToBottomOfDeck() {
    await returnCardsToBottomOfDeck(selectedMultiCardKeys || []);
  }

  async function moveRandomCardFromZone(sourceZone, targetDestination) {
    const me = players[playerId];
    if (!me || !sourceZone || !Array.isArray(me[sourceZone]) || me[sourceZone].length === 0) {
      setMessage("That zone is empty.");
      closeCardContextMenu();
      return;
    }

    const randomIndex = Math.floor(Math.random() * me[sourceZone].length);
    const randomCard = me[sourceZone][randomIndex];
    const randomKey = cardKey(randomCard, randomIndex);

    if (targetDestination === "bottomDeck") {
      await returnCardsToBottomOfDeck([randomKey]);
      return;
    }

    await moveCardByKey(randomKey, targetDestination);
    closeCardContextMenu();
  }

  async function revealContextCard() {
    if (!cardContextMenu) return;

    setSelectedCard(cardContextMenu.card);
    setSelectedCardKey(cardContextMenu.key);
    setRevealedHiddenCardKeys((current) =>
      current.includes(cardContextMenu.key)
        ? current
        : [...current, cardContextMenu.key]
    );
    closeCardContextMenu();
  }

  async function unrevealContextCard() {
    if (!cardContextMenu) return;

    setRevealedHiddenCardKeys((current) =>
      current.filter((key) => key !== cardContextMenu.key)
    );

    if (selectedCardKey === cardContextMenu.key) {
      setSelectedCard(null);
      setSelectedCardKey(null);
    }

    closeCardContextMenu();
  }

  async function assignCardByDrag(draggedCardPayload, targetKey) {
    const me = players[playerId];
    const draggedKeys = parseDraggedCardKeys(draggedCardPayload);
    const draggedCardKey = draggedKeys[0];

    if (!me || !draggedCardKey || !targetKey || draggedCardKey === targetKey) return;

    const found = findCardInZones(me, draggedCardKey);
    const targetCard = me.board.find((card, index) => cardKey(card, index) === targetKey);

    if (!found || !targetCard) return;

    const draggedTags = me.tags?.[draggedCardKey] || [];
    const targetTags = me.tags?.[targetKey] || [];
    const canAttachItemToCharacter =
      draggedTags.includes("Item") && targetTags.includes("Character");
    const canAssignCharacterToLocation =
      draggedTags.includes("Character") && targetTags.includes("Location");

    if (!canAttachItemToCharacter && !canAssignCharacterToLocation) {
      if (found.zone !== "board") {
        await moveCardByKey(draggedCardPayload, "board");
      } else {
        setMessage("Cards only link when dragging an Item onto a Character, or a Character onto a Location.");
      }
      return;
    }

    const nextMe = {
      ...me,
      hand: found.zone === "hand" ? removeCardFromZone(me.hand, draggedCardKey) : me.hand,
      board: found.zone === "board" ? [...me.board] : [...me.board, found.card],
      inkwell: found.zone === "inkwell" ? removeCardFromZone(me.inkwell, draggedCardKey) : me.inkwell,
      discard: found.zone === "discard" ? removeCardFromZone(me.discard, draggedCardKey) : me.discard,
      boostHolding: found.zone === "boostHolding" ? removeCardFromZone(me.boostHolding || [], draggedCardKey) : (me.boostHolding || []),
      exerted: found.zone === "board" ? (me.exerted || []) : (me.exerted || []).filter((key) => key !== draggedCardKey),
      damage: { ...(me.damage || {}) },
      tags: { ...(me.tags || {}) },
      tokens: { ...(me.tokens || {}) },
      boosts: { ...(me.boosts || {}) },
      attachments: {
        ...(me.attachments || {}),
        [draggedCardKey]: targetKey
      }
    };

    setRevealedHiddenCardKeys((current) => current.filter((key) => key !== draggedCardKey));

    await updateMe(nextMe);

    setSelectedCard(found.card);
    setSelectedCardKey(draggedCardKey);
    setSelectedMultiCardKeys((keys) => keys.filter((key) => key !== draggedCardKey));
    setMessage(`${cardLabel(found.card)} assigned to ${cardLabel(targetCard)}.`);
  }

  async function boostSelectedFromDeck() {
    const me = players[playerId];
    const targetKeys = getActiveTargetKeys({ boardOnly: true });

    if (!me || targetKeys.length === 0) {
      setMessage("Select one or more of your board cards first.");
      return;
    }

    if (!me.deck || me.deck.length === 0) {
      setMessage("Your deck is empty.");
      return;
    }

    const boostCount = Math.min(targetKeys.length, me.deck.length);
    const nextBoosts = { ...(me.boosts || {}) };
    const remainingDeck = [...me.deck];

    targetKeys.slice(0, boostCount).forEach((key) => {
      const boostedCard = makeCardInstance(remainingDeck.shift());
      nextBoosts[key] = [...(nextBoosts[key] || []), boostedCard];
    });

    await updateMe({
      ...me,
      deck: remainingDeck,
      boosts: nextBoosts
    }, `boosted ${boostCount} card(s).`);

    setMessage(`Boosted ${boostCount} selected card(s) from the top of your deck.`);
  }

  async function unboostSelectedToHolding() {
    const me = players[playerId];
    const targetKeys = getActiveTargetKeys({ boardOnly: true });

    if (!me || targetKeys.length === 0) {
      setMessage("Select one or more of your board cards first.");
      return;
    }

    const nextBoosts = { ...(me.boosts || {}) };
    const removedBoosts = [];

    targetKeys.forEach((key) => {
      const currentBoosts = [...((nextBoosts || {})[key] || [])];
      if (currentBoosts.length === 0) return;

      removedBoosts.push(currentBoosts[currentBoosts.length - 1]);

      if (currentBoosts.length <= 1) {
        delete nextBoosts[key];
      } else {
        nextBoosts[key] = currentBoosts.slice(0, -1);
      }
    });

    if (removedBoosts.length === 0) {
      setMessage("Selected card(s) have no boosts to remove.");
      return;
    }

    await updateMe({
      ...me,
      boosts: nextBoosts,
      boostHolding: [...(me.boostHolding || []), ...removedBoosts]
    }, `removed ${removedBoosts.length} boost(s).`);

    setMessage(`Removed ${removedBoosts.length} boost(s) and moved them to Boost Holding.`);
  }

  function parseDraggedCardKeys(draggedCardKey) {
    if (!draggedCardKey) return [];

    try {
      const parsed = JSON.parse(draggedCardKey);
      if (parsed?.type === "multi" && Array.isArray(parsed.keys)) {
        return [...new Set(parsed.keys)].filter(Boolean);
      }
    } catch {
      // Not a multi-card payload. Treat as a normal single card key.
    }

    return [draggedCardKey];
  }

  async function moveMultipleCardsByKeys(draggedCardKeys, targetZone, dropInfo = null) {
    const me = players[playerId];
    if (!me || !Array.isArray(draggedCardKeys) || draggedCardKeys.length === 0) return;

    const uniqueKeys = [...new Set(draggedCardKeys)].filter(Boolean);
    const selectedSet = new Set(uniqueKeys);
    const foundCards = uniqueKeys
      .map((key) => ({ key, found: findCardInZones(me, key) }))
      .filter((entry) => entry.found);

    if (foundCards.length === 0) return;

    const boostCardsToHold = [];
    const nextTags = { ...(me.tags || {}) };
    const nextTokens = { ...(me.tokens || {}) };
    const nextAttachments = { ...(me.attachments || {}) };
    const nextBoosts = { ...(me.boosts || {}) };
    const nextDamage = { ...(me.damage || {}) };
    const nextBoardPositions = { ...(me.boardPositions || {}) };

    if (targetZone !== "board") {
      for (const { key, found } of foundCards) {
        delete nextDamage[key];
        delete nextTokens[key];
        delete nextAttachments[key];
        delete nextBoardPositions[key];

        if (found.zone === "board" && (me.boosts || {})[key]?.length > 0) {
          boostCardsToHold.push(...((me.boosts || {})[key] || []));
        }

        delete nextBoosts[key];
      }

      Object.keys(nextAttachments).forEach((childKey) => {
        if (selectedSet.has(nextAttachments[childKey])) {
          delete nextAttachments[childKey];
        }
      });
    } else {
      // Dropping cards onto the board background means "unassign them".
      // This lets characters leave locations and items leave characters without leaving play.
      for (const { key, found } of foundCards) {
        if (found.zone === "board") {
          delete nextAttachments[key];
        }
      }

      if (dropInfo) {
        foundCards.forEach(({ key }, index) => {
          nextBoardPositions[key] = {
            x: Math.max(0, dropInfo.x + index * 22),
            y: Math.max(0, dropInfo.y + index * 22)
          };
        });
      }
    }

    const movedCards = foundCards.map(({ found }) => found.card);

    const nextMe = {
      ...me,
      hand: me.hand.filter((card, index) => !selectedSet.has(cardKey(card, index))),
      board: me.board.filter((card, index) => !selectedSet.has(cardKey(card, index))),
      inkwell: me.inkwell.filter((card, index) => !selectedSet.has(cardKey(card, index))),
      discard: me.discard.filter((card, index) => !selectedSet.has(cardKey(card, index))),
      boostHolding: (me.boostHolding || []).filter((card, index) => !selectedSet.has(cardKey(card, index))),
      exerted: (me.exerted || []).filter((key) => !selectedSet.has(key)),
      damage: nextDamage,
      tags: nextTags,
      tokens: nextTokens,
      attachments: nextAttachments,
      boosts: nextBoosts,
      boardPositions: nextBoardPositions
    };

    nextMe[targetZone] = [...(nextMe[targetZone] || []), ...movedCards];

    if (boostCardsToHold.length > 0) {
      nextMe.boostHolding = [
        ...(nextMe.boostHolding || []),
        ...boostCardsToHold
      ];
    }

    setRevealedHiddenCardKeys((current) =>
      current.filter((key) => !selectedSet.has(key))
    );

    await updateMe(nextMe, `moved ${movedCards.length} card(s) to ${targetZone}.`);

    const lastMovedCard = movedCards[movedCards.length - 1];
    const lastIndex = nextMe[targetZone].length - 1;
    setSelectedCard(lastMovedCard || null);
    setSelectedCardKey(lastMovedCard ? cardKey(lastMovedCard, lastIndex) : null);
    setSelectedMultiCardKeys([]);
    setSelectedMulliganCards((cards) => cards.filter((key) => !selectedSet.has(key)));

    if (boostCardsToHold.length > 0) {
      setMessage(`Moved ${movedCards.length} card(s) to ${targetZone}. Moved ${boostCardsToHold.length} boosted card(s) to Boost Holding.`);
    } else {
      setMessage(`Moved ${movedCards.length} card(s) to ${targetZone}.`);
    }
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

    const boostCardsToHold =
      found.zone === "board" && targetZone !== "board"
        ? [...((me.boosts || {})[selectedCardKey] || [])]
        : [];

    const nextMe = {
      ...me,
      hand: removeCardFromZone(me.hand, selectedCardKey),
      board: removeCardFromZone(me.board, selectedCardKey),
      inkwell: removeCardFromZone(me.inkwell, selectedCardKey),
      discard: removeCardFromZone(me.discard, selectedCardKey),
      boostHolding: removeCardFromZone(me.boostHolding || [], selectedCardKey),
      exerted: (me.exerted || []).filter((c) => c !== selectedCardKey),
      damage: { ...(me.damage || {}) },
      boosts: { ...(me.boosts || {}) },
      boardPositions: { ...(me.boardPositions || {}) }
    };

    if (targetZone !== "board") {
      delete nextMe.damage[selectedCardKey];
      const cleanedMetadata = cleanBoardMetadata(me, selectedCardKey);
      nextMe.tags = cleanedMetadata.tags;
      nextMe.tokens = cleanedMetadata.tokens;
      nextMe.attachments = cleanedMetadata.attachments;
      nextMe.boosts = cleanedMetadata.boosts;
      nextMe.boardPositions = cleanedMetadata.boardPositions;

      if (boostCardsToHold.length > 0) {
        nextMe.boostHolding = [
          ...(nextMe.boostHolding || []),
          ...boostCardsToHold
        ];
        setMessage(`Moved ${boostCardsToHold.length} boosted card(s) to Boost Holding.`);
      }
    } else {
      nextMe.tags = { ...(me.tags || {}) };
      nextMe.tokens = { ...(me.tokens || {}) };
      nextMe.attachments = { ...(me.attachments || {}) };
      nextMe.boosts = { ...(me.boosts || {}) };

      // If a card already on the board is dropped onto the board background,
      // clear its assignment so it visibly leaves a location/character group.
      if (found.zone === "board") {
        delete nextMe.attachments[selectedCardKey];
      }
    }

    nextMe[targetZone] = [...nextMe[targetZone], found.card];

    setRevealedHiddenCardKeys((current) => current.filter((key) => key !== selectedCardKey));

    await updateMe(nextMe, `moved ${cardLabel(found.card)} to ${targetZone}.`);
    setSelectedCard(null);
    setSelectedCardKey(null);
    setSelectedMulliganCards((cards) => cards.filter((c) => c !== selectedCardKey));
  }


  async function moveCardByKey(draggedCardKey, targetZone, dropInfo = null) {
    const draggedKeys = parseDraggedCardKeys(draggedCardKey);

    if (draggedKeys.length > 1) {
      await moveMultipleCardsByKeys(draggedKeys, targetZone, dropInfo);
      return;
    }

    draggedCardKey = draggedKeys[0];

    const me = players[playerId];
    if (!me || !draggedCardKey) return;

    const found = findCardInZones(me, draggedCardKey);
    if (!found) return;

    const boostCardsToHold =
      found.zone === "board" && targetZone !== "board"
        ? [...((me.boosts || {})[draggedCardKey] || [])]
        : [];

    const nextMe = {
      ...me,
      hand: removeCardFromZone(me.hand, draggedCardKey),
      board: removeCardFromZone(me.board, draggedCardKey),
      inkwell: removeCardFromZone(me.inkwell, draggedCardKey),
      discard: removeCardFromZone(me.discard, draggedCardKey),
      boostHolding: removeCardFromZone(me.boostHolding || [], draggedCardKey),
      exerted: (me.exerted || []).filter((c) => c !== draggedCardKey),
      damage: { ...(me.damage || {}) },
      boosts: { ...(me.boosts || {}) },
      boardPositions: { ...(me.boardPositions || {}) }
    };

    if (targetZone !== "board") {
      delete nextMe.damage[draggedCardKey];
      const cleanedMetadata = cleanBoardMetadata(me, draggedCardKey);
      nextMe.tags = cleanedMetadata.tags;
      nextMe.tokens = cleanedMetadata.tokens;
      nextMe.attachments = cleanedMetadata.attachments;
      nextMe.boosts = cleanedMetadata.boosts;
      nextMe.boardPositions = cleanedMetadata.boardPositions;

      if (boostCardsToHold.length > 0) {
        nextMe.boostHolding = [
          ...(nextMe.boostHolding || []),
          ...boostCardsToHold
        ];
        setMessage(`Moved ${boostCardsToHold.length} boosted card(s) to Boost Holding.`);
      }
    } else {
      nextMe.tags = { ...(me.tags || {}) };
      nextMe.tokens = { ...(me.tokens || {}) };
      nextMe.attachments = { ...(me.attachments || {}) };
      nextMe.boosts = { ...(me.boosts || {}) };

      // If a card already on the board is dropped onto the board background,
      // clear its assignment so it visibly leaves a location/character group.
      if (found.zone === "board") {
        delete nextMe.attachments[draggedCardKey];
      }
    }

    nextMe[targetZone] = [...nextMe[targetZone], found.card];

    setRevealedHiddenCardKeys((current) => current.filter((key) => key !== draggedCardKey));

    await updateMe(nextMe, `moved ${cardLabel(found.card)} to ${targetZone}.`);
    setSelectedCard(found.card);
    setSelectedCardKey(cardKey(found.card, nextMe[targetZone].length - 1));
    setSelectedMultiCardKeys((keys) => keys.filter((key) => key !== draggedCardKey));
    setSelectedMulliganCards((cards) => cards.filter((c) => c !== draggedCardKey));

    if (boostCardsToHold.length === 0) {
      setMessage(`Moved ${cardLabel(found.card)} to ${targetZone}.`);
    }
  }

  async function toggleExert(card, keyOrKeys) {
    const me = players[playerId];
    if (!me) return;

    const keys = Array.isArray(keyOrKeys) ? keyOrKeys.filter(Boolean) : [keyOrKeys].filter(Boolean);
    if (keys.length === 0) return;

    const currentExerted = me.exerted || [];
    const shouldExertAll = keys.some((key) => !currentExerted.includes(key));
    const nextExerted = shouldExertAll
      ? [...new Set([...currentExerted, ...keys])]
      : currentExerted.filter((key) => !keys.includes(key));

    await updateMe({
      ...me,
      exerted: nextExerted
    }, `${shouldExertAll ? "exerted" : "readied"} ${keys.length} card(s).`);
  }

  async function changeLore(amount) {
    const me = players[playerId];
    if (!me) return;

    await updateMe({
      ...me,
      lore: Math.max(0, me.lore + amount)
    }, `${amount > 0 ? "gained" : "lost"} ${Math.abs(amount)} lore.`);
  }

  async function readyAllCards() {
    const me = players[playerId];
    if (!me) return;

    const cantReadyBoardKeys = me.board
      .map((card, index) => cardKey(card, index))
      .filter((key) => (me.tokens?.[key] || []).includes("Can't Ready"));

    await updateMe({
      ...me,
      exerted: (me.exerted || []).filter((key) => cantReadyBoardKeys.includes(key))
    }, "readied all eligible cards.");
  }

  async function changeDamage(amount) {
    const me = players[playerId];
    if (!me || !selectedCardKey) {
      setMessage("Select one of your board cards first.");
      return;
    }

    const boardKeys = me.board.map((card, index) => cardKey(card, index));
    const selectedBoardKeys = [...new Set(selectedMultiCardKeys || [])].filter((key) =>
      boardKeys.includes(key)
    );

    const targetKeys = selectedBoardKeys.includes(selectedCardKey) && selectedBoardKeys.length > 0
      ? selectedBoardKeys
      : boardKeys.includes(selectedCardKey)
        ? [selectedCardKey]
        : [];

    if (targetKeys.length === 0) {
      setMessage("Select one of your board cards first.");
      return;
    }

    const nextDamage = { ...(me.damage || {}) };

    targetKeys.forEach((key) => {
      nextDamage[key] = Math.max(0, (nextDamage[key] || 0) + amount);
    });

    await updateMe({
      ...me,
      damage: nextDamage
    }, `${amount > 0 ? "added" : "removed"} damage on ${targetKeys.length} card(s).`);

    if (targetKeys.length > 1) {
      setMessage(`${amount > 0 ? "Added" : "Removed"} damage on ${targetKeys.length} selected card(s).`);
    }
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
    }, "drew a card.");
  }

  async function shuffleDeck() {
    const me = players[playerId];
    if (!me || !me.deck) return;

    setIsShufflingDeck(true);

    await updateMe({
      ...me,
      deck: shuffleArray(me.deck)
    }, "shuffled their deck.");

    setTimeout(() => setIsShufflingDeck(false), 650);
  }

  async function mulliganHand() {
    const me = players[playerId];
    if (!me || !me.deck) return;

    const newDeck = [...me.deck, ...me.hand];
    const shuffledDeck = shuffleArray(newDeck);

    await updateMe({
      ...me,
      deck: shuffledDeck.slice(7),
      hand: shuffledDeck.slice(0, 7)
    }, "mulliganed their hand.");

    setSelectedCard(null);
    setSelectedCardKey(null);
    setSelectedMultiCardKeys([]);
    setSelectedMulliganCards([]);
  }

  async function mulliganMultiSelected() {
    const me = players[playerId];
    const selectedKeys = [...new Set(selectedMultiCardKeys || [])];

    if (!me || selectedKeys.length === 0) {
      setMessage("Shift-click one or more cards in your hand first.");
      return;
    }

    const selectedSet = new Set(selectedKeys);
    const selectedHandCards = me.hand.filter((card, index) => selectedSet.has(cardKey(card, index)));

    if (selectedHandCards.length === 0) {
      setMessage("Only cards in your hand can be mulliganed this way.");
      return;
    }

    const keptHand = me.hand.filter((card, index) => !selectedSet.has(cardKey(card, index)));
    const deckWithReturnedCards = [...me.deck, ...selectedHandCards];
    const shuffledDeck = shuffleArray(deckWithReturnedCards);

    const replacementCount = selectedHandCards.length;
    const replacementCards = shuffledDeck.slice(0, replacementCount);
    const remainingDeck = shuffledDeck.slice(replacementCount);

    await updateMe({
      ...me,
      hand: [...keptHand, ...replacementCards],
      deck: remainingDeck
    });

    setSelectedCard(null);
    setSelectedCardKey(null);
    setSelectedMultiCardKeys([]);
    setSelectedMulliganCards([]);
    closeCardContextMenu();
    setMessage(`Mulliganed ${replacementCount} selected card(s).`);
  }

  async function revealMultiSelectedToPlayers() {
    const me = players[playerId];
    const selectedKeys = [...new Set(selectedMultiCardKeys || [])];

    if (!me || selectedKeys.length === 0) {
      setMessage("Shift-click one or more cards first.");
      return;
    }

    const otherPlayers = Object.entries(players).filter(([id]) => id !== playerId);

    if (otherPlayers.length === 0) {
      setMessage("There are no other players to reveal cards to.");
      return;
    }

    const playerChoices = otherPlayers
      .map(([id, player], index) => `${index + 1}. ${player.username || `Player ${index + 1}`}`)
      .join("\n");

    const answer = window.prompt(
      `Reveal selected cards to which player(s)?\nType all, or numbers separated by commas.\n\n${playerChoices}`
    );

    if (!answer?.trim()) return;

    const cleanAnswer = answer.trim().toLowerCase();
    let targetPlayerIds = [];

    if (cleanAnswer === "all") {
      targetPlayerIds = otherPlayers.map(([id]) => id);
    } else {
      targetPlayerIds = answer
        .split(/[, ]+/)
        .map((part) => Number(part.trim()))
        .filter((number) => Number.isInteger(number) && number >= 1 && number <= otherPlayers.length)
        .map((number) => otherPlayers[number - 1][0]);
    }

    targetPlayerIds = [...new Set(targetPlayerIds)];

    if (targetPlayerIds.length === 0) {
      setMessage("No valid players selected.");
      return;
    }

    const revealedCards = selectedKeys
      .map((key) => {
        const found = findCardInZones(me, key);
        return found ? { key, card: found.card, zone: found.zone } : null;
      })
      .filter(Boolean);

    if (revealedCards.length === 0) {
      setMessage("No selected cards were found to reveal.");
      return;
    }

    const revealBatchId = crypto.randomUUID();
    const nextRevealedCards = [
      ...((me.revealedCards || []).filter((reveal) => reveal?.key && !selectedKeys.includes(reveal.key))),
      ...revealedCards.map((entry) => ({
        id: crypto.randomUUID(),
        batchId: revealBatchId,
        key: entry.key,
        card: entry.card,
        zone: entry.zone,
        toPlayerIds: targetPlayerIds,
        fromPlayerId: playerId,
        fromUsername: me.username || username || "Player",
        revealedAt: new Date().toISOString()
      }))
    ];

    await updateMe({
      ...me,
      revealedCards: nextRevealedCards
    }, `revealed ${revealedCards.length} card(s).`);

    closeCardContextMenu();
    setMessage(`Revealed ${revealedCards.length} selected card(s).`);
  }

  async function clearMyRevealedCards() {
    const me = players[playerId];
    if (!me) return;

    await updateMe({
      ...me,
      revealedCards: []
    }, "cleared their revealed cards.");

    setSelectedMultiCardKeys([]);
    closeCardContextMenu();
    setMessage("Cleared revealed cards.");
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
    const shuffledDeck = shuffleArray(deckWithReturnedCards);

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
    setSelectedMultiCardKeys([]);
    setSelectedMulliganCards([]);
  }

  function playKnockSound() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      const audioContext = new AudioContext();
      const masterGain = audioContext.createGain();
      masterGain.gain.value = 0.18;
      masterGain.connect(audioContext.destination);

      const playKnock = (startTime) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(120, startTime);
        oscillator.frequency.exponentialRampToValueAtTime(55, startTime + 0.08);

        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.exponentialRampToValueAtTime(1, startTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.14);

        oscillator.connect(gain);
        gain.connect(masterGain);
        oscillator.start(startTime);
        oscillator.stop(startTime + 0.16);
      };

      const now = audioContext.currentTime;
      playKnock(now);
      playKnock(now + 0.18);

      setTimeout(() => audioContext.close(), 700);
    } catch {
      // Sound is optional; gameplay still works if the browser blocks audio.
    }
  }

  async function finishTurn() {
    playKnockSound();
    await nextTurn();
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
          const nextGameLog = payload.new?.state?.gameLog;

          if (nextPlayers) setPlayers(nextPlayers);
          if (nextTurnPlayerId !== undefined) setCurrentTurnPlayerId(nextTurnPlayerId);
          if (nextRollResults !== undefined) setRollResults(nextRollResults);
          if (nextRollMessage !== undefined) setRollMessage(nextRollMessage);
          if (nextGameLog !== undefined) setGameLog(nextGameLog || []);
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
        <div
          style={roomPanelStyle}
          onClick={() => {
            closeCardContextMenu();
            setSelectedMultiCardKeys([]);
          }}
        >
          <h1>Lorcana Table 🎴</h1>

          <h2>
            Room: <span style={{ color: "#facc15" }}>{currentRoom.code}</span>
          </h2>

          <DailyVideoChatPanel
            room={currentRoom}
            username={me?.username || username || "Player"}
          />

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

          <div style={roomMainLayoutStyle}>
            <div style={playerSidebarStyle}>
              <h3>Players</h3>
              {playerList.map(([id, player]) => {
                const isCurrentTurn = id === currentTurnPlayerId;

                return (
                  <div
                    key={id}
                    style={{
                      ...playerSidebarRowStyle,
                      borderColor: player.color || "#374151",
                      boxShadow: isCurrentTurn
                        ? `0 0 14px ${player.color || "#facc15"}`
                        : "none"
                    }}
                  >
                    <div>
                      <div
                        style={{
                          color: player.color || "white",
                          fontWeight: "bold"
                        }}
                      >
                        {player.username}
                      </div>

                      {isCurrentTurn && (
                        <small style={{ color: "#facc15", fontWeight: "bold" }}>
                          Current Turn
                        </small>
                      )}
                    </div>

                    <div style={playerLoreBadgeStyle}>
                      <span style={{ fontSize: "22px", fontWeight: "bold" }}>
                        {player.lore}
                      </span>
                      <small>Lore</small>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={playersGridStyle}>
              {playerList.map(([id, player]) => {
                const isCurrentTurn = id === currentTurnPlayerId;

                return (
                  <div
                    key={id}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setExpandedBoardIds((current) =>
                        current.includes(id)
                          ? current.filter((boardId) => boardId !== id)
                          : [...current, id]
                      );
                    }}
                    title="Right-click to enlarge or restore this board"
                    style={{
                      ...seatStyle,
                      ...(expandedBoardIds.includes(id) ? expandedSeatStyle : {}),
                      borderColor: player.color || "#374151",
                      boxShadow: isCurrentTurn
                        ? `0 0 20px ${player.color || "#facc15"}`
                        : "none"
                    }}
                  >
                    <h3 style={{ color: player.color || "white" }}>
                      {player.username}
                    </h3>
                    <p style={boardZoomHintStyle}>
                      {expandedBoardIds.includes(id)
                        ? "Right-click again to restore"
                        : "Right-click board to enlarge"}
                    </p>

                    <MiniCards
                      cards={player.board}
                      exertedCards={player.exerted || []}
                      damage={player.damage || {}}
                      tags={player.tags || {}}
                      tokens={player.tokens || {}}
                      attachments={player.attachments || {}}
                      boosts={player.boosts || {}}
                    />

                    <RevealedCardsPanel
                      cards={(player.revealedCards || []).filter((reveal) =>
                        id === playerId || (reveal.toPlayerIds || []).includes(playerId)
                      )}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {me && (
            <>
              <div style={gameAreaStyle}>
                <div style={topPlayRowStyle}>
                  <div style={smallDeckZoneStyle}>
                    <h2 style={compactZoneTitleStyle}>Deck</h2>
                    <button
                      onClick={drawCard}
                      onContextMenu={openDeckContextMenu}
                      className={isShufflingDeck ? "deck-shuffle-animate" : ""}
                      style={smallDeckPileStyle}
                    >
                      <div style={{ fontSize: "13px", fontWeight: "bold" }}>DECK</div>
                      <div style={{ fontSize: "24px", fontWeight: "bold" }}>
                        {me.deck?.length || 0}
                      </div>
                      <div style={{ fontSize: "10px" }}>Draw</div>
                    </button>

                    <div style={deckActionStackStyle}>
                      <button onClick={readyAllCards} style={deckActionButtonStyle}>
                        Ready All
                      </button>
                      <button onClick={() => changeLore(1)} style={deckActionButtonStyle}>
                        Lore+
                      </button>
                      <button onClick={() => changeLore(-1)} style={deckActionButtonStyle}>
                        Lore-
                      </button>
                      <button onClick={finishTurn} style={yellowDoneButtonStyle}>
                        I'm Done
                      </button>
                      <button onClick={shuffleDeck} style={deckActionButtonStyle}>
                        Shuffle Deck
                      </button>
                      <button onClick={undoLastMove} style={deckActionButtonStyle}>
                        Undo Last Move
                      </button>
                      <button onClick={rollForFirstPlayer} style={deckActionButtonStyle}>
                        Roll For First Player
                      </button>
                      <button onClick={leaveRoom} style={deckActionButtonStyle}>
                        Leave Room
                      </button>
                      <button onClick={resetGame} style={dangerDeckActionButtonStyle}>
                        New Game / Reset
                      </button>
                    </div>
                  </div>

                  <Zone
                    title="Your Hand"
                    zoneName="hand"
                    cards={me.hand}
                    selectedCardKey={selectedCardKey}
                    selectedMultiCardKeys={selectedMultiCardKeys}
                    revealedHiddenCardKeys={revealedHiddenCardKeys}
                    setSelectedMultiCardKeys={setSelectedMultiCardKeys}
                    setSelectedCard={setSelectedCard}
                    setSelectedCardKey={setSelectedCardKey}
                    selectedMulliganCards={selectedMulliganCards}
                    onCardClick={(card, key) => {
                      setSelectedCard(card);
                      setSelectedCardKey(key);
                    }}
                    onDropCard={moveCardByKey}
                    onCardContextMenu={openCardContextMenu}
                    onZoneContextMenu={openZoneContextMenu}
                    tags={me.tags || {}}
                    tokens={me.tokens || {}}
                  />

                  <Zone
                    title="Your Board"
                    zoneName="board"
                    cards={me.board}
                    selectedCardKey={selectedCardKey}
                    selectedMultiCardKeys={selectedMultiCardKeys}
                    revealedHiddenCardKeys={revealedHiddenCardKeys}
                    setSelectedMultiCardKeys={setSelectedMultiCardKeys}
                    setSelectedCard={setSelectedCard}
                    setSelectedCardKey={setSelectedCardKey}
                    exertedCards={me.exerted || []}
                    damage={me.damage || {}}
                    tags={me.tags || {}}
                    tokens={me.tokens || {}}
                    attachments={me.attachments || {}}
                    boosts={me.boosts || {}}
                    boardPositions={me.boardPositions || {}}
                    onDoubleClickCard={toggleExert}
                    onDropCard={moveCardByKey}
                    onCardDropOnCard={assignCardByDrag}
                    onCardContextMenu={openCardContextMenu}
                    onZoneContextMenu={openZoneContextMenu}
                  />
                </div>

                <div style={bottomPlayRowStyle}>
                  <Zone
                    title="Your Inkwell"
                    zoneName="inkwell"
                    cards={me.inkwell}
                    selectedCardKey={selectedCardKey}
                    selectedMultiCardKeys={selectedMultiCardKeys}
                    revealedHiddenCardKeys={revealedHiddenCardKeys}
                    setSelectedMultiCardKeys={setSelectedMultiCardKeys}
                    setSelectedCard={setSelectedCard}
                    setSelectedCardKey={setSelectedCardKey}
                    exertedCards={me.exerted || []}
                    onDoubleClickCard={toggleExert}
                    onDropCard={moveCardByKey}
                    onCardContextMenu={openCardContextMenu}
                    onZoneContextMenu={openZoneContextMenu}
                  />

                  <Zone
                    title="Your Discard"
                    zoneName="discard"
                    cards={me.discard}
                    selectedCardKey={selectedCardKey}
                    selectedMultiCardKeys={selectedMultiCardKeys}
                    revealedHiddenCardKeys={revealedHiddenCardKeys}
                    setSelectedMultiCardKeys={setSelectedMultiCardKeys}
                    setSelectedCard={setSelectedCard}
                    setSelectedCardKey={setSelectedCardKey}
                    onDropCard={moveCardByKey}
                    onCardContextMenu={openCardContextMenu}
                    onZoneContextMenu={openZoneContextMenu}
                    tags={me.tags || {}}
                    tokens={me.tokens || {}}
                  />

                  {(me.boostHolding || []).length > 0 && (
                    <Zone
                      title="Boost Holding"
                      zoneName="boostHolding"
                      cards={me.boostHolding || []}
                      selectedCardKey={selectedCardKey}
                      selectedMultiCardKeys={selectedMultiCardKeys}
                      revealedHiddenCardKeys={revealedHiddenCardKeys}
                      setSelectedMultiCardKeys={setSelectedMultiCardKeys}
                      setSelectedCard={setSelectedCard}
                      setSelectedCardKey={setSelectedCardKey}
                      onDropCard={moveCardByKey}
                    />
                  )}
                </div>
              </div>

              <p>
                Mulligan selected:{" "}
                <strong style={{ color: "#38bdf8" }}>
                  {selectedMulliganCards.length}
                </strong>
                {selectedMultiCardKeys.length > 0 && (
                  <>
                    {" | "}
                    Multi-selected:{" "}
                    <strong style={{ color: "#22c55e" }}>
                      {selectedMultiCardKeys.length}
                    </strong>
                  </>
                )}
              </p>

            </>
          )}

          {cardContextMenu && me && (
            <CardContextMenu
              menu={cardContextMenu}
              tags={me.tags || {}}
              tokens={me.tokens || {}}
              onClose={closeCardContextMenu}
              onReveal={revealContextCard}
              onUnreveal={unrevealContextCard}
              revealedHiddenCardKeys={revealedHiddenCardKeys}
              onToggleTag={toggleCardTag}
              onAddToken={addCardToken}
              onRemoveToken={removeCardToken}
              onClearAssignment={clearSelectedAssignment}
              onBoostFromDeck={boostSelectedFromDeck}
              onUnboostToHolding={unboostSelectedToHolding}
              onMulliganSelected={mulliganMultiSelected}
              onMoveSelectedTo={(targetZone) => moveMultipleCardsByKeys(selectedMultiCardKeys, targetZone)}
              onRevealSelectedToPlayers={revealMultiSelectedToPlayers}
              onClearRevealedCards={clearMyRevealedCards}
              hasRevealedCards={(me.revealedCards || []).length > 0}
              onReturnCardToBottomDeck={returnContextCardToBottomOfDeck}
              onReturnSelectedToBottomDeck={returnSelectedCardsToBottomOfDeck}
              onSearchDeckFor={searchDeckForType}
              onPeekDeck={startDeckPeek}
              onMoveRandomZoneCard={moveRandomCardFromZone}
              onChangeDamage={changeDamage}
              selectedMultiCardKeys={selectedMultiCardKeys}
            />
          )}

          {deckSearchState && me && (
            <DeckSearchOverlay
              deck={me.deck || []}
              searchState={deckSearchState}
              onTake={takeCurrentDeckSearchCard}
              onPutTop={putCurrentDeckSearchCardOnTop}
              onPutBottom={putCurrentDeckSearchCardOnBottom}
              onSkip={skipCurrentDeckSearchCard}
              onToggleShuffleAfter={toggleDeckSearchShuffleAfter}
              onCancel={cancelDeckSearch}
            />
          )}

          {deckPeekState && (
            <DeckPeekOverlay
              peekState={deckPeekState}
              onMoveCard={movePeekCard}
              onSave={saveDeckPeekOrder}
              onCancel={cancelDeckPeek}
            />
          )}

          <GameLog entries={gameLog} />

          {selectedCard && (
            <p>
              Selected: <strong style={{ color: "#facc15" }}>{cardLabel(selectedCard)}</strong>
            </p>
          )}

          {message && <p>{message}</p>}
        </div>
      </div>
    );
  }

  return (
    <div style={loginPageStyle}>
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

function GameLog({ entries = [] }) {
  if (!entries.length) return null;

  return (
    <div style={gameLogPanelStyle}>
      <div style={gameLogTitleStyle}>Game Log</div>
      <div style={gameLogListStyle}>
        {entries.slice(0, 12).map((entry) => (
          <div key={entry.id || entry.timestamp} style={gameLogEntryStyle}>
            <span>{entry.message}</span>
            {entry.timestamp && (
              <small>{new Date(entry.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DeckPeekOverlay({ peekState, onMoveCard, onSave, onCancel }) {
  if (!peekState || !peekState.cards?.length) return null;

  return (
    <div style={deckSearchOverlayStyle}>
      <div style={deckSearchModalStyle}>
        <h2>Peek / Rearrange Top of Deck</h2>
        <p style={helperTextStyle}>Leftmost card will be the top card after saving.</p>

        <div style={deckPeekRowStyle}>
          {peekState.cards.map((card, index) => (
            <div key={card.instanceId || `${card.id}-${index}`} style={deckPeekCardWrapStyle}>
              <CardVisual card={card} isMini />
              <div style={deckSearchButtonRowStyle}>
                <button onClick={() => onMoveCard(index, -1)} style={smallButtonStyle} disabled={index === 0}>←</button>
                <button onClick={() => onMoveCard(index, 1)} style={smallButtonStyle} disabled={index === peekState.cards.length - 1}>→</button>
              </div>
              <small>Position {index + 1}</small>
            </div>
          ))}
        </div>

        <div style={deckSearchButtonRowStyle}>
          <button onClick={onSave} style={{ ...buttonStyle, background: "#facc15", color: "#111827" }}>Save Order</button>
          <button onClick={onCancel} style={buttonStyle}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function DeckSearchOverlay({ deck = [], searchState, onTake, onPutTop, onPutBottom, onSkip, onToggleShuffleAfter, onCancel }) {
  if (!searchState || deck.length === 0) return null;

  const safeIndex = Math.min(searchState.index || 0, deck.length - 1);
  const card = deck[safeIndex];
  const skippedCount = (searchState.skippedCards || []).length;

  return (
    <div
      style={deckSearchOverlayStyle}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div style={deckSearchModalStyle}>
        <h2 style={{ marginTop: 0 }}>Search Deck</h2>
        <p style={helperTextStyle}>
          Card {safeIndex + 1} of {deck.length}. Skipped cards go to the bottom.
        </p>

        <div style={deckSearchCardFrameStyle}>
          <CardVisual card={card} />
        </div>

        <strong style={{ color: "#facc15" }}>{cardLabel(card)}</strong>

        <div style={deckSearchButtonRowStyle}>
          <button onClick={onTake} style={{ ...buttonStyle, background: "#22c55e", color: "#052e16" }}>
            Take to Hand
          </button>
          <button onClick={onPutTop} style={{ ...buttonStyle, background: "#facc15", color: "#111827" }}>
            Put on Top
          </button>
          <button onClick={onPutBottom} style={buttonStyle}>
            Put on Bottom / Next
          </button>
          <button
            onClick={onToggleShuffleAfter}
            style={{
              ...buttonStyle,
              background: searchState.shuffleAfter ? "#22c55e" : "#374151",
              color: searchState.shuffleAfter ? "#052e16" : "white"
            }}
          >
            {searchState.shuffleAfter ? "✓ Shuffle After Search" : "Shuffle After Search"}
          </button>
          <button onClick={onCancel} style={{ ...buttonStyle, background: "#7f1d1d" }}>
            Cancel Search
          </button>
        </div>

        {skippedCount > 0 && (
          <small style={helperTextStyle}>
            {skippedCount} skipped card(s) waiting to go to the bottom.
          </small>
        )}
      </div>
    </div>
  );
}


function DailyVideoChatPanel({ room, username }) {
  const containerRef = useRef(null);
  const callFrameRef = useRef(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [videoMessage, setVideoMessage] = useState("");

  const roomUrl = String(import.meta.env.VITE_DAILY_ROOM_URL || "").trim();
  const displayRoomName = roomUrl
    ? roomUrl.replace(/^https?:\/\//, "")
    : "";

  useEffect(() => {
    return () => {
      if (callFrameRef.current) {
        callFrameRef.current.destroy();
        callFrameRef.current = null;
      }
    };
  }, []);

  async function joinVideoChat() {
    if (!roomUrl) {
      setVideoMessage("Add VITE_DAILY_ROOM_URL to your environment first, then restart the dev server.");
      setIsExpanded(true);
      return;
    }

    setIsExpanded(true);
    setVideoMessage("");

    // Let React render the normal video container before Daily creates its iframe.
    await new Promise((resolve) => setTimeout(resolve, 0));

    if (!containerRef.current) {
      setVideoMessage("Video container is still loading. Click Join Video again.");
      return;
    }

    try {
      if (!callFrameRef.current) {
        callFrameRef.current = DailyIframe.createFrame(containerRef.current, {
          showLeaveButton: true,
          showFullscreenButton: false,
          iframeStyle: {
            position: "relative",
            display: "block",
            width: "100%",
            height: "100%",
            border: "0",
            borderRadius: "12px",
            background: "#020617"
          }
        });

        callFrameRef.current.on("left-meeting", () => {
          setIsJoined(false);
          setVideoMessage("Left video chat.");
        });

        callFrameRef.current.on("joined-meeting", () => {
          setIsJoined(true);
          setVideoMessage("");
        });
      }

      await callFrameRef.current.join({
        url: roomUrl,
        userName: username || "Player"
      });
    } catch (error) {
      setVideoMessage(error?.message || "Could not join Daily video chat.");
    }
  }

  async function leaveVideoChat() {
    try {
      await callFrameRef.current?.leave();
    } catch {
      // Video is optional; ignore leave errors.
    }

    setIsJoined(false);
  }

  return (
    <>
      <div style={dailyVideoPanelStyle} onClick={(event) => event.stopPropagation()}>
        <div style={dailyVideoHeaderStyle}>
        <div>
          <strong>🎥 Video Chat</strong>
          <div style={dailyVideoSubtextStyle}>
            {roomUrl
              ? `Daily room: ${displayRoomName}`
              : "Set VITE_DAILY_ROOM_URL to enable embedded video."}
          </div>
        </div>

        <div style={dailyVideoButtonRowStyle}>
          <button
            onClick={() => setIsExpanded((current) => !current)}
            style={smallButtonStyle}
          >
            {isExpanded ? "Collapse" : "Show"}
          </button>

          {!isJoined ? (
            <button onClick={joinVideoChat} style={yellowDoneButtonStyle}>
              Join Video
            </button>
          ) : (
            <button onClick={leaveVideoChat} style={deckActionButtonStyle}>
              Leave Video
            </button>
          )}
        </div>
      </div>

      {videoMessage && <p style={dailyVideoMessageStyle}>{videoMessage}</p>}

        <div
          style={{
            ...dailyVideoFrameWrapStyle,
            display: isExpanded || isJoined ? "block" : "none"
          }}
        >
          <div ref={containerRef} style={dailyVideoFrameStyle} />
        </div>
      </div>

    </>
  );
}

function RevealedCardsPanel({ cards = [] }) {
  if (!cards.length) return null;

  return (
    <div style={revealedCardsPanelStyle}>
      <div style={revealedCardsTitleStyle}>Revealed to you</div>
      <div style={revealedCardsRowStyle}>
        {cards.map((reveal) => (
          <div key={reveal.id || `${reveal.key}-${reveal.revealedAt}`} style={revealedCardWrapStyle}>
            <CardVisual card={reveal.card} isMini />
          </div>
        ))}
      </div>
    </div>
  );
}

function InkwellCardBack() {
  return (
    <div style={inkwellCardBackStyle}>
      <div style={inkwellCardBackInnerStyle}>
        <div style={inkwellCardBackSparkleStyle}>✦</div>
        <div style={inkwellCardBackTitleStyle}>LORCANA</div>
        <div style={inkwellCardBackSubtitleStyle}>INKWELL</div>
      </div>
    </div>
  );
}

function CardVisual({
  card,
  isMini = false,
  damageAmount = 0,
  tokens = [],
  assignmentText = "",
  attachedText = "",
  boostCount = 0,
  isRotated = false,
  isLocation = false,
  faceDown = false,
  displayRotated = false,
  forcePortraitHover = false,
  isMultiSelected = false
}) {
  const imageUrl = cardImage(card);

  if (faceDown) {
    return (
      <div
        style={{
          ...(displayRotated ? rotatedVisibleCardWrapStyle : {}),
          ...(isMultiSelected ? selectedVisibleCardOutlineStyle : {})
        }}
      >
        <InkwellCardBack />
      </div>
    );
  }

  if (imageUrl) {
    return (
      <>
        <img
          src={imageUrl}
          alt={cardLabel(card)}
          style={{
            ...(isMini ? miniCardImageStyle : cardImageStyle),
            ...(displayRotated ? rotatedVisibleCardImageStyle : {}),
            ...(isMultiSelected ? selectedVisibleCardOutlineStyle : {})
          }}
        />

        <div
          className="card-hover-preview"
          style={{
            ...hoverPreviewPanelStyle,
            ...(!forcePortraitHover && isRotated ? hoverPreviewCounterRotateStyle : {})
          }}
        >
          <div style={hoverPreviewCardWrapStyle}>
            <img
              src={imageUrl}
              alt={cardLabel(card)}
              style={{
                ...hoverPreviewImageStyle,
                ...(isLocation && !forcePortraitHover ? hoverPreviewLandscapeImageStyle : {})
              }}
            />

            {damageAmount > 0 && (
              <div style={hoverDamageBadgeStyle}>
                {damageAmount}
              </div>
            )}

            {boostCount > 0 && (
              <div style={hoverBoostBadgeStyle}>
                ⚡ Boost {boostCount}
              </div>
            )}

            {(tokens.length > 0 || assignmentText || attachedText) && (
              <div style={hoverMetaPanelStyle}>
                {tokens.length > 0 && (
                  <div style={hoverMetaRowStyle}>
                    {tokens.map((token) => (
                      <span key={token} style={hoverTokenBadgeStyle}>{token}</span>
                    ))}
                  </div>
                )}

                {assignmentText && (
                  <div style={hoverAssignmentTextStyle}>{assignmentText}</div>
                )}

                {attachedText && (
                  <div style={hoverAssignmentTextStyle}>{attachedText}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  return <span>{cardLabel(card)}</span>;
}


function CardContextMenu({
  menu,
  tags = {},
  tokens = {},
  onClose,
  onReveal,
  onUnreveal,
  revealedHiddenCardKeys = [],
  onToggleTag,
  onAddToken,
  onRemoveToken,
  onBoostFromDeck,
  onUnboostToHolding,
  onMulliganSelected,
  onMoveSelectedTo,
  onRevealSelectedToPlayers,
  onClearRevealedCards,
  hasRevealedCards = false,
  onReturnCardToBottomDeck,
  onReturnSelectedToBottomDeck,
  onSearchDeckFor,
  onPeekDeck,
  onMoveRandomZoneCard,
  onChangeDamage,
  selectedMultiCardKeys = []
}) {
  const selectedTags = tags[menu.key] || [];
  const selectedTokens = tokens[menu.key] || [];
  const isInkwell = menu.zoneName === "inkwell";
  const isRevealed = revealedHiddenCardKeys.includes(menu.key);

  if (menu.kind === "deck") {
    return (
      <div
        style={{
          ...contextMenuStyle,
          left: Math.max(8, Math.min(menu.x, window.innerWidth - 288)),
          top: Math.max(8, Math.min(menu.y, window.innerHeight - 220)),
          bottom: "auto"
        }}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <strong>Deck</strong>
        <button
          onClick={() => onSearchDeckFor?.()}
          style={{ ...contextMenuButtonStyle, background: "#facc15", color: "#111827" }}
        >
          Search Deck
        </button>
        <small style={contextMenuHintStyle}>
          Look through cards one at a time. Skipped cards go to the bottom when you choose one.
        </small>
        <div style={contextMenuSectionStyle}>Peek / Rearrange</div>
        <button onClick={() => onPeekDeck?.(1)} style={contextMenuButtonStyle}>Peek Top 1</button>
        <button onClick={() => onPeekDeck?.(3)} style={contextMenuButtonStyle}>Peek Top 3</button>
        <button onClick={() => onPeekDeck?.(5)} style={contextMenuButtonStyle}>Peek Top 5</button>
      </div>
    );
  }

  if (menu.kind === "zone") {
    const zoneLabel = { hand: "Your Hand", board: "Your Board", inkwell: "Your Inkwell", discard: "Your Discard" }[menu.zoneName] || menu.zoneName;

    return (
      <div
        style={{
          ...contextMenuStyle,
          left: Math.max(8, Math.min(menu.x, window.innerWidth - 288)),
          top: Math.max(8, Math.min(menu.y, window.innerHeight - 360)),
          bottom: "auto"
        }}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <strong>{zoneLabel}</strong>
        <div style={contextMenuSectionStyle}>Move Random Card To</div>
        <button onClick={() => onMoveRandomZoneCard?.(menu.zoneName, "inkwell")} style={contextMenuButtonStyle}>Inkwell</button>
        <button onClick={() => onMoveRandomZoneCard?.(menu.zoneName, "hand")} style={contextMenuButtonStyle}>Your Hand</button>
        <button onClick={() => onMoveRandomZoneCard?.(menu.zoneName, "board")} style={contextMenuButtonStyle}>Your Board</button>
        <button onClick={() => onMoveRandomZoneCard?.(menu.zoneName, "discard")} style={contextMenuButtonStyle}>Discard</button>
        <button onClick={() => onMoveRandomZoneCard?.(menu.zoneName, "bottomDeck")} style={contextMenuButtonStyle}>Bottom of Deck</button>
      </div>
    );
  }

  return (
    <div
      style={{
        ...contextMenuStyle,
        left: Math.max(8, Math.min(menu.x, window.innerWidth - 288)),
        top: Math.max(8, Math.min(menu.y, window.innerHeight - 440)),
        bottom: "auto"
      }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <strong>{cardLabel(menu.card)}</strong>

      {hasRevealedCards && (
        <button
          onClick={() => onClearRevealedCards?.()}
          style={{ ...contextMenuButtonStyle, background: "#475569" }}
        >
          Clear Revealed Cards
        </button>
      )}

      {menu.zoneName === "hand" && selectedMultiCardKeys.includes(menu.key) && selectedMultiCardKeys.length > 0 && (
        <>
          <button
            onClick={() => onMulliganSelected?.()}
            style={{ ...contextMenuButtonStyle, background: "#22c55e", color: "#052e16" }}
          >
            Mulligan Selected
          </button>
          <button
            onClick={() => onRevealSelectedToPlayers?.()}
            style={{ ...contextMenuButtonStyle, background: "#16a34a", color: "#052e16" }}
          >
            Reveal Selected To...
          </button>
          <button
            onClick={() => onReturnSelectedToBottomDeck?.()}
            style={{ ...contextMenuButtonStyle, background: "#0f172a" }}
          >
            Return Selected to Bottom of Deck
          </button>
        </>
      )}

      {menu.zoneName === "board" && selectedMultiCardKeys.includes(menu.key) && selectedMultiCardKeys.length > 0 && (
        <>
          <div style={contextMenuSectionStyle}>Selected Cards</div>
          <button
            onClick={() => {
              onMoveSelectedTo?.("discard");
              onClose();
            }}
            style={{ ...contextMenuButtonStyle, background: "#7f1d1d" }}
          >
            Move Selected to Discard
          </button>
          <button
            onClick={() => {
              onMoveSelectedTo?.("inkwell");
              onClose();
            }}
            style={{ ...contextMenuButtonStyle, background: "#1d4ed8" }}
          >
            Move Selected to Inkwell
          </button>
          <button
            onClick={() => onRevealSelectedToPlayers?.()}
            style={{ ...contextMenuButtonStyle, background: "#16a34a", color: "#052e16" }}
          >
            Reveal Selected To...
          </button>
          <button
            onClick={() => onReturnSelectedToBottomDeck?.()}
            style={{ ...contextMenuButtonStyle, background: "#0f172a" }}
          >
            Return Selected to Bottom of Deck
          </button>
        </>
      )}

      {isInkwell ? (
        isRevealed ? (
          <button onClick={onUnreveal} style={contextMenuButtonStyle}>
            Unreveal Card
          </button>
        ) : (
          <button onClick={onReveal} style={contextMenuButtonStyle}>
            Reveal Card
          </button>
        )
      ) : (
        <>
          <div style={contextMenuSectionStyle}>Actions</div>
          <div style={contextMenuHintStyle}>Click repeatedly to add/remove multiple.</div>
          <button
            onClick={() => {
              onChangeDamage?.(1);
            }}
            style={{ ...contextMenuButtonStyle, background: "#7f1d1d" }}
          >
            Damage+
          </button>
          <button
            onClick={() => {
              onChangeDamage?.(-1);
            }}
            style={{ ...contextMenuButtonStyle, background: "#374151" }}
          >
            Damage-
          </button>
          <button
            onClick={() => {
              onBoostFromDeck?.();
            }}
            style={{ ...contextMenuButtonStyle, background: "#facc15", color: "#111827" }}
          >
            Boost+
          </button>
          <button
            onClick={() => {
              onUnboostToHolding?.();
            }}
            style={{ ...contextMenuButtonStyle, background: "#581c87" }}
          >
            Boost-
          </button>
          <button
            onClick={() => onReturnCardToBottomDeck?.()}
            style={{ ...contextMenuButtonStyle, background: "#0f172a" }}
          >
            Return Card to Bottom of Deck
          </button>

          <div style={contextMenuSectionStyle}>Tags</div>
          {CARD_TAG_OPTIONS.map((tag) => (
            <button
              key={tag}
              onClick={() => {
                onToggleTag(tag);
                if (tag !== "Custom") onClose();
              }}
              style={{
                ...contextMenuButtonStyle,
                background: selectedTags.includes(tag) ? "#facc15" : "#374151",
                color: selectedTags.includes(tag) ? "#111827" : "white"
              }}
            >
              {selectedTags.includes(tag) ? `✓ ${tag}` : tag}
            </button>
          ))}

          <div style={contextMenuSectionStyle}>Tokens</div>
          {CARD_TOKEN_OPTIONS.map((token) => (
            <button
              key={token}
              onClick={() => {
                selectedTokens.includes(token) ? onRemoveToken(token) : onAddToken(token);
                if (token !== "Custom") onClose();
              }}
              style={{
                ...contextMenuButtonStyle,
                background: selectedTokens.includes(token) ? "#7c2d12" : "#374151"
              }}
            >
              {selectedTokens.includes(token) ? `Remove ${token}` : `+ ${token}`}
            </button>
          ))}

        </>
      )}
    </div>
  );
}

function BoardCardTools({
  selectedCardKey,
  selectedCard,
  boardCards,
  tags = {},
  tokens = {},
  attachments = {},
  onToggleTag,
  onAddToken,
  onRemoveToken,
  onAssignTo,
  onClearAssignment,
  onBoostFromDeck
}) {
  const selectedTags = tags[selectedCardKey] || [];
  const selectedTokens = tokens[selectedCardKey] || [];
  const assignmentTargetKey = attachments[selectedCardKey];
  const boardEntries = boardCards.map((card, index) => ({
    card,
    key: cardKey(card, index),
    tags: tags[cardKey(card, index)] || []
  }));
  const selectedIsItem = selectedTags.includes("Item");
  const selectedIsCharacter = selectedTags.includes("Character");
  const validTargets = boardEntries.filter(({ key, tags: cardTags }) => {
    if (key === selectedCardKey) return false;
    if (selectedIsItem) return cardTags.includes("Character");
    if (selectedIsCharacter) return cardTags.includes("Location") || cardTags.includes("Item");
    return cardTags.includes("Location") || cardTags.includes("Character") || cardTags.includes("Item");
  });
  const assignedTarget = boardEntries.find((entry) => entry.key === assignmentTargetKey);

  return (
    <div style={boardToolsStyle}>
      <h3>Board Tools</h3>
      <p style={helperTextStyle}>
        Selected board card: <strong>{cardLabel(selectedCard)}</strong>
      </p>

      <div>
        <strong>Tags</strong>
        <div>
          {CARD_TAG_OPTIONS.map((tag) => (
            <button
              key={tag}
              onClick={() => onToggleTag(tag)}
              style={{
                ...smallButtonStyle,
                margin: "4px",
                background: selectedTags.includes(tag) ? "#facc15" : "#374151",
                color: selectedTags.includes(tag) ? "#111827" : "white"
              }}
            >
              {selectedTags.includes(tag) ? `✓ ${tag}` : tag}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: "10px" }}>
        <strong>Tokens</strong>
        <div>
          {CARD_TOKEN_OPTIONS.map((token) => (
            <button
              key={token}
              onClick={() => onAddToken(token)}
              style={{ ...smallButtonStyle, margin: "4px", background: "#374151", color: "white" }}
            >
              + {token}
            </button>
          ))}
        </div>

        {selectedTokens.length > 0 && (
          <div style={tokenListStyle}>
            {selectedTokens.map((token) => (
              <button
                key={token}
                onClick={() => onRemoveToken(token)}
                style={tokenBadgeStyle}
                title="Click to remove token"
              >
                {token} ×
              </button>
            ))}
          </div>
        )}
      </div>



      <div style={{ marginTop: "10px" }}>
        <strong>Assign / Attach</strong>
        <p style={helperTextStyle}>
          Use this for items attached to characters, or characters at locations.
        </p>

        {assignedTarget && (
          <p style={helperTextStyle}>
            Currently assigned to: <strong>{cardLabel(assignedTarget.card)}</strong>
          </p>
        )}

        {validTargets.length === 0 ? (
          <p style={helperTextStyle}>
            Tag another board card as Character, Item, or Location to assign this card.
          </p>
        ) : (
          <div>
            {validTargets.map(({ card, key, tags: cardTags }) => (
              <button
                key={key}
                onClick={() => onAssignTo(key)}
                style={{ ...smallButtonStyle, margin: "4px" }}
              >
                Assign to {cardLabel(card)} {cardTags.length ? `(${cardTags.join(", ")})` : ""}
              </button>
            ))}
          </div>
        )}

        <button onClick={onClearAssignment} style={{ ...smallButtonStyle, margin: "4px" }}>
          Clear Assignment
        </button>
      </div>
    </div>
  );
}

function MiniCards({ cards, exertedCards = [], damage = {}, tags = {}, tokens = {}, attachments = {}, boosts = {} }) {
  if (!cards.length) return <p style={{ color: "#9ca3af" }}>Empty</p>;

  const entries = cards.map((card, index) => ({
    card,
    key: cardKey(card, index),
    tags: tags[cardKey(card, index)] || [],
    tokens: tokens[cardKey(card, index)] || []
  }));

  const locationEntries = entries.filter((entry) => entry.tags.includes("Location"));
  const attachedKeys = new Set(Object.keys(attachments || {}));

  function cardNameForKey(key) {
    return cardLabel(entries.find((entry) => entry.key === key)?.card || "");
  }

  function childrenFor(parentKey) {
    return entries.filter((entry) => attachments[entry.key] === parentKey);
  }

  function itemChildrenFor(parentKey) {
    return childrenFor(parentKey).filter((entry) => entry.tags.includes("Item"));
  }

  function nonItemChildrenFor(parentKey) {
    return childrenFor(parentKey).filter((entry) => !entry.tags.includes("Item"));
  }

  function isInsideLocation(entry) {
    if (!attachments[entry.key]) return false;

    let parentKey = attachments[entry.key];
    const visited = new Set();

    while (parentKey && !visited.has(parentKey)) {
      visited.add(parentKey);
      const parentEntry = entries.find((possibleParent) => possibleParent.key === parentKey);
      if (!parentEntry) return false;
      if (parentEntry.tags.includes("Location")) return true;
      parentKey = attachments[parentKey];
    }

    return false;
  }

  const unassignedEntries = entries.filter(
    (entry) => !entry.tags.includes("Location") && !attachedKeys.has(entry.key) && !isInsideLocation(entry)
  );

  function renderMiniCard(entry, compact = false) {
    const { card, key } = entry;
    const attachedChildren = childrenFor(key);
    const parentName = attachments[key] ? cardNameForKey(attachments[key]) : "";
    const isLocationCard = (tags[key] || []).includes("Location");
    const isExertedCard = exertedCards.includes(key);
    const boostCount = (boosts[key] || []).length;

    return (
      <div
        key={key}
        style={{
          ...miniCardStyle,
          ...(compact ? compactMiniCardStyle : {}),
          transform: isExertedCard || isLocationCard
            ? "rotate(90deg) scale(0.9)"
            : "none",
          overflow: "visible"
        }}
      >
        <CardVisual
          card={card}
          isMini
          damageAmount={damage[key] || 0}
          boostCount={boostCount}
          tokens={tokens[key] || []}
          assignmentText={parentName ? `↳ ${parentName}` : ""}
          attachedText={
            attachedChildren.length > 0
              ? `+ ${attachedChildren.map((child) => cardLabel(child.card)).join(", ")}`
              : ""
          }
          isRotated={isExertedCard || isLocationCard}
          isLocation={isLocationCard}
        />

        {(damage[key] || 0) > 0 && (
          <div style={damageBadgeStyle}>
            {damage[key]}
          </div>
        )}

        {boostCount > 0 && (
          <div style={boostCountBadgeStyle}>
            ⚡ {boostCount}
          </div>
        )}

        {(tokens[key] || []).length > 0 && (
          <div style={miniTokenRowStyle}>
            {(tokens[key] || []).map((token) => (
              <span key={token} style={miniTokenBadgeStyle}>{token}</span>
            ))}
          </div>
        )}

        {parentName && (
          <div style={assignmentNoteStyle}>↳ {parentName}</div>
        )}

        {attachedChildren.length > 0 && (
          <div style={assignmentNoteStyle}>
            + {attachedChildren.map((child) => cardLabel(child.card)).join(", ")}
          </div>
        )}
      </div>
    );
  }

  function renderMiniCluster(entry, compact = false) {
    const itemChildren = itemChildrenFor(entry.key);

    return (
      <div key={`cluster-${entry.key}`} style={miniAttachedClusterStyle}>
        {renderMiniCard(entry, compact)}
        {itemChildren.length > 0 && (
          <div style={miniAttachedItemsRowStyle}>
            {itemChildren.map((itemEntry, itemIndex) => (
              <div
                key={`attached-item-${itemEntry.key}`}
                style={itemIndex > 0 ? { marginLeft: "-44px" } : {}}
              >
                {renderMiniCard(itemEntry, true)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={miniBoardLayoutStyle}>
      {unassignedEntries.length > 0 && (
        <div style={miniBoardSectionStyle}>
          <div style={miniBoardSectionTitleStyle}>Unassigned</div>
          <div style={miniCardGroupRowStyle}>
            {unassignedEntries.map((entry) => renderMiniCluster(entry))}
          </div>
        </div>
      )}

      {locationEntries.length > 0 && (
        <div style={miniBoardSectionStyle}>
          <div style={miniBoardSectionTitleStyle}>Locations</div>
          <div style={miniLocationGridStyle}>
            {locationEntries.map((locationEntry) => {
              const directChildren = nonItemChildrenFor(locationEntry.key);
              const characterChildren = directChildren.filter((entry) => !entry.tags.includes("Location"));
              const directItemChildren = itemChildrenFor(locationEntry.key);

              return (
                <div key={locationEntry.key} style={miniLocationLaneStyle}>
                  <div style={miniLocationHeaderStyle}>
                    {renderMiniCard(locationEntry)}
                  </div>

                  <div style={miniLocationContentsStyle}>
                    <div style={miniBoardSubheadingStyle}>At this location</div>
                    {characterChildren.length > 0 ? (
                      <div style={miniCardGroupRowStyle}>
                        {characterChildren.map((entry) => renderMiniCluster(entry, true))}
                      </div>
                    ) : (
                      <p style={miniEmptyTextStyle}>No characters here</p>
                    )}

                    {directItemChildren.length > 0 && (
                      <>
                        <div style={miniBoardSubheadingStyle}>Items / Attached</div>
                        <div style={miniCardGroupRowStyle}>
                          {directItemChildren.map((entry) => renderMiniCard(entry, true))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Zone({
  title,
  zoneName,
  cards,
  selectedCardKey,
  selectedMultiCardKeys = [],
  revealedHiddenCardKeys = [],
  setSelectedMultiCardKeys,
  setSelectedCard,
  setSelectedCardKey,
  selectedMulliganCards = [],
  onCardClick,
  exertedCards = [],
  damage = {},
  onDoubleClickCard,
  onDropCard,
  onCardDropOnCard,
  onCardContextMenu,
  onZoneContextMenu,
  tags = {},
  tokens = {},
  attachments = {},
  boosts = {},
  boardPositions = {}
}) {
  const isInkwellZone = zoneName === "inkwell";
  const isDiscardZone = zoneName === "discard";
  const isBoardZone = zoneName === "board";
  const isHandZone = zoneName === "hand";
  const clickTimerRef = useRef(null);

  const cardEntries = cards.map((card, index) => ({
    card,
    key: cardKey(card, index),
    index,
    tags: tags[cardKey(card, index)] || [],
    tokens: tokens[cardKey(card, index)] || []
  }));

  const entryByKey = new Map(cardEntries.map((entry) => [entry.key, entry]));

  function handleZoneDragOver(event) {
    if (!onDropCard || !zoneName) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function getBoardDropInfo(event) {
    if (zoneName !== "board") return null;
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, event.clientX - rect.left - 70),
      y: Math.max(0, event.clientY - rect.top - 90)
    };
  }

  function handleZoneDrop(event) {
    if (!onDropCard || !zoneName) return;
    event.preventDefault();
    event.stopPropagation();

    const draggedCardKey = event.dataTransfer.getData("text/plain");
    if (!draggedCardKey) return;

    onDropCard(draggedCardKey, zoneName, getBoardDropInfo(event));
  }

  function childrenFor(parentKey) {
    return cardEntries.filter((entry) => attachments?.[entry.key] === parentKey);
  }

  function itemChildrenFor(parentKey) {
    return childrenFor(parentKey).filter((entry) => (tags?.[entry.key] || []).includes("Item"));
  }

  function nonItemChildrenFor(parentKey) {
    return childrenFor(parentKey).filter((entry) => !(tags?.[entry.key] || []).includes("Item"));
  }

  function isInsideLocation(entry) {
    if (!attachments?.[entry.key]) return false;

    let parentKey = attachments[entry.key];
    const visited = new Set();

    while (parentKey && !visited.has(parentKey)) {
      visited.add(parentKey);
      const parentEntry = entryByKey.get(parentKey);
      if (!parentEntry) return false;
      if ((tags?.[parentEntry.key] || []).includes("Location")) return true;
      parentKey = attachments[parentKey];
    }

    return false;
  }

  function renderInteractiveCard(entry, options = {}) {
    const { compact = false, shellStyle = {}, suppressAssignmentText = false } = options;
    const { card, key, index } = entry;
    const isMultiSelected = selectedMultiCardKeys.includes(key);
    const isMulliganSelected = selectedMulliganCards.includes(key);
    const cardDamage = damage[key] || 0;
    const cardTags = tags[key] || [];
    const cardTokens = tokens[key] || [];
    const boostCount = (boosts[key] || []).length;
    const isLocationCard = cardTags.includes("Location");
    const isExertedCard = exertedCards.includes(key);
    const isRotatedCard = isInkwellZone
      ? isExertedCard
      : isDiscardZone
        ? isExertedCard
        : isExertedCard || isLocationCard;
    const parentCard = cards.find((possibleParent, parentIndex) => cardKey(possibleParent, parentIndex) === attachments[key]);
    const attachedChildren = cards.filter((possibleChild, childIndex) => attachments[cardKey(possibleChild, childIndex)] === key);

    return (
      <button
        key={key}
        draggable
        onDragStart={(event) => {
          const draggedKeys = selectedMultiCardKeys.includes(key) && selectedMultiCardKeys.length > 1
            ? selectedMultiCardKeys
            : [key];

          event.dataTransfer.setData(
            "text/plain",
            draggedKeys.length > 1
              ? JSON.stringify({ type: "multi", keys: draggedKeys })
              : key
          );
          event.dataTransfer.effectAllowed = "move";
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (event.detail > 1) return;

          if (event.shiftKey) {
            event.preventDefault();
            event.stopPropagation();

            setSelectedCard(card);
            setSelectedCardKey(key);
            setSelectedMultiCardKeys?.((current) =>
              current.includes(key)
                ? current.filter((existingKey) => existingKey !== key)
                : [...current, key]
            );
            return;
          }

          if (isInkwellZone) {
            return;
          }

          setSelectedMultiCardKeys?.([]);

          if (onCardClick) {
            onCardClick(card, key);
          } else {
            setSelectedCard(card);
            setSelectedCardKey(key);
          }
        }}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();

          if (clickTimerRef.current) {
            clearTimeout(clickTimerRef.current);
            clickTimerRef.current = null;
          }

          if (isInkwellZone) {
            const keysToToggle = selectedMultiCardKeys.includes(key) && selectedMultiCardKeys.length > 1
              ? selectedMultiCardKeys
              : [key];
            onDoubleClickCard?.(card, keysToToggle);
            return;
          }

          setSelectedCard(card);
          setSelectedCardKey(key);
          setSelectedMultiCardKeys?.([]);
          onDoubleClickCard?.(card, key);
        }}
        onDragEnter={handleZoneDragOver}
        onDragOver={handleZoneDragOver}
        onDrop={(event) => {
          if (!onDropCard || !zoneName) return;
          event.preventDefault();
          event.stopPropagation();

          const draggedCardKey = event.dataTransfer.getData("text/plain");
          if (!draggedCardKey) return;

          if (zoneName === "board" && onCardDropOnCard && draggedCardKey !== key) {
            onCardDropOnCard(draggedCardKey, key);
            return;
          }

          onDropCard(draggedCardKey, zoneName, getBoardDropInfo(event));
        }}
        onContextMenu={(event) => {
          onCardContextMenu?.(event, card, key, zoneName);
        }}
        style={{
          ...(isInkwellZone ? inkwellCardStyle : isDiscardZone ? discardCardStyle : isHandZone ? handCardStyle : cardStyle),
          ...(compact ? compactBoardCardStyle : {}),
          ...(isInkwellZone && isRotatedCard ? inkwellExertedCardShellStyle : {}),
          ...(isInkwellZone && index > 0 ? { marginLeft: "-38px" } : {}),
          ...(isDiscardZone && index > 0 ? { marginLeft: "-48px" } : {}),
          ...shellStyle,
          border: isMultiSelected && !isInkwellZone
            ? "4px dashed #22c55e"
            : isInkwellZone
              ? "1px solid transparent"
              : isMulliganSelected
                ? "3px solid #38bdf8"
                : selectedCardKey === key
                  ? "3px solid #facc15"
                  : "1px solid #374151",
          transform: isInkwellZone ? "none" : isRotatedCard ? "rotate(90deg)" : "none"
        }}
      >
        <CardVisual
          card={card}
          faceDown={zoneName === "inkwell" && !revealedHiddenCardKeys.includes(key)}
          damageAmount={cardDamage}
          boostCount={boostCount}
          tokens={cardTokens}
          assignmentText={!suppressAssignmentText && parentCard ? `↳ ${cardLabel(parentCard)}` : ""}
          attachedText={
            !suppressAssignmentText && attachedChildren.length > 0
              ? `+ ${attachedChildren.map((child) => cardLabel(child)).join(", ")}`
              : ""
          }
          isRotated={isRotatedCard}
          isLocation={isLocationCard}
          displayRotated={isInkwellZone && isRotatedCard}
          forcePortraitHover={isInkwellZone}
          isMultiSelected={isInkwellZone && isMultiSelected}
        />

        {cardDamage > 0 && (
          <div style={damageBadgeStyle}>
            {cardDamage}
          </div>
        )}

        {boostCount > 0 && (
          <div style={boostCountBadgeStyle}>
            ⚡ {boostCount}
          </div>
        )}

        {cardTokens.length > 0 && (
          <div style={cardMetaRowStyle}>
            {cardTokens.map((token) => (
              <span key={token} style={tokenBadgeStyle}>{token}</span>
            ))}
          </div>
        )}
      </button>
    );
  }

  function renderBoardCluster(entry, compact = false) {
    const itemChildren = itemChildrenFor(entry.key);

    return (
      <div key={`board-cluster-${entry.key}`} style={boardVisibleClusterStyle}>
        {renderInteractiveCard(entry, { compact, suppressAssignmentText: true })}
        {itemChildren.length > 0 && (
          <div style={boardVisibleAttachedItemsStyle}>
            {itemChildren.map((itemEntry, itemIndex) => (
              <div
                key={`board-attached-item-${itemEntry.key}`}
                style={itemIndex > 0 ? { marginLeft: "-74px" } : {}}
              >
                {renderInteractiveCard(itemEntry, {
                  compact: true,
                  suppressAssignmentText: true,
                  shellStyle: { margin: 0 }
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderBoardContents() {
    const locationEntries = cardEntries.filter((entry) => (tags?.[entry.key] || []).includes("Location"));
    const attachedKeys = new Set(Object.keys(attachments || {}));
    const unassignedEntries = cardEntries.filter(
      (entry) => !(tags?.[entry.key] || []).includes("Location") && !attachedKeys.has(entry.key) && !isInsideLocation(entry)
    );

    return (
      <div style={yourBoardStructuredLayoutStyle}>
        {unassignedEntries.length > 0 && (
          <div style={yourBoardSectionStyle}>
            <div style={yourBoardSectionTitleStyle}>Unassigned</div>
            <div style={yourBoardCardGroupRowStyle}>
              {unassignedEntries.map((entry) => renderBoardCluster(entry))}
            </div>
          </div>
        )}

        {locationEntries.length > 0 && (
          <div style={yourBoardSectionStyle}>
            <div style={yourBoardSectionTitleStyle}>Locations</div>
            <div style={yourLocationGridStyle}>
              {locationEntries.map((locationEntry) => {
                const directChildren = nonItemChildrenFor(locationEntry.key);
                const characterChildren = directChildren.filter((entry) => !(tags?.[entry.key] || []).includes("Location"));
                const directItemChildren = itemChildrenFor(locationEntry.key);

                return (
                  <div key={`your-location-${locationEntry.key}`} style={yourLocationLaneStyle}>
                    <div style={yourLocationHeaderStyle}>
                      {renderInteractiveCard(locationEntry, { suppressAssignmentText: true })}
                    </div>

                    <div style={yourLocationContentsStyle}>
                      <div style={miniBoardSubheadingStyle}>At this location</div>
                      {characterChildren.length > 0 ? (
                        <div style={yourLocationCharacterRowStyle}>
                          {characterChildren.map((entry) => renderBoardCluster(entry, true))}
                        </div>
                      ) : (
                        <p style={miniEmptyTextStyle}>No characters here</p>
                      )}

                      {directItemChildren.length > 0 && (
                        <>
                          <div style={miniBoardSubheadingStyle}>Items / Attached</div>
                          <div style={yourBoardCardGroupRowStyle}>
                            {directItemChildren.map((entry) => renderInteractiveCard(entry, {
                              compact: true,
                              suppressAssignmentText: true
                            }))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        ...zoneStyle,
        ...(isInkwellZone ? inkwellZoneStyle : {})
      }}
      onDragEnter={handleZoneDragOver}
      onDragOver={handleZoneDragOver}
      onDrop={handleZoneDrop}
      onContextMenu={(event) => {
        const clickedCard = event.target.closest?.("button");
        if (!clickedCard) {
          onZoneContextMenu?.(event, zoneName);
        }
      }}
    >
      <h2>{title}</h2>
      <p>{cards.length} card(s)</p>
      <p style={helperTextStyle}>
        {isInkwellZone
          ? "Face down. Double-click to exert/ready. Right-click to reveal/unreveal. Shift-click to multi-select."
          : "Drag cards here to move them to this zone. Shift-click to multi-select. Right-click for card tools."}
      </p>

      <div
        style={isInkwellZone ? inkwellCardRowStyle : isDiscardZone ? discardCardRowStyle : isBoardZone ? boardPlaymatStructuredStyle : cardRowStyle}
        onDragEnter={handleZoneDragOver}
        onDragOver={handleZoneDragOver}
        onDrop={handleZoneDrop}
      >
        {isBoardZone
          ? renderBoardContents()
          : cardEntries.map((entry) => renderInteractiveCard(entry))}
      </div>
    </div>
  );
}


const boardPlaymatStructuredStyle = {
  minHeight: "520px",
  borderRadius: "10px",
  background: "rgba(15, 23, 42, 0.35)",
  border: "1px dashed rgba(148, 163, 184, 0.35)",
  overflow: "visible",
  padding: "14px",
  boxSizing: "border-box"
};

const yourBoardStructuredLayoutStyle = {
  display: "grid",
  gap: "14px",
  alignItems: "start"
};

const yourBoardSectionStyle = {
  border: "1px solid #374151",
  borderRadius: "12px",
  background: "#020617",
  padding: "12px",
  overflow: "visible"
};

const yourBoardSectionTitleStyle = {
  color: "#facc15",
  fontWeight: "bold",
  fontSize: "14px",
  marginBottom: "10px",
  textAlign: "left"
};

const yourBoardCardGroupRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "26px",
  justifyContent: "center",
  alignItems: "flex-start",
  overflow: "visible"
};

const yourLocationGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
  gap: "16px",
  alignItems: "start",
  overflow: "visible"
};

const yourLocationLaneStyle = {
  border: "1px solid #334155",
  borderRadius: "12px",
  background: "#111827",
  padding: "12px",
  overflow: "visible"
};

const yourLocationHeaderStyle = {
  display: "flex",
  justifyContent: "center",
  marginBottom: "8px",
  overflow: "visible"
};

const yourLocationContentsStyle = {
  borderTop: "1px dashed #475569",
  paddingTop: "10px",
  overflow: "visible"
};

const yourLocationCharacterRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "10px 18px",
  justifyContent: "center",
  alignItems: "flex-start",
  overflow: "visible"
};

const boardVisibleClusterStyle = {
  display: "grid",
  justifyItems: "center",
  gap: "0",
  overflow: "visible",
  position: "relative"
};

const boardVisibleAttachedItemsStyle = {
  display: "flex",
  flexWrap: "nowrap",
  justifyContent: "center",
  alignItems: "flex-start",
  gap: "0px",
  marginTop: "-86px",
  marginLeft: "40px",
  marginBottom: "12px",
  overflow: "visible",
  position: "relative",
  zIndex: 50
};

const compactBoardCardStyle = {
  width: "108px",
  minHeight: "150px"
};

const miniAttachedClusterStyle = {
  display: "grid",
  justifyItems: "center",
  gap: "0",
  overflow: "visible",
  position: "relative"
};

const miniAttachedItemsRowStyle = {
  display: "flex",
  flexWrap: "nowrap",
  justifyContent: "center",
  alignItems: "flex-start",
  gap: "0px",
  paddingTop: "0px",
  marginTop: "-48px",
  marginLeft: "22px",
  marginBottom: "10px",
  overflow: "visible",
  position: "relative",
  zIndex: 40
};

const contextMenuStyle = {
  position: "fixed",
  zIndex: 30000,
  minWidth: "190px",
  maxWidth: "260px",
  maxHeight: "min(420px, calc(100vh - 24px))",
  overflowY: "auto",
  overscrollBehavior: "contain",
  display: "grid",
  gap: "6px",
  padding: "10px",
  borderRadius: "12px",
  border: "1px solid #facc15",
  background: "#020617",
  color: "white",
  boxShadow: "0 12px 30px rgba(0,0,0,0.55)",
  textAlign: "left"
};

const contextMenuButtonStyle = {
  padding: "7px 9px",
  borderRadius: "8px",
  border: "1px solid #374151",
  background: "#374151",
  color: "white",
  cursor: "pointer",
  textAlign: "left",
  fontWeight: "bold"
};

const contextMenuHintStyle = {
  color: "#9ca3af",
  fontSize: "11px",
  padding: "2px 10px 6px",
  textAlign: "center"
};

const contextMenuSectionStyle = {
  marginTop: "4px",
  color: "#facc15",
  fontSize: "12px",
  fontWeight: "bold",
  textTransform: "uppercase"
};

const revealedCardsPanelStyle = {
  marginTop: "10px",
  border: "1px dashed #22c55e",
  borderRadius: "10px",
  padding: "8px",
  background: "rgba(20, 83, 45, 0.25)"
};

const revealedCardsTitleStyle = {
  color: "#86efac",
  fontWeight: "bold",
  fontSize: "12px",
  marginBottom: "6px"
};

const revealedCardsRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
  justifyContent: "center"
};

const revealedCardWrapStyle = {
  width: "70px",
  minHeight: "98px",
  position: "relative",
  overflow: "visible"
};

const pageStyle = {
  minHeight: "100vh",
  background: "#0f172a",
  color: "white",
  display: "block",
  fontFamily: "Arial, sans-serif",
  padding: "8px",
  boxSizing: "border-box"
};

const loginPageStyle = {
  minHeight: "100vh",
  background: "#0f172a",
  color: "white",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  fontFamily: "Arial, sans-serif",
  padding: "8px",
  boxSizing: "border-box"
};

const panelStyle = {
  width: "min(90vw, 900px)",
  margin: "0 auto",
  border: "1px solid #374151",
  borderRadius: "16px",
  padding: "24px",
  background: "#111827",
  textAlign: "center"
};

const roomPanelStyle = {
  width: "100%",
  maxWidth: "none",
  border: "none",
  borderRadius: "0",
  padding: "10px",
  background: "#111827",
  textAlign: "center",
  boxSizing: "border-box"
};


const dailyVideoPanelStyle = {
  position: "relative",
  zIndex: 20,
  border: "1px solid #374151",
  borderRadius: "14px",
  background: "#020617",
  padding: "10px 14px",
  margin: "0 0 12px",
  textAlign: "left",
  boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
  boxSizing: "border-box"
};

const dailyVideoSpacerStyle = {
  width: "100%",
  flexShrink: 0
};

const dailyVideoHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap"
};

const dailyVideoSubtextStyle = {
  color: "#9ca3af",
  fontSize: "12px",
  marginTop: "4px"
};

const dailyVideoButtonRowStyle = {
  display: "flex",
  gap: "8px",
  alignItems: "center",
  flexWrap: "wrap"
};

const dailyVideoFrameWrapStyle = {
  marginTop: "8px",
  height: "320px",
  maxHeight: "44vh",
  borderRadius: "12px",
  overflow: "hidden",
  border: "1px solid #1f2937",
  background: "#020617"
};

const dailyVideoFrameStyle = {
  width: "100%",
  height: "100%"
};

const dailyVideoMessageStyle = {
  color: "#facc15",
  margin: "8px 0 0"
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

const roomMainLayoutStyle = {
  display: "grid",
  gridTemplateColumns: "170px 1fr",
  gap: "10px",
  alignItems: "start",
  marginTop: "12px",
  width: "100%"
};

const playerSidebarStyle = {
  border: "1px solid #374151",
  borderRadius: "12px",
  padding: "12px",
  background: "#020617",
  position: "sticky",
  top: "12px",
  textAlign: "left"
};

const playerSidebarRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "10px",
  borderLeft: "4px solid #374151",
  borderRadius: "10px",
  background: "#111827",
  padding: "10px",
  marginBottom: "10px"
};

const playerLoreBadgeStyle = {
  minWidth: "56px",
  borderRadius: "10px",
  background: "#1f2937",
  display: "grid",
  placeItems: "center",
  padding: "6px",
  color: "#facc15"
};

const playersGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "10px"
};

const seatStyle = {
  border: "2px solid #374151",
  borderRadius: "10px",
  padding: "10px",
  background: "#1f2937",
  minWidth: 0
};

const expandedSeatStyle = {
  gridColumn: "1 / -1",
  transform: "scale(1.04)",
  transformOrigin: "top center",
  zIndex: 5,
  borderWidth: "3px",
  padding: "16px"
};

const boardZoomHintStyle = {
  margin: "-4px 0 8px",
  color: "#9ca3af",
  fontSize: "11px"
};

const gameAreaStyle = {
  marginTop: "14px",
  display: "grid",
  gap: "12px",
  width: "100%"
};


const topPlayRowStyle = {
  display: "grid",
  gridTemplateColumns: "150px minmax(650px, 1.45fr) minmax(620px, 1.35fr)",
  gap: "12px",
  alignItems: "stretch",
  width: "100%"
};

const bottomPlayRowStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(360px, 0.9fr) minmax(520px, 1.25fr) minmax(280px, 0.75fr)",
  gap: "12px",
  alignItems: "start",
  width: "100%"
};

const toolsPanelSlotStyle = {
  minWidth: 0
};

const smallDeckZoneStyle = {
  border: "1px solid #374151",
  borderRadius: "12px",
  padding: "8px",
  background: "#020617",
  display: "grid",
  alignContent: "start",
  justifyItems: "stretch",
  gap: "8px",
  minWidth: 0
};

const compactZoneTitleStyle = {
  margin: "0",
  fontSize: "15px"
};

const smallDeckPileStyle = {
  width: "72px",
  minHeight: "106px",
  borderRadius: "10px",
  background: "#111827",
  color: "white",
  border: "2px solid #facc15",
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
  margin: "0 auto",
  boxShadow: "0 6px 14px rgba(0,0,0,0.35)",
  padding: "6px"
};

const deckActionStackStyle = {
  display: "grid",
  gap: "6px",
  width: "100%",
  marginTop: "4px"
};

const deckActionButtonStyle = {
  padding: "7px 8px",
  borderRadius: "8px",
  border: "1px solid #374151",
  background: "#1f2937",
  color: "white",
  cursor: "pointer",
  fontWeight: "bold",
  fontSize: "12px",
  lineHeight: "1.15"
};

const dangerDeckActionButtonStyle = {
  ...deckActionButtonStyle,
  background: "#7f1d1d",
  borderColor: "#fecaca"
};

const yellowDoneButtonStyle = {
  ...deckActionButtonStyle,
  background: "#facc15",
  color: "#111827",
  border: "1px solid #fde68a",
  boxShadow: "0 0 10px rgba(250,204,21,0.35)"
};

const handCardStyle = {
  width: "145px",
  minHeight: "200px",
  borderRadius: "12px",
  background: "#1f2937",
  color: "white",
  cursor: "grab",
  padding: "6px",
  position: "relative",
  overflow: "visible",
  userSelect: "none",
  touchAction: "none"
};

const inkwellZoneStyle = {
  minWidth: 0,
  maxWidth: "none",
  padding: "8px",
  overflow: "visible"
};

const inkwellCardRowStyle = {
  display: "flex",
  flexDirection: "row",
  flexWrap: "nowrap",
  gap: "0px",
  alignItems: "center",
  justifyContent: "flex-start",
  minHeight: "132px",
  overflowX: "auto",
  paddingTop: "14px",
  paddingBottom: "18px",
  paddingLeft: "36px"
};

const inkwellCardStyle = {
  width: "70px",
  minHeight: "98px",
  borderRadius: "10px",
  background: "#1f2937",
  color: "white",
  cursor: "grab",
  padding: "4px",
  position: "relative",
  overflow: "visible",
  userSelect: "none",
  touchAction: "none"
};

const inkwellExertedCardShellStyle = {
  background: "transparent",
  boxShadow: "none",
  outline: "none",
  borderColor: "transparent"
};

const discardCardStyle = {
  width: "70px",
  minHeight: "98px",
  borderRadius: "10px",
  background: "#1f2937",
  color: "white",
  cursor: "grab",
  padding: "4px",
  position: "relative",
  overflow: "visible",
  userSelect: "none",
  touchAction: "none"
};

const actionButtonBarStyle = {
  marginTop: "16px",
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  justifyContent: "center"
};

const zoneStyle = {
  border: "1px solid #374151",
  borderRadius: "12px",
  padding: "10px",
  background: "#020617",
  minHeight: "120px",
  minWidth: 0
};

const deckZoneStyle = {
  padding: "8px",
  background: "transparent",
  border: "none",
  minHeight: "auto"
};

const cardRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "10px",
  justifyContent: "center",
  alignItems: "flex-start",
  minHeight: "120px"
};

const boardPlaymatStyle = {
  position: "relative",
  minHeight: "640px",
  borderRadius: "10px",
  background: "rgba(15, 23, 42, 0.35)",
  border: "1px dashed rgba(148, 163, 184, 0.35)",
  overflow: "visible",
  padding: "18px",
  boxSizing: "border-box"
};

const boardLooseCardSpacingStyle = {
  margin: "18px 26px"
};

const boardAttachedCardSpacingStyle = {
  margin: "0"
};

const boardLocationChildClusterStyle = {
  marginLeft: "0px",
  marginTop: "0px",
  marginRight: "0px",
  marginBottom: "0px",
  zIndex: 24,
  position: "relative"
};

const boardAttachedItemOverlapStyle = {
  marginLeft: "-58px",
  marginTop: "72px",
  marginRight: "18px",
  zIndex: 30,
  position: "relative"
};

const discardCardRowStyle = {
  display: "flex",
  flexDirection: "row",
  flexWrap: "nowrap",
  gap: "0px",
  alignItems: "center",
  justifyContent: "flex-start",
  minHeight: "132px",
  overflowX: "auto",
  paddingTop: "14px",
  paddingBottom: "18px",
  paddingLeft: "36px"
};

const cardStyle = {
  width: "130px",
  minHeight: "180px",
  borderRadius: "12px",
  background: "#1f2937",
  color: "white",
  cursor: "grab",
  padding: "6px",
  position: "relative",
  overflow: "visible",
  userSelect: "none",
  touchAction: "none"
};

const rotatedVisibleCardWrapStyle = {
  width: "100%",
  height: "100%",
  display: "grid",
  placeItems: "center",
  transform: "rotate(90deg)",
  transformOrigin: "center center"
};

const rotatedVisibleCardImageStyle = {
  transform: "rotate(90deg)",
  transformOrigin: "center center"
};

const selectedVisibleCardOutlineStyle = {
  outline: "4px dashed #22c55e",
  outlineOffset: "3px",
  boxShadow: "0 0 0 3px rgba(34, 197, 94, 0.35)",
  borderRadius: "10px"
};

const cardImageStyle = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  borderRadius: "8px",
  display: "block"
};

const hoverPreviewPanelStyle = {
  position: "fixed",
  right: "20px",
  top: "20px",
  zIndex: 9999,
  pointerEvents: "none"
};

const hoverPreviewCounterRotateStyle = {
  transform: "rotate(-90deg)",
  transformOrigin: "center center"
};

const hoverPreviewCardWrapStyle = {
  position: "relative"
};

const hoverPreviewImageStyle = {
  width: "350px",
  maxHeight: "80vh",
  objectFit: "contain",
  border: "3px solid #facc15",
  borderRadius: "12px",
  background: "#111827",
  display: "block"
};

const hoverPreviewLandscapeImageStyle = {
  transform: "rotate(90deg)",
  transformOrigin: "center center",
  margin: "70px 0"
};

const hoverDamageBadgeStyle = {
  position: "absolute",
  top: "10px",
  right: "10px",
  minWidth: "52px",
  height: "52px",
  borderRadius: "999px",
  background: "#ef4444",
  color: "white",
  display: "grid",
  placeItems: "center",
  fontWeight: "bold",
  fontSize: "26px",
  border: "3px solid white",
  boxShadow: "0 8px 20px rgba(0,0,0,0.45)",
  zIndex: 10000
};

const hoverMetaPanelStyle = {
  position: "static",
  width: "350px",
  maxWidth: "350px",
  display: "grid",
  gap: "6px",
  justifyItems: "center",
  background: "transparent",
  borderRadius: "10px",
  padding: "8px 0 0",
  border: "none",
  zIndex: 10000
};

const hoverMetaRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
  justifyContent: "center"
};

const hoverTokenBadgeStyle = {
  borderRadius: "999px",
  background: "#7c2d12",
  color: "white",
  padding: "6px 14px",
  fontSize: "18px",
  fontWeight: "bold",
  border: "2px solid white"
};

const hoverAssignmentTextStyle = {
  color: "#e5e7eb",
  fontSize: "15px",
  fontWeight: "bold",
  textAlign: "center"
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
  gap: "12px",
  justifyContent: "center"
};

const miniCardStyle = {
  width: "90px",
  minHeight: "126px",
  borderRadius: "8px",
  background: "#020617",
  border: "1px solid #374151",
  color: "white",
  fontSize: "11px",
  padding: "4px",
  display: "grid",
  placeItems: "center",
  position: "relative",
  overflow: "visible"
};

const miniCardImageStyle = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  borderRadius: "6px",
  display: "block"
};


const inkwellCardBackStyle = {
  width: "100%",
  height: "100%",
  minHeight: "92px",
  borderRadius: "10px",
  background:
    "radial-gradient(circle at center, #4c1d95 0%, #312e81 38%, #111827 72%, #020617 100%)",
  border: "2px solid #facc15",
  display: "grid",
  placeItems: "center",
  color: "#facc15",
  boxShadow:
    "inset 0 0 22px rgba(250,204,21,0.35), 0 6px 16px rgba(0,0,0,0.35)",
  overflow: "hidden"
};

const inkwellCardBackInnerStyle = {
  width: "72%",
  height: "72%",
  borderRadius: "999px",
  border: "2px solid rgba(250,204,21,0.75)",
  display: "grid",
  placeItems: "center",
  textAlign: "center",
  background:
    "radial-gradient(circle at center, rgba(250,204,21,0.18), rgba(15,23,42,0.1) 55%, rgba(15,23,42,0.45))"
};

const inkwellCardBackSparkleStyle = {
  fontSize: "18px",
  lineHeight: "1"
};

const inkwellCardBackTitleStyle = {
  fontWeight: "bold",
  fontSize: "10px",
  letterSpacing: "1px"
};

const inkwellCardBackSubtitleStyle = {
  fontSize: "7px",
  letterSpacing: "2px",
  color: "#fde68a"
};


const boostCountBadgeStyle = {
  position: "absolute",
  left: "6px",
  top: "6px",
  borderRadius: "999px",
  background: "#581c87",
  color: "white",
  padding: "4px 8px",
  fontSize: "12px",
  fontWeight: "bold",
  border: "2px solid #facc15",
  zIndex: 8
};

const hoverBoostBadgeStyle = {
  position: "absolute",
  top: "70px",
  right: "10px",
  padding: "8px 14px",
  borderRadius: "999px",
  background: "#facc15",
  color: "#111827",
  fontWeight: "bold",
  fontSize: "18px",
  border: "2px solid white",
  boxShadow: "0 8px 20px rgba(0,0,0,0.45)",
  zIndex: 10000
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


const boardToolsStyle = {
  border: "1px solid #facc15",
  borderRadius: "16px",
  padding: "16px",
  background: "#020617",
  margin: "20px auto",
  maxWidth: "900px"
};

const cardMetaRowStyle = {
  position: "absolute",
  bottom: "6px",
  left: "6px",
  right: "6px",
  display: "flex",
  flexWrap: "wrap",
  gap: "5px",
  justifyContent: "center",
  zIndex: 30
};

const tagBadgeStyle = {
  borderRadius: "999px",
  background: "#1d4ed8",
  color: "white",
  padding: "2px 6px",
  fontSize: "11px",
  fontWeight: "bold"
};

const tokenBadgeStyle = {
  borderRadius: "999px",
  border: "2px solid white",
  background: "#7c2d12",
  color: "white",
  padding: "5px 12px",
  fontSize: "14px",
  fontWeight: "bold",
  cursor: "pointer",
  margin: "3px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.45)"
};

const tokenListStyle = {
  marginTop: "6px"
};

const cardAssignmentStyle = {
  marginTop: "6px",
  borderRadius: "8px",
  background: "#111827",
  color: "#cbd5e1",
  padding: "4px",
  fontSize: "11px"
};

const miniBadgeRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: "2px",
  marginTop: "2px"
};

const miniTagBadgeStyle = {
  borderRadius: "999px",
  background: "#1d4ed8",
  color: "white",
  padding: "1px 4px",
  fontSize: "8px",
  fontWeight: "bold"
};

const miniTokenRowStyle = {
  position: "absolute",
  bottom: "4px",
  left: "4px",
  right: "4px",
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: "3px",
  zIndex: 35
};

const miniTokenBadgeStyle = {
  borderRadius: "999px",
  background: "#7c2d12",
  color: "white",
  padding: "3px 8px",
  fontSize: "11px",
  fontWeight: "bold",
  border: "1px solid white",
  boxShadow: "0 2px 6px rgba(0,0,0,0.45)"
};

const assignmentNoteStyle = {
  marginTop: "2px",
  color: "#cbd5e1",
  fontSize: "8px",
  lineHeight: "1.1"
};


const miniBoardLayoutStyle = {
  display: "grid",
  gap: "12px"
};

const miniBoardSectionStyle = {
  border: "1px solid #374151",
  borderRadius: "12px",
  background: "#020617",
  padding: "10px"
};

const miniBoardSectionTitleStyle = {
  color: "#facc15",
  fontWeight: "bold",
  fontSize: "13px",
  marginBottom: "8px",
  textAlign: "left"
};

const miniCardGroupRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "12px",
  justifyContent: "center",
  alignItems: "flex-start"
};

const miniLocationGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "12px"
};

const miniLocationLaneStyle = {
  border: "1px solid #334155",
  borderRadius: "12px",
  background: "#111827",
  padding: "10px",
  display: "grid",
  gap: "10px"
};

const miniLocationHeaderStyle = {
  display: "flex",
  justifyContent: "center",
  paddingBottom: "8px",
  borderBottom: "1px solid #374151"
};

const miniLocationContentsStyle = {
  display: "grid",
  gap: "8px"
};

const miniBoardSubheadingStyle = {
  color: "#cbd5e1",
  fontSize: "11px",
  fontWeight: "bold",
  textAlign: "left"
};

const miniEmptyTextStyle = {
  color: "#64748b",
  fontSize: "11px",
  margin: "0"
};

const compactMiniCardStyle = {
  width: "82px",
  minHeight: "116px"
};

const deckSearchOverlayStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 20000,
  background: "rgba(2, 6, 23, 0.78)",
  display: "grid",
  placeItems: "center",
  padding: "20px",
  boxSizing: "border-box"
};

const deckSearchModalStyle = {
  width: "min(92vw, 520px)",
  maxHeight: "92vh",
  overflowY: "auto",
  border: "2px solid #facc15",
  borderRadius: "16px",
  background: "#111827",
  padding: "18px",
  boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
  display: "grid",
  gap: "12px",
  justifyItems: "center"
};

const deckSearchCardFrameStyle = {
  position: "relative",
  width: "min(72vw, 300px)",
  display: "grid",
  justifyItems: "center"
};

const deckSearchButtonRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  justifyContent: "center"
};


const turnReminderStyle = {
  border: "1px solid #facc15",
  borderRadius: "12px",
  background: "#1f2937",
  color: "white",
  padding: "12px",
  margin: "12px auto",
  maxWidth: "760px"
};

const gameLogPanelStyle = {
  border: "1px solid #374151",
  borderRadius: "12px",
  background: "#020617",
  padding: "10px",
  margin: "12px auto",
  maxWidth: "900px",
  textAlign: "left"
};

const gameLogTitleStyle = {
  color: "#facc15",
  fontWeight: "bold",
  marginBottom: "6px"
};

const gameLogListStyle = {
  display: "grid",
  gap: "4px",
  maxHeight: "160px",
  overflowY: "auto"
};

const gameLogEntryStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "10px",
  borderBottom: "1px solid rgba(55,65,81,0.5)",
  paddingBottom: "4px",
  color: "#e5e7eb",
  fontSize: "12px"
};

const deckPeekRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "14px",
  justifyContent: "center",
  alignItems: "start"
};

const deckPeekCardWrapStyle = {
  display: "grid",
  gap: "6px",
  justifyItems: "center",
  width: "120px"
};

const hoverStyle = document.createElement("style");
hoverStyle.textContent = `
  .card-hover-preview {
    display: none;
  }

  button:hover > .card-hover-preview,
  div:hover > .card-hover-preview {
    display: block;
  }

  .deck-shuffle-animate {
    animation: deckShuffleWiggle 0.65s ease-in-out;
  }

  @keyframes deckShuffleWiggle {
    0% { transform: translateX(0) rotate(0deg); }
    15% { transform: translateX(-8px) rotate(-6deg); }
    30% { transform: translateX(8px) rotate(6deg); }
    45% { transform: translateX(-6px) rotate(-4deg); }
    60% { transform: translateX(6px) rotate(4deg); }
    80% { transform: translateX(-3px) rotate(-2deg); }
    100% { transform: translateX(0) rotate(0deg); }
  }

  button:focus > .card-hover-preview,
  button:focus-within > .card-hover-preview {
    display: none !important;
  }
`;
document.head.appendChild(hoverStyle);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);