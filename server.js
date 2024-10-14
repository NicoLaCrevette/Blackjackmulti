const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

let players = [];
let deck = [];
let dealerHand = [];

function createDeck() {
  const suits = ["♠", "♣", "♥", "♦"];
  const values = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  deck = [];
  for (let suit of suits) {
    for (let value of values) {
      deck.push({ value, suit });
    }
  }
  shuffleDeck();
}

function shuffleDeck() {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

function calculateHandValue(hand) {
  let value = hand.reduce((sum, card) => sum + getCardValue(card), 0);
  let aces = hand.filter(card => card.value === "A").length;
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }
  return value;
}

function getCardValue(card) {
  if (card.value === "A") {
    return 11;
  } else if (["K", "Q", "J"].includes(card.value)) {
    return 10;
  } else {
    return parseInt(card.value);
  }
}

io.on('connection', (socket) => {
  console.log('New player connected:', socket.id);

  socket.on('joinGame', (playerName) => {
    players.push({ id: socket.id, name: playerName, hand: [], balance: 1000, isStanding: false });
    if (players.length === 1) {
      // First player joined, create a new deck and dealer hand
      createDeck();
      dealerHand = [];
    }
    io.emit('updatePlayers', players);
  });

  socket.on('placeBet', (bet) => {
    const player = players.find(p => p.id === socket.id);
    if (player && player.balance >= bet) {
      player.balance -= bet;
      player.bet = bet;
      io.emit('updatePlayers', players);
      if (players.every(p => p.bet > 0)) {
        // All players have placed their bets, start dealing initial cards
        dealInitialCards();
      }
    }
  });

  socket.on('dealCard', () => {
    const player = players.find(p => p.id === socket.id);
    if (player) {
      const card = deck.pop();
      player.hand.push(card);
      io.emit('updatePlayers', players);
      if (calculateHandValue(player.hand) > 21) {
        player.isStanding = true;
        checkAllPlayersStand();
      }
    }
  });

  socket.on('stand', () => {
    const playerIndex = players.findIndex(p => p.id === socket.id);
    if (playerIndex !== -1) {
      players[playerIndex].isStanding = true;
      checkAllPlayersStand();
    }
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    players = players.filter(p => p.id !== socket.id);
    io.emit('updatePlayers', players);
  });
});

function dealInitialCards() {
  players.forEach(player => {
    player.hand.push(deck.pop());
    player.hand.push(deck.pop());
  });
  dealerHand.push(deck.pop());
  io.emit('startGame', { hand: dealerHand, score: calculateHandValue(dealerHand) }, players);
}

function checkAllPlayersStand() {
  if (players.every(player => player.isStanding)) {
    dealerTurn();
  }
}

function dealerTurn() {
  while (calculateHandValue(dealerHand) < 17) {
    dealerHand.push(deck.pop());
  }
  const dealerScore = calculateHandValue(dealerHand);
  io.emit('updateDealer', { hand: dealerHand, score: dealerScore });
  determineWinners();
}

function determineWinners() {
  const dealerScore = calculateHandValue(dealerHand);
  players.forEach(player => {
    const playerScore = calculateHandValue(player.hand);
    let result;
    if (playerScore > 21) {
      result = `${player.name} busts! Dealer wins.`;
    } else if (dealerScore > 21 || playerScore > dealerScore) {
      result = `${player.name} wins!`;
      player.balance += player.bet * 2;
    } else if (playerScore < dealerScore) {
      result = `${player.name} loses! Dealer wins.`;
    } else {
      result = `${player.name} ties with the dealer.`;
      player.balance += player.bet;
    }
    io.to(player.id).emit('gameResult', result);
  });
  io.emit('updatePlayers', players);
}

app.use(express.static('public'));

server.listen(3000, () => {
  console.log('Server is running on port 3000');
});