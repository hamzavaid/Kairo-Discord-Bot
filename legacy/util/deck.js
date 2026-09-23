const SUITS = ["♠", "♣", "♥", "♦"]

const VALUES = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K"
]

const CARD_VALUE_MAP = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14
}

class Deck {
  constructor(cards = freshDeck()) {
    this.cards = cards;
    this.pile = [];
  }

  get numberOfCards() {
    return this.cards.length;
  }

  pop() {
    return this.cards.shift()
  }

  push(card) {
    this.cards.push(card)
  }

  unshift(card) {
    this.cards.unshift(card)
  }

  remove(card) {
    let temp = this.cards[card]
    if (temp != undefined) {
      let index = this.cards.indexOf(card);
      this.cards.slice(index, 1)
    } else {
      this.cards.slice(card, 1)
    }
  }

  addPile(card) {
    this.pile.push(card)
  }

  pileDeck() {
    return new Deck(this.pile)
  }

  unshiftPile(card) {
    this.pile.unshift(card);
  }

  concat(cards) {
    this.cards = this.cards.concat(cards);
  }

  shuffle() {
    for (let i = this.numberOfCards - 1; i > 0; i--) {
      const newIndex = Math.floor(Math.random() * (i + 1))
      const oldValue = this.cards[newIndex]
      this.cards[newIndex] = this.cards[i]
      this.cards[i] = oldValue
    }
  }
}

class Card {
  constructor(suit, value) {
    this.suit = suit
    this.value = value
  }

  get color() {
    return this.suit === "♣" || this.suit === "♠" ? "black" : "red"
  }
}

function freshDeck() {
  return SUITS.flatMap(suit => {
    return VALUES.map(value => {
      return new Card(suit, value)
    })
  })
}

module.exports = { Deck, Card }