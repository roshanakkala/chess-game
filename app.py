from flask import Flask, render_template, request, jsonify
import chess
import random
import secrets

app = Flask(__name__)
rooms = {}


def room_data(room_id, room):
    board = room["board"]
    return {
        "success": True, "game_id": room_id, "fen": board.fen(),
        "turn": "White" if board.turn == chess.WHITE else "Black",
        "started": room["started"], "mode": room["mode"],
        "host_name": room["host_name"], "guest_name": room["guest_name"],
        "game_over": board.is_game_over(), "check": board.is_check(),
        "checkmate": board.is_checkmate(), "stalemate": board.is_stalemate()
    }


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/new-game", methods=["POST"])
def new_game():
    data = request.get_json(silent=True) or {}
    mode = data.get("mode", "friend")
    if mode not in {"friend", "computer"}:
        return jsonify({"success": False, "message": "Unknown game mode."}), 400
    room_id = secrets.token_urlsafe(8)
    rooms[room_id] = {
        "board": chess.Board(), "mode": mode,
        "host_name": str(data.get("name", "Host")).strip()[:24] or "Host",
        "guest_name": "", "started": mode == "computer",
        "host_token": secrets.token_urlsafe(18)
    }
    response = room_data(room_id, rooms[room_id])
    response["host_token"] = rooms[room_id]["host_token"]
    return jsonify(response)


@app.route("/join-game", methods=["POST"])
def join_game():
    data = request.get_json(silent=True) or {}
    room_id = data.get("game_id")
    room = rooms.get(room_id)
    if not room or room["mode"] != "friend":
        return jsonify({"success": False, "message": "This invite link is no longer active."}), 404
    if room["started"]:
        return jsonify({"success": False, "message": "This game already has two players."}), 409
    room["guest_name"] = str(data.get("name", "Guest")).strip()[:24] or "Guest"
    return jsonify(room_data(room_id, room))


@app.route("/start-game", methods=["POST"])
def start_game():
    data = request.get_json(silent=True) or {}
    room_id = data.get("game_id")
    room = rooms.get(room_id)
    if not room:
        return jsonify({"success": False, "message": "Game room not found."}), 404
    if data.get("host_token") != room["host_token"]:
        return jsonify({"success": False, "message": "Only the host can start this game."}), 403
    if not room["guest_name"]:
        return jsonify({"success": False, "message": "Waiting for your friend to join."}), 409
    room["started"] = True
    return jsonify(room_data(room_id, room))


@app.route("/game-status")
def game_status():
    room_id = request.args.get("game_id")
    room = rooms.get(room_id)
    if not room:
        return jsonify({"success": False, "message": "Game not found."}), 404
    return jsonify(room_data(room_id, room))


@app.route("/move", methods=["POST"])
def make_move():
    data = request.get_json(silent=True) or {}
    room_id = data.get("game_id")
    room = rooms.get(room_id)
    if not room:
        return jsonify({"success": False, "message": "Game room not found."}), 404
    if not room["started"]:
        return jsonify({"success": False, "message": "Waiting for your friend to join."}), 409
    try:
        move = chess.Move.from_uci(data.get("from", "") + data.get("to", ""))
    except ValueError:
        return jsonify({"success": False, "message": "Invalid square."}), 400
    if move not in room["board"].legal_moves:
        return jsonify({"success": False, "message": "Illegal move."})
    room["board"].push(move)
    return jsonify(room_data(room_id, room))


@app.route("/computer-move", methods=["POST"])
def computer_move():
    data = request.get_json(silent=True) or {}
    room_id = data.get("game_id")
    room = rooms.get(room_id)
    if not room or room["mode"] != "computer":
        return jsonify({"success": False, "message": "This is not a computer game."}), 400
    if room["board"].is_game_over() or room["board"].turn != chess.BLACK:
        return jsonify({"success": False, "message": "It is not the computer's turn."}), 400
    room["board"].push(random.choice(list(room["board"].legal_moves)))
    return jsonify(room_data(room_id, room))


@app.route("/reset", methods=["POST"])
def reset_game():
    data = request.get_json(silent=True) or {}
    room_id = data.get("game_id")
    room = rooms.get(room_id)
    if not room:
        return jsonify({"success": False, "message": "Game room not found."}), 404
    room["board"] = chess.Board()
    return jsonify(room_data(room_id, room))


if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True)
