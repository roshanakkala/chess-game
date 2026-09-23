const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let room = JSON.parse(localStorage.getItem("chess-room") || "null");

function createId() {
  return crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
}

function openModal(type) {
  const joining = type === "join";
  const computer = type === "computer";

  $("modal").dataset.type = type;
  $("modalIcon").textContent = joining ? "♙" : computer ? "♟" : "♙♞";
  $("modalEyebrow").textContent = joining
    ? "JOIN ROOM"
    : computer
      ? "SOLO PRACTICE"
      : "PRIVATE ROOM";
  $("modalTitle").textContent = joining
    ? "Join your friend's game"
    : computer
      ? "Play the computer"
      : "Create a room";
  $("modalText").textContent = joining
    ? "Enter your name. The host will start the game when you join."
    : computer
      ? "Enter your name and start practicing."
      : "Add your name, then generate a link to invite your friend.";
  $("modalAction").innerHTML = joining
    ? "Join room <span>→</span>"
    : computer
      ? "Start game <span>→</span>"
      : "Generate invite link <span>→</span>";
  $("modalAction").hidden = false;
  $("modalAction").dataset.start = "";
  $("slots").hidden = true;
  $("invite").hidden = true;
  $("roomMessage").textContent = "";
  $("modal").hidden = false;
  $("playerName").focus();
}

function createRoom() {
  const name = $("playerName").value.trim() || "You";

  room = {
    id: createId(),
    host: name,
    guest: "",
    started: false
  };

  localStorage.setItem("chess-room", JSON.stringify(room));
  $("hostName").textContent = name;
  $("inviteUrl").textContent = `${location.origin}${location.pathname}?room=${room.id}`;
  $("slots").hidden = false;
  $("invite").hidden = false;
  $("modalAction").innerHTML = "Start game <span>→</span>";
  $("modalAction").dataset.start = "yes";
  $("roomMessage").textContent = "Share the link. Only the host can start the game.";
}

function joinRoom() {
  const name = $("playerName").value.trim() || "Guest";

  room = room || {
    id: params.get("room"),
    host: "Host",
    guest: "",
    started: false
  };
  room.guest = name;
  localStorage.setItem("chess-room", JSON.stringify(room));

  $("modalTitle").textContent = "Waiting for host";
  $("modalText").textContent = "You joined the room. The host will start the game.";
  $("modalAction").hidden = true;
  $("invite").hidden = true;
  $("slots").hidden = false;
  $("hostName").textContent = room.host;
  $("guestName").textContent = name;
  $("guestStatus").textContent = "Joined the room";
  $("roomMessage").textContent = "Waiting for the host to start the game.";
}

function showGame() {
  room.started = true;
  localStorage.setItem("chess-room", JSON.stringify(room));
  $("home").hidden = true;
  $("modal").hidden = true;
  $("game").hidden = false;
  $("whitePlayer").textContent = room.host;
  $("blackPlayer").textContent = room.guest || "Computer";
  $("detailsText").textContent = room.guest
    ? "Both players are ready. Make your move."
    : "Practice against the computer.";
  drawBoard();
}

function drawBoard() {
  const pieces = [
    "♜", "♞", "♝", "♛", "♚", "♝", "♞", "♜",
    "♟", "♟", "♟", "♟", "♟", "♟", "♟", "♟",
    "", "", "", "", "", "", "", "",
    "", "", "", "", "", "", "", "",
    "", "", "", "", "", "", "", "",
    "", "", "", "", "", "", "", "",
    "♙", "♙", "♙", "♙", "♙", "♙", "♙", "♙",
    "♖", "♘", "♗", "♕", "♔", "♗", "♘", "♖"
  ];

  $("chessboard").innerHTML = pieces
    .map((piece, index) => {
      const color = (Math.floor(index / 8) + index) % 2 ? "dark" : "light";
      return `<button class="square ${color}">${piece}</button>`;
    })
    .join("");
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
      host: $("playerName").value.trim() || "You",
      guest: "Computer",
      started: true
    };
    showGame();
  } else if ($("modalAction").dataset.start === "yes") {
    showGame();
  } else {
    createRoom();
  }
});

$("copyLink").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("inviteUrl").textContent);
  $("roomMessage").textContent = "Invite link copied.";
});

$("backHome").addEventListener("click", () => {
  $("game").hidden = true;
  $("home").hidden = false;
});

$("newGame").addEventListener("click", () => openModal("room"));

if (params.has("room")) {
  openModal("join");
}
