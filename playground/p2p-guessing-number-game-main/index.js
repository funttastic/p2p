const { CLI } = require("./cli");
const { Server } = require("./server");
const { Client } = require("./client");

async function main() {
  const cli = new CLI();
  const nickname = await cli.askTerminal("What is your nickname? ");

  const lowerCaseNickname = nickname.toLowerCase();

  if (lowerCaseNickname === "server") {
    const server = new Server();
  } else {
    const client = new Client(nickname);
  }
}

main();
