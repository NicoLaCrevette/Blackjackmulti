const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

let players = [];
let dealer = { hand: [], score: 0 };

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('joinGame', (playerName) => {
    const player = {
      id: socket.id,
      name: playerName,
      hand: [],
      balance: 1000,
      score: 0,
    };
    players.push(player);
    io.emit('updatePlayers', players);
  });

  socket.on('placeBet', (bet) => {
    const player = players.find(p => p.id === socket.id);
    if (player) {
      player.balance -= bet;
      io.emit('updatePlayers', players);
    }
  });

  socket.on('dealCard', () => {
    const player = players.find(p => p.id === socket.id);
    if (player) {
      const card = dealRandomCard();
      player.hand.push(card);
      player.score = calculateHandValue(player.hand);
      io.emit('updatePlayers', players);
    }
  });

  socket.on('stand', () => {
    // Handle the dealer's turn logic here
    dealer.hand = [];
    dealer.score = 0;

    while (dealer.score < 17) {
      const card = dealRandomCard();
      dealer.hand.push(card);
      dealer.score = calculateHandValue(dealer.hand);
    }

    io.emit('updateDealer', dealer);
    determineWinner();
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
    players = players.filter(player => player.id !== socket.id);
    io.emit('updatePlayers', players);
  });
});

function dealRandomCard() {
  const suits = ["♠", "♣", "♥", "♦"];
  const values = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const suit = suits[Math.floor(Math.random() * suits.length)];
  const value = values[Math.floor(Math.random() * values.length)];
  return { suit, value };
}

function calculateHandValue(hand) {
  let value = 0;
  let aces = 0;

  hand.forEach(card => {
    if (card.value === 'A') {
      value += 11;
      aces += 1;
    } else if (['K', 'Q', 'J'].includes(card.value)) {
      value += 10;
    } else {
      value += parseInt(card.value);
    }
  });

  while (value > 21 && aces > 0) {
    value -= 10;
    aces -= 1;
  }

  return value;
}

function determineWinner() {
  players.forEach(player => {
    if (player.score > 21) {
      io.to(player.id).emit('gameResult', 'Bust! You lose.');
    } else if (dealer.score > 21 || player.score > dealer.score) {
      player.balance += 20; // Adjust winnings as necessary
      io.to(player.id).emit('gameResult', 'You win!');
    } else if (player.score < dealer.score) {
      io.to(player.id).emit('gameResult', 'You lose.');
    } else {
      player.balance += 10; // Adjust for tie
      io.to(player.id).emit('gameResult', 'It\'s a tie!');
    }
  });
  io.emit('updatePlayers', players);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
