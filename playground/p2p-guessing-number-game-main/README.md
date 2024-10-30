# Guessing Number Game 
This project is a simple peer-to-peer (P2P) game implemented using Node.js and Hyperswarm. The game involves guessing a number between 1 and 100 in a distributed environment.

## Installation
To get started, clone this repository to your local machine:


```
git clone <repository_url>
```

Then, navigate to the project directory:


```
cd p2p-guessing-number-game
```

Install the dependencies using npm:

```
npm install
```

## Usage
### Server
To run the server, execute the following command:

```
node index.js
```
and when the game ask you for a nickname, you have to write ```Server```

### Client
To run the client, execute the following command:

```
node index.js
```

You will be prompted to enter your nickname. After entering your nickname, you can start guessing numbers between 1 and 100.

## How It Works
### Server
The server uses Hyperswarm to manage connections. It handles incoming connections from clients, manages player interactions, and facilitates the game logic. The server waits for clients to connect and prompts them to guess a number. Once a client makes a guess, the server evaluates it and sends feedback to all connected clients.

### Client
The client also uses Hyperswarm to connect to the server. After establishing a connection, the client awaits game updates from the server. Upon receiving an update, it displays the message from the server and prompts the user to enter their guess. The guess is then sent to the server for evaluation.
