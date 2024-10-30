const Hyperswarm = require("hyperswarm");
const { GAME_CHANNEL } = require("./constants");
const { Game } = require("./game");

class Server {
  constructor() {
    this.server = new Hyperswarm();
    this.players = new Map();
    this.clients = [];
    this.game = new Game();

    const topic = Buffer.alloc(32).fill(GAME_CHANNEL);

    this.server.join(topic, {
      server: true,
      client: false,
    });

    this.handleConnection = this.handleConnection.bind(this);
    this.server.on("connection", this.handleConnection);
  }

  handleConnection(socket, peerInfo) {
    console.log("New connection ");
    //Handle players
    const publicKey = peerInfo.publicKey.toString("hex");
    // If there are players, we ensure it's a new one using the publicKey.
    // If there are no players, the first one is added.
    if (this.players.size) {
      if (!this.players.has(publicKey)) {
        console.log("New player ");
        this.players.set(publicKey, true);
        this.clients.push(socket);
      }
      // Send status of the last guess.
      this.respontToClients(
        this.game.lastClue ?? "Guess a number between 1 and 100:"
      );
    } else {
      console.log("First player");
      this.players.set(publicKey, true);
      this.clients.push(socket);
      // Initialize the game for the first player.
      this.initializeGame();
    }

    //IMPORTANT: In order for the client to start responding it always needs a first message from the server that starts the client's socket.on()
    //this.respontToClients("Welcome to the game!");

    socket.on("data", (data) => {
      const jsonData = JSON.parse(data.toString());
      console.log(`Server: ${jsonData.nickname} guessed ${jsonData.guess}`);

      // Handles the responses from the clients and determines if it's correct or not.
      // Convert the guess to a number.
      const guessedNumber = parseInt(jsonData.guess);
      if (this.isValidGuess(guessedNumber)) {
        if (this.game.isStarted) {
          if (guessedNumber === this.game.numberToGuess) {
            const message = `User ${jsonData.nickname} guessed ${jsonData.guess} and it's correct!\n The game is over! \n A new game will start soon.`;
            this.respontToClients(message);
            this.game.isEnded = true;
            this.initializeGame();
          } else {
            if (guessedNumber > this.game.numberToGuess) {
              this.game.lastClue = `User ${jsonData.nickname} guessed ${jsonData.guess} and it's too high!`;
            } else if (guessedNumber < this.game.numberToGuess) {
              this.game.lastClue = `User ${jsonData.nickname} guessed ${jsonData.guess} and it's too low!`;
            }
            this.respontToClients(this.game.lastClue);
          }
        }
      } else {
        const message = `User ${jsonData.nickname} guessed ${jsonData.guess} and it's not a valid guess. Please guess a number between 1 and 100.`;
        this.respontToClients(message);
      }
    });
  }

  isValidGuess(guess) {
    if (guess < 1 || guess > 100) {
      return false;
    }
    return true;
  }

  respontToClients(message) {
    for (const client of this.clients) {
      client.write(
        JSON.stringify({
          type: "game-update",
          message,
        })
      );
    }
  }

  initializeGame() {
    this.game.startGame();
    this.respontToClients("Game started! Guess a number between 1 and 100:");
  }
}

module.exports = { Server };
