const $ = (id) => document.getElementById(id);
const database = (() => {
  if (!window.firebase || !window.firebase.apps || !window.firebase.apps.length) {
    return null;
  }

  try {
    return window.firebase.database();
  } catch (error) {
    console.warn("Firebase database is unavailable:", error);
    return null;
  }
})();

const query = new URLSearchParams(window.location.search);
const joinedRoomId = query.get("room");
const roomStorageKey = (roomId) => `chess-room-${roomId}`;

function readStoredRoom(roomId) {
  try {
    const stored = localStorage.getItem(roomStorageKey(roomId));
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.warn("Unable to read local room state:", error);
    return null;
  }
}

function writeStoredRoom(room) {
  try {
    localStorage.setItem(roomStorageKey(room.id), JSON.stringify(room));
  } catch (error) {
    console.warn("Unable to save local room state:", error);
  }
}

function applyRoomState(updatedRoom) {
  if (!updatedRoom) {
    $("roomMessage").textContent = "This room is no longer available.";
    return;
  }

  const fenChanged = !room || room.fen !== updatedRoom.fen;
  room = { ...room, ...updatedRoom };

  if (fenChanged && chess && $("game").hidden === false) {
    chess = new Chess(room.fen);
    drawBoard();
    updateGameStatus();
  }

  if (currentMode === "host" && $("modal").hidden === false) {
    showHostRoom();
  } else if (currentMode === "guest" && $("modal").hidden === false) {
    showGuestWaiting();
  }

  if (room.started && $("game").hidden) {
    openGame();
  }
}

let room = null;
let chess = null;
let selectedSquare = null;
let currentMode = "";
let computerTimer = null;

const pieceSymbols = {
  wp: "♙",
  wn: "♘",
  wb: "♗",
  wr: "♖",
  wq: "♕",
  wk: "♔",
  bp: "♟",
  bn: "♞",
  bb: "♝",
  br: "♜",
  bq: "♛",
  bk: "♚"
};

async function getRoom(roomId) {
  if (!database) {
    return readStoredRoom(roomId);
  }

  const snapshot = await database.ref("rooms/" + roomId).once("value");
  return snapshot.exists() ? snapshot.val() : null;
}

async function saveRoom() {
  if (!room) {
    return;
  }

  room.fen = chess.fen();

  if (database) {
    await database.ref("rooms/" + room.id).update({
      host: room.host,
      guest: room.guest,
      started: room.started,
      fen: room.fen
    });
  }

  writeStoredRoom(room);
}

function watchRoom(roomId) {
  if (!database) {
    const storedRoom = readStoredRoom(roomId);
    applyRoomState(storedRoom);
    return;
  }

  database.ref("rooms/" + roomId).on("value", (snapshot) => {
    applyRoomState(snapshot.exists() ? snapshot.val() : null);
  });
}

async function createRoom() {
  const name = $("playerName").value.trim() || "Host";

  room = {
    id: crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10),
    host: name,
    guest: "",
    started: false,
    fen: new Chess().fen()
  };

  chess = new Chess(room.fen);
  writeStoredRoom(room);

  try {
    if (database) {
      await database.ref("rooms/" + room.id).set(room);
    }
  } catch (error) {
    $("roomMessage").textContent =
      "Unable to create the room. Check the Firebase configuration and database rules.";
    console.error("Room creation failed:", error);
    return;
  }
  watchRoom(room.id);
  currentMode = "host";
  showHostRoom();
}

function showHostRoom() {
  $("hostName").textContent = room.host;
  $("guestName").textContent = room.guest || "Waiting for friend…";
  $("guestStatus").textContent = room.guest
    ? "Joined the room"
    : "Open the invite link to join";
  $("inviteUrl").textContent = `${window.location.href.split("?")[0]}?room=${room.id}`;
  $("slots").hidden = false;
  $("invite").hidden = false;
  $("modalAction").hidden = false;
  $("modalAction").innerHTML = room.guest
    ? "Start game <span>→</span>"
    : "Waiting for friend…";
  $("modalAction").disabled = !room.guest;
  $("roomMessage").textContent = room.guest
    ? "Your friend joined. Start the game when ready."
    : "Share the invite link with your friend.";
}

