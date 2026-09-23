const modal = document.getElementById("gameModal");
const gameShell = document.getElementById("gameShell");
const home = document.querySelector("main");
const boardElement = document.getElementById("chessboard");
const statusElement = document.getElementById("status");
const pieces = {K:"♔",Q:"♕",R:"♖",B:"♗",N:"♘",P:"♙",k:"♚",q:"♛",r:"♜",b:"♝",n:"♞",p:"♟"};
let selectedSquare = null, currentFen = "", mode = "friend", inviteUrl = "", activeGameId = "", hostToken = "", roomCreated = false, joinGameId = new URLSearchParams(location.search).get("game"), statusTimer = null;

function openModal(nextMode) {
    mode = nextMode;
    const computer = mode === "computer";
    const joining = mode === "join";
    document.getElementById("modalIcon").textContent = computer ? "♟" : "♙♞";
    document.getElementById("modalEyebrow").textContent = computer ? "SOLO PRACTICE" : "SOCIAL PLAY";
    document.getElementById("modalTitle").textContent = computer ? "Play the computer" : joining ? "Join your friend's game" : "Play with a friend";
    document.getElementById("modalDescription").textContent = computer ? "Choose your name and challenge the computer to a game." : joining ? "Enter your name to join this private chess game." : "Create a private room, then invite your friend with one link.";
    document.getElementById("startGameButton").innerHTML = computer ? "Start game <span>→</span>" : joining ? "Join game <span>→</span>" : "Generate invite link <span>→</span>";
    document.getElementById("inviteBox").hidden = computer || joining;
    document.getElementById("playerSlots").hidden = computer || joining;
    document.getElementById("copyStatus").textContent = "";
    document.getElementById("startGameButton").hidden = false;
    modal.hidden = false;
    document.getElementById("playerName").focus();
}
document.querySelectorAll("[data-mode]").forEach(el => el.addEventListener("click", () => openModal(el.dataset.mode)));
document.getElementById("closeModal").addEventListener("click", () => modal.hidden = true);
modal.addEventListener("click", e => { if (e.target === modal) modal.hidden = true; });
document.getElementById("howToPlayButton").addEventListener("click", () => document.getElementById("modes").scrollIntoView({behavior:"smooth"}));
document.getElementById("startGameButton").addEventListener("click", startGame);

