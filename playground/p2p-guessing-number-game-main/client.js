const Hyperswarm = require("hyperswarm");
const { GAME_CHANNEL } = require("./constants");
const { CLI } = require("./cli");

class Client {
  constructor(nickname) {
    this.nickname = nickname;
    this.client = new Hyperswarm();
    this.cli = new CLI();

    this.topic = Buffer.alloc(32).fill(GAME_CHANNEL);
    this.client.join(this.topic, {
      server: false,
      client: true,
    });

    this.handleConnection = this.handleConnection.bind(this);
    this.client.on("connection", this.handleConnection);
  }

  handleConnection(socket, peerInfo) {
    console.log("Client connected to server!");
    this.connection = socket;
    socket.on("data", (data) => {
      const jsonData = JSON.parse(data.toString());

      if (jsonData.type === "game-update") {
        console.log(jsonData.message);
        this.askGuess();
      }
    });
  }

  askGuess() {
    this.cli.askTerminal("> ").then((number) => {
      this.connection.write(
        JSON.stringify({
          nickname: this.nickname,
          guess: number,
        })
      );
    });
  }
}

module.exports = { Client };
