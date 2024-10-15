const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const port = process.env.PORT || 3000;

app.use(express.static('public'));

let players = [];
let dealer = { hand: [], score: 0 };

function createDeck() {
  const suits = ['♠', '♣', '♥', '♦'];
  const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  let deck = [];
  for (let suit of suits) {
    for (let value of values) {
      deck.push({ value, suit });
    }
  }
  return deck.sort(() => Math.random() - 0.5);
}

let deck = createDeck();

function calculateScore(hand) {
  let value = 0;
  let aces = 0;
  hand.forEach(card => {
    if (card.value === 'A') {
      value += 11;
      aces++;
    } else if (['K', 'Q', 'J'].includes(card.value)) {
      value += 10;
    } else {
      value += parseInt(card.value);
    }
  });
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }
  return value;
}

io.on('connection', (socket) => {
  socket.on('joinGame', (name) => {
    const newPlayer = { id: socket.id, name, hand: [], balance: 1000, bet: 0, standing: false };
    players.push(newPlayer);
    io.emit('updatePlayers', players);
  });

  socket.on('placeBet', (bet) => {
    const player = players.find(p => p.id === socket.id);
    if (player && bet > 0 && bet <= player.balance) {
      player.bet = bet;
      player.balance -= bet;
      io.emit('updatePlayers', players);

      // Check if all players have placed their bets
      if (players.every(p => p.bet > 0)) {
        startGame();
      }
    }
  });

  socket.on('dealCard', () => {
    const player = players.find(p => p.id === socket.id);
    if (player) {
      player.hand.push(deck.pop());
      player.score = calculateScore(player.hand);
      io.emit('updatePlayers', players);
      if (player.score > 21) {
        socket.emit('gameResult', `${player.name} busts! You lose!`);
        player.standing = true;
      }
    }
  });

  socket.on('stand', () => {
    const player = players.find(p => p.id === socket.id);
    if (player) {
      player.standing = true;
      if (players.every(p => p.standing || calculateScore(p.hand) > 21)) {
        dealerTurn();
      }
    }
  });

  socket.on('disconnect', () => {
    players = players.filter(p => p.id !== socket.id);
    io.emit('updatePlayers', players);
  });

  function startGame() {
    // Deal initial cards to players and dealer
    players.forEach(player => {
      player.hand.push(deck.pop());
      player.hand.push(deck.pop());
      player.score = calculateScore(player.hand);
    });
    dealer.hand.push(deck.pop());
    dealer.hand.push(deck.pop());
    dealer.score = calculateScore(dealer.hand);

    io.emit('startGame', { dealer, players });
  }

  function dealerTurn() {
    while (calculateScore(dealer.hand) < 17) {
      dealer.hand.push(deck.pop());
    }
    dealer.score = calculateScore(dealer.hand);
    io.emit('updateDealer', dealer);
    determineWinners();
  }

  function determineWinners() {
    players.forEach(player => {
      if (player.score <= 21) {
        if (dealer.score > 21 || player.score > dealer.score) {
          player.balance += player.bet * 2;
          socket.to(player.id).emit('gameResult', `${player.name} wins!`);
        } else if (player.score === dealer.score) {
          player.balance += player.bet;
          socket.to(player.id).emit('gameResult', `${player.name} ties!`);
        } else {
          socket.to(player.id).emit('gameResult', `${player.name} loses!`);
        }
      }
    });
    players.forEach(player => {
      player.hand = [];
      player.bet = 0;
      player.standing = false;
    });
    dealer.hand = [];
    deck = createDeck();
    io.emit('updatePlayers', players);
    io.emit('updateDealer', dealer);
  }
});

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});