async function startGame() {
    const name = document.getElementById("playerName").value.trim() || "You";
    const joining = mode === "join";
    const startingRoom = mode === "friend" && roomCreated;
    const endpoint = joining ? "/join-game" : startingRoom ? "/start-game" : "/new-game";
    const payload = joining ? {game_id: joinGameId, name} : startingRoom ? {game_id: activeGameId, host_token: hostToken} : {mode, name};
    const response = await fetch(endpoint, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload)});
    const data = await response.json();
    if (!data.success) { document.getElementById("copyStatus").textContent = data.message || "Unable to join this game."; return; }
    if (!joining && mode === "friend" && !data.started) {
        activeGameId = data.game_id;
        inviteUrl = `${location.origin}${location.pathname}?game=${data.game_id}`;
        document.getElementById("inviteLink").textContent = inviteUrl;
        document.getElementById("modalIcon").textContent = "⌛";
        document.getElementById("modalEyebrow").textContent = "WAITING FOR PLAYER";
        document.getElementById("modalTitle").textContent = "Game room ready";
        document.getElementById("modalDescription").textContent = "Send this invite link to your friend. The board will unlock when they join.";
        document.getElementById("hostSlot").textContent = name;
        document.getElementById("guestSlot").textContent = "Waiting for friend…";
        document.getElementById("guestSlotStatus").textContent = "Join using the invite link";
        roomCreated = true;
        hostToken = data.host_token;
        document.getElementById("startGameButton").hidden = false;
        document.getElementById("startGameButton").innerHTML = "Start game <span>→</span>";
        document.getElementById("inviteBox").hidden = false;
        pollForPlayer(data.game_id, name);
        return;
    }
    if (joining && !data.started) {
        activeGameId = data.game_id;
        document.getElementById("modalIcon").textContent = "⌛";
        document.getElementById("modalEyebrow").textContent = "WAITING FOR HOST";
        document.getElementById("modalTitle").textContent = "You joined the room";
        document.getElementById("modalDescription").textContent = "The host will start the game when both player slots are ready.";
        document.getElementById("startGameButton").hidden = true;
        document.getElementById("inviteBox").hidden = true;
        pollForStart(data.game_id, name);
        return;
    }
    inviteUrl = `${location.origin}${location.pathname}?game=${data.game_id}`;
    activeGameId = data.game_id;
    document.getElementById("inviteLink").textContent = inviteUrl;
    document.getElementById("whitePlayer").textContent = joining ? data.host_name : name;
    document.getElementById("blackPlayer").textContent = mode === "computer" ? "Computer" : joining ? name : "Opponent";
    document.getElementById("gameModeLabel").textContent = mode === "computer" ? "SOLO PRACTICE" : "CASUAL GAME";
    document.getElementById("gameTitle").textContent = mode === "computer" ? "You vs Computer" : "Your private game";
    document.getElementById("sidebarTitle").textContent = mode === "computer" ? "Computer opponent" : "Invite a friend";
    document.getElementById("sidebarText").textContent = mode === "computer" ? "Take your time and find the best move." : "Share your private link to start playing.";
    home.hidden = true; modal.hidden = true; gameShell.hidden = false; currentFen = data.fen; drawBoard(); updateStatus(data);
}
function pollForPlayer(id, name) {
    clearInterval(statusTimer);
    statusTimer = setInterval(async () => {
        const response = await fetch(`/game-status?game_id=${encodeURIComponent(id)}`);
        const data = await response.json();
        if (!data.guest_name) return;
        document.getElementById("guestSlot").textContent = data.guest_name;
        document.getElementById("guestSlotStatus").textContent = "Joined the room";
        if (!data.started) {
            clearInterval(statusTimer);
            pollForHostStart(id, name);
            return;
        }
        clearInterval(statusTimer);
        document.getElementById("whitePlayer").textContent = data.host_name;
        document.getElementById("blackPlayer").textContent = data.guest_name;
        document.getElementById("guestSlot").textContent = data.guest_name;
        document.getElementById("guestSlotStatus").textContent = "Joined the room";
        document.getElementById("gameModeLabel").textContent = "CASUAL GAME";
        document.getElementById("gameTitle").textContent = "Your private game";
        document.getElementById("sidebarTitle").textContent = "Game started";
        document.getElementById("sidebarText").textContent = `${data.guest_name} joined the room. Make your move.`;
        home.hidden = true; modal.hidden = true; gameShell.hidden = false; currentFen = data.fen; drawBoard(); updateStatus(data);
    }, 1500);
}
function pollForHostStart(id, name) {
    statusTimer = setInterval(async () => {
        const response = await fetch(`/game-status?game_id=${encodeURIComponent(id)}`);
        const data = await response.json();
        if (!data.started) return;
        clearInterval(statusTimer);
        showGame(data, false, name);
    }, 1200);
}
function pollForStart(id, name) {
    clearInterval(statusTimer);
    statusTimer = setInterval(async () => {
        const response = await fetch(`/game-status?game_id=${encodeURIComponent(id)}`);
        const data = await response.json();
        if (!data.started) return;
        clearInterval(statusTimer);
        showGame(data, true, name);
    }, 1200);
}
function showGame(data, joining, name) {
    inviteUrl = `${location.origin}${location.pathname}?game=${data.game_id}`;
    activeGameId = data.game_id;
    document.getElementById("whitePlayer").textContent = data.host_name;
    document.getElementById("blackPlayer").textContent = data.guest_name;
    document.getElementById("gameModeLabel").textContent = "CASUAL GAME";
    document.getElementById("gameTitle").textContent = "Your private game";
    document.getElementById("sidebarTitle").textContent = "Game started";
    document.getElementById("sidebarText").textContent = `${joining ? "The host started the game." : `${data.guest_name} joined the room.`}`;
    document.getElementById("shareInvite").hidden = joining;
    home.hidden = true; modal.hidden = true; gameShell.hidden = false; currentFen = data.fen; drawBoard(); updateStatus(data);
}
function fenToBoard(fen) {
    return fen.split(" ")[0].split("/").map(row => [...row].reduce((out, char) => { if (/\d/.test(char)) out.push(...Array(Number(char)).fill("")); else out.push(char); return out; }, []));
}
function drawBoard() {
    boardElement.innerHTML = ""; const board = fenToBoard(currentFen);
    board.forEach((row, r) => row.forEach((piece, c) => {
        const square = document.createElement("div"); square.className = `square ${(r+c)%2 ? "dark" : "light"}`; square.dataset.square = String.fromCharCode(97+c) + (8-r); square.textContent = pieces[piece] || "";
        square.addEventListener("click", () => handleSquareClick(square.dataset.square)); boardElement.appendChild(square);
    }));
    if (selectedSquare) document.querySelector(`[data-square="${selectedSquare}"]`)?.classList.add("selected");
}
async function handleSquareClick(square) {
    if (!selectedSquare) { selectedSquare = square; drawBoard(); return; }
    if (selectedSquare === square) { selectedSquare = null; drawBoard(); return; }
    const response = await fetch("/move", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({game_id:activeGameId,from:selectedSquare,to:square})});
    const data = await response.json(); selectedSquare = null;
    if (data.success) { currentFen = data.fen; drawBoard(); updateStatus(data); if (mode === "computer" && !data.game_over) await computerMove(); } else { drawBoard(); statusElement.textContent = data.message; }
}
async function computerMove() {
    const response = await fetch("/computer-move", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({game_id:activeGameId})}); const data = await response.json();
    if (data.success) { currentFen = data.fen; drawBoard(); updateStatus(data); }
}
function updateStatus(data) {
    if (data.checkmate) statusElement.textContent = `Checkmate! ${data.turn === "White" ? "Black" : "White"} wins`;
    else if (data.stalemate) statusElement.textContent = "Stalemate!";
    else if (data.game_over) statusElement.textContent = "Game over";
    else statusElement.textContent = `${data.turn}'s turn`;
}
async function copyInvite(button, status) {
    await navigator.clipboard.writeText(inviteUrl); button.textContent = "Copied!"; status.textContent = "Invite link copied to clipboard."; setTimeout(() => { button.textContent = "Copy invite link ↗"; status.textContent = ""; }, 1800);
}
document.getElementById("copyInvite").addEventListener("click", e => copyInvite(e.target, document.getElementById("copyStatus")));
document.getElementById("shareInvite").addEventListener("click", e => copyInvite(e.target, document.getElementById("copyStatus") || {textContent:""}));
document.getElementById("backHome").addEventListener("click", () => { gameShell.hidden = true; home.hidden = false; });
document.getElementById("newGame").addEventListener("click", () => { roomCreated = false; openModal(mode); });
if (joinGameId) openModal("join");