async function joinRoom() {
  const name = $("playerName").value.trim() || "Guest";
  let requestedRoom;

  try {
    requestedRoom = await getRoom(joinedRoomId);
  } catch (error) {
    $("roomMessage").textContent =
      "Unable to connect to the room. Check the Firebase configuration and database rules.";
    console.error("Room lookup failed:", error);
    return;
  }

  if (!requestedRoom) {
    $("roomMessage").textContent =
      "This room is unavailable in this browser. Static files need a shared backend for different devices.";
    return;
  }

  room = requestedRoom;
  room.guest = name;
  writeStoredRoom(room);

  try {
    if (database) {
      await database.ref("rooms/" + joinedRoomId).update({ guest: name });
    }
  } catch (error) {
    $("roomMessage").textContent =
      "Unable to join the room. Check the Firebase database rules.";
    console.error("Room join failed:", error);
    return;
  }
  chess = new Chess(room.fen);
  currentMode = "guest";
  watchRoom(joinedRoomId);
  showGuestWaiting();
}

function showGuestWaiting() {
  $("modalTitle").textContent = "Waiting for host";
  $("modalText").textContent = "You joined the room. The host will start the game.";
  $("modalAction").hidden = true;
  $("slots").hidden = false;
  $("invite").hidden = true;
  $("hostName").textContent = room.host;
  $("guestName").textContent = room.guest;
  $("guestStatus").textContent = "Joined the room";
  $("roomMessage").textContent = "Waiting for the host to start the game.";
}

async function startRoom() {
  if (currentMode !== "host" || !room.guest) {
    return;
  }

  room.started = true;
  writeStoredRoom(room);

  try {
    if (database) {
      await database.ref("rooms/" + room.id).update({ started: true });
    }
  } catch (error) {
    room.started = false;
    $("roomMessage").textContent =
      "Unable to start the game. Check the Firebase database rules.";
    console.error("Starting room failed:", error);
    return;
  }
  openGame();
}

function openGame() {
  if (!room.started) {
    return;
  }

  chess = new Chess(room.fen);
  $("home").hidden = true;
  $("modal").hidden = true;
  $("game").hidden = false;
  $("whitePlayer").textContent = room.host;
  $("blackPlayer").textContent = room.guest || "Computer";
  $("detailsText").textContent = room.guest
    ? "Both players are ready. Make your move."
    : "The computer follows all chess rules.";
  drawBoard();
  updateGameStatus();
}

function squareName(row, column) {
  return `${String.fromCharCode(97 + column)}${8 - row}`;
}

function drawBoard() {
  const board = chess.board();

  $("chessboard").innerHTML = board
    .map((row, rowIndex) =>
      row
        .map((piece, columnIndex) => {
          const square = squareName(rowIndex, columnIndex);
          const color = (rowIndex + columnIndex) % 2 ? "dark" : "light";
          const selected = square === selectedSquare ? " selected" : "";
          const symbol = piece ? pieceSymbols[`${piece.color}${piece.type}`] : "";
          return `<button class="square ${color}${selected}" data-square="${square}">${symbol}</button>`;
        })
        .join("")
    )
    .join("");

  document.querySelectorAll(".square").forEach((square) => {
    square.addEventListener("click", () => handleSquareClick(square.dataset.square));
  });
}

function handleSquareClick(square) {
  if (computerTimer || chess.game_over()) {
    return;
  }

  if (!selectedSquare) {
    const piece = chess.get(square);
    const playerColor = currentMode === "guest" ? "b" : "w";

    if (piece && piece.color === playerColor && chess.turn() === playerColor) {
      selectedSquare = square;
      drawBoard();
    }
    return;
  }

  if (selectedSquare === square) {
    selectedSquare = null;
    drawBoard();
    return;
  }

  makeMove(selectedSquare, square);
}

function makeMove(from, to) {
  const move = chess.move({
    from,
    to,
    promotion: "q"
  });

  if (!move) {
    $("turn").textContent = "That move is not legal";
    selectedSquare = null;
    drawBoard();
    updateGameStatus();
    return;
  }

  selectedSquare = null;
  saveRoom();
  drawBoard();
  updateGameStatus();

  if (currentMode === "computer" && !chess.game_over()) {
    computerTimer = window.setTimeout(computerMove, 450);
  }
}

