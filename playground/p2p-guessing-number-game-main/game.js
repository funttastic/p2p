class Game {
  constructor() {
    this.isStarted = false;
    this.numberToGuess = 0;
    this.isEnded = false;
    this.lastGuess = null;
    this.lastClue = null;
  }

  getNumberToGuess() {
    return Math.floor(Math.random() * 100) + 1;
  }

  startGame() {
    this.numberToGuess = this.getNumberToGuess();
    this.isStarted = true;
    console.log("Number to guess: ", this.numberToGuess);
  }
}

module.exports = { Game };