function computerMove() {
  computerTimer = null;

  if (chess.game_over() || chess.turn() !== "b") {
    return;
  }

  const legalMoves = chess.moves({ verbose: true });
  const checkmateMove = legalMoves.find((move) => {
    chess.move(move);
    const wins = chess.game_over() && chess.in_checkmate();
    chess.undo();
    return wins;
  });
  const captures = legalMoves.filter((move) => move.captured);
  const choices = checkmateMove ? [checkmateMove] : captures.length ? captures : legalMoves;
  const move = choices[Math.floor(Math.random() * choices.length)];

  chess.move(move);
  saveRoom();
  drawBoard();
  updateGameStatus();
}

function updateGameStatus() {
  const turnName = chess.turn() === "w" ? "White" : "Black";

  if (chess.in_checkmate()) {
    const winner = chess.turn() === "w" ? "Black" : "White";
    $("turn").textContent = `Checkmate! ${winner} wins`;
    $("detailsText").textContent = "Checkmate — the game is over.";
  } else if (chess.in_stalemate()) {
    $("turn").textContent = "Draw — stalemate";
    $("detailsText").textContent = "Draw by stalemate.";
  } else if (chess.in_threefold_repetition()) {
    $("turn").textContent = "Draw — threefold repetition";
    $("detailsText").textContent = "Draw by repeated position.";
  } else if (chess.insufficient_material()) {
    $("turn").textContent = "Draw — insufficient material";
    $("detailsText").textContent = "Draw because checkmate is impossible.";
  } else if (chess.in_draw()) {
    $("turn").textContent = "Draw";
    $("detailsText").textContent = "The game ended in a draw.";
  } else if (chess.in_check()) {
    $("turn").textContent = `${turnName} is in check`;
  } else {
    $("turn").textContent = `${turnName}'s turn`;
  }
}

function openModal(type) {
  const joining = type === "join";
  const computer = type === "computer";

  $("modal").dataset.type = type;
  $("modalIcon").textContent = joining ? "♙" : computer ? "♟" : "♙♞";
  $("modalEyebrow").textContent = joining ? "JOIN ROOM" : computer ? "SOLO PRACTICE" : "PRIVATE ROOM";
  $("modalTitle").textContent = joining ? "Join your friend's game" : computer ? "Play the computer" : "Create a room";
  $("modalText").textContent = joining
    ? "Enter your name. The host will start the game when you join."
    : computer
      ? "Enter your name and start practicing."
      : "Add your name, then generate a link to invite your friend.";
  $("modalAction").innerHTML = joining ? "Join room <span>→</span>" : computer ? "Start game <span>→</span>" : "Generate invite link <span>→</span>";
  $("modalAction").hidden = false;
  $("modalAction").disabled = false;
  $("slots").hidden = true;
  $("invite").hidden = true;
  $("roomMessage").textContent = "";
  $("modal").hidden = false;
  $("playerName").focus();
}

document.querySelectorAll("[data-action]").forEach((element) => {
  element.addEventListener("click", () => openModal(element.dataset.action));
});

$("closeModal").addEventListener("click", () => {
  $("modal").hidden = true;
});

$("modalAction").addEventListener("click", () => {
  const type = $("modal").dataset.type;

  if (type === "join") {
    joinRoom();
  } else if (type === "computer") {
    room = {
      id: "computer",
      host: $("playerName").value.trim() || "You",
      guest: "Computer",
      started: true,
      fen: new Chess().fen()
    };
    currentMode = "computer";
    openGame();
  } else if (currentMode === "host" && room?.guest) {
    startRoom();
  } else {
    createRoom();
  }
});

$("copyLink").addEventListener("click", async () => {
  const link = $("inviteUrl").textContent;

  try {
    await navigator.clipboard.writeText(link);
    $("roomMessage").textContent = "Invite link copied.";
  } catch {
    $("roomMessage").textContent = link;
  }
});

$("backHome").addEventListener("click", () => {
  $("game").hidden = true;
  $("home").hidden = false;
});

$("newGame").addEventListener("click", () => openModal("room"));

window.addEventListener("storage", (event) => {
  if (!room || event.key !== roomStorageKey(room.id) || !event.newValue) {
    return;
  }

  room = JSON.parse(event.newValue);
  chess = new Chess(room.fen);

  if (currentMode === "host" && room.guest && $("modal").hidden === false) {
    showHostRoom();
  }

  if (room.started && $("game").hidden) {
    openGame();
  } else if (!$("game").hidden) {
    drawBoard();
    updateGameStatus();
  }
});

if (joinedRoomId) {
  openModal("join");
}
