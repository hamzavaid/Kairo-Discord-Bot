const { MessageEmbed, Client, GuildMember, NewsChannel, MessageSelectMenu, MessageButton } = require("discord.js");

function newSplit(string, by, length, half) {
  let arr = string.split(by);
  let l = half != undefined ? Math.ceil(arr.length / 2) : length;
  let front = arr.splice(0, l).join(by)
  let back = arr.splice(-l).join(by)
  return [front + by, back]
}

const SPECIAL = {
  COLOR: `⚫`,
  VALUES: [ 
    "W",
    "+4",
  ],
  VALUE_MAP: {
    "0": 0,
    "1": 1,
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 7,
    "8": 8,
    "9": 9,
    "S": 'S',
    "R": 'R',
    "+2": '+2',
    "W": 'W',
    "+4": '+4',
  }
}

const COLORS = ["🔴", "🔵", "🟢", "🟡"];

const COLORS_MAP = {
  "🔴": `RED`,
  "🔵": `BLUE`,
  "🟢": `GREEN`,
  "🟡": `YELLOW`,
  "⚫": `BLACK`,
}

const COLORS_VALUES = {
  "RED": 10,
  "BLUE": 20,
  "GREEN": 30,
  "YELLOW": 40,
  "BLACK": 50,
}

const OV_H = {
  "0": 1,
  "1": 2,
  "2": 3,
  "3": 4,
  "4": 5,
  "5": 6,
  "6": 7,
  "7": 8,
  "8": 9,
  "9": 9.1,
  "S": 9.2,
  "R": 9.3,
  "+2": 9.4,
  "W": 1,
  "+4": 2,
}

const UNO_VALUES = [
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "S",
  "R",
  "+2"
]

const UNO_TEXT = {
  "0": `0`,
  "1": `1`,
  "2": `2`,
  "3": `3`,
  "4": `4`,
  "5": `5`,
  "6": `6`,
  "7": `7`,
  "8": `8`,
  "9": `9`,
  "S": `Skip`,
  "R": `Reverse`,
  "+2": `Plus 2`,
  "W": `Wild`,
  "+4": 'Plus 4'
}

class UnoDeck {
  constructor(cards = UnofreshDeck()) {
    this.cards = cards;
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

  shuffletop() {
    let t = this.pop();
    this.push(t);
    return this;
  }

  shuffle() {
    for (let i = this.numberOfCards - 1; i > 0; i--) {
      const newIndex = Math.floor(Math.random() * (i + 1))
      const oldValue = this.cards[newIndex]
      this.cards[newIndex] = this.cards[i]
      this.cards[i] = oldValue
    }
    return this
  }

  /**
   * @param {Number} number 
   * @returns {Array<UnoCard>}
   */
  draw(number) {
    let drewCards = [];
    for (let i = 0; i < number; i++) {
      let card = this.pop();
      drewCards.push(card)
    }
    return drewCards
  }
}

class UnoCard {
  constructor(color, value) {
    this.color = color;
    this.value = value;
  }

  get cardcolor() {
    return COLORS_MAP[this.color];
  }

  get numberValue() {
    return (COLORS_VALUES[this.cardcolor] + OV_H[this.value])
  }

  /**
   * @param {UnoCard} card 
   * @returns {Boolean}
   */
  playable(card, color) {
    if (this.cardcolor == `BLACK`) return true
    if (this.cardcolor == card.cardcolor) return true
    if (this.value == card.value) return true
    if (card.cardcolor == `BLACK` && this.cardcolor == color) return true
    return false
  }

}

function UnofreshDeck() {
  let arr = [];
  for (let j = 0; j < 2; j++) {
    let tempArr = COLORS.flatMap(color => {
      return UNO_VALUES.map(value => {
        return new UnoCard(color, value)
      })
    })

    arr = arr.concat(tempArr)
  }
  for (let i=0;i<4;i++) {arr.push(new UnoCard(SPECIAL.COLOR, SPECIAL.VALUES[0]))}
  for (let i=0;i<4;i++) {arr.push(new UnoCard(SPECIAL.COLOR, SPECIAL.VALUES[1]))}
  return arr
}

class Player {
  /**
   * @param {GuildMember} member 
   * @param {Number} number
   * @param {Array<UnoCard>} hand
   */
  constructor(member, number, hand) {
    this.member = member;
    this.user = member.user;
    this.number = number;
    this.creator = number == 1 ? true : false
    this.hand = hand;
    this.record = 0;
  }

  addwin() {
    this.record++
    return this
  }

  cardEmbed(client, topcard) {
    let str = newSplit(this.hand.map(card => `${card.color} - ${UNO_TEXT[card.value]}`).join(`\n`), `\n`, 0, true)
    let temp = this.hand.filter(card => card.playable(topcard)).map((card, i) => `${i+1}.| ${card.color} - ${UNO_TEXT[card.value]}`);
    temp.push(`${temp.length+1}.| DRAW`)
    return new MessageEmbed().setColor(client.info.color).setFooter(client.info.footer).setTimestamp()
      .setTitle(`Your Hand!`)
      .addField(`**Cards**`, str[0], true)
      .addField(`\u200B`, str[1], true)
      .addField(`**Playable Cards**`, temp.join(`\n`), false)
  }

  SelectMenu() {
    let arr = this.hand.map((card, i) => { return { label: UNO_TEXT[card.value], value: `${i}`, description: `Card Number #${i+1}`, emoji: card.color } });
    return new MessageSelectMenu().addOptions(arr).setCustomId(this.user.id).setPlaceholder(`Cards`).setMaxValues(1)
  }

  playableSelectMenu(topcard) {
    let arr = this.hand.filter(card => card.playable(topcard)).map((card, i) => { return { label: UNO_TEXT[card.value], value: `${i}`, description: `Card Number #${i+1}`, emoji: card.color } });
    return new MessageSelectMenu().addOptions(arr).setCustomId(this.user.id).setPlaceholder(`Cards`).setMaxValues(1)
  }
}

class UnoUtil {
  /**
   * @param {Client} client 
   */
  constructor(client = undefined) {
    this.client = client;

    this.special = SPECIAL;
    this.colors = COLORS;
    this.colors_map = COLORS_MAP;
    this.colors_values = COLORS_VALUES;
    this.number_values = OV_H;
    this.uno_values = UNO_VALUES;
    this.uno_text = UNO_TEXT;
  }

  createCard(color, value) {
    return new UnoCard(color, value)
  }

  createDeck(cards) {
    if (cards) {
      return new UnoDeck(cards)
    } else return new UnoDeck()
  }

  createPlayer(member, number, hand) {
    return new Player(member, number, hand)
  }

  get embeds() {
    let { client } = this
    return {
      P2waiting(starter, players) {
        return new MessageEmbed().setColor(client.info.color).setFooter(client.info.footer).setTimestamp()
          .setTitle(`Waiting For More Players...`)
          .setAuthor(`Started By ${starter.tag} - (${starter.id})`)
          .setDescription(`Once another player joins the game\nThe game will automatically start in 30 seconds.\n\nIf another person joins after the game already\nstarted, they must wait until game finishes.\n\n__**Current Players**__\n${players.map((play, i) => `> Player ${i+1} > ${play.tag} = <@${play.id}>`).join(`\n`)}`)
          .addField(`**Controls**`, `
⭕ : Lets you join the game after its over
❗ : Leaves the game
          `)
      },
      GameEmbed(players, turn, topcard) {
        let embed = new MessageEmbed().setColor(client.info.color).setFooter(client.info.footer).setTimestamp()
          .setTitle(`Uno Game!`)
          .setDescription(`Game Has Started!\nPlayers will rotate in increasing values from 1 to ${players.length}\n\`Beta Version\``)
          .addField(`**Player ${turn}'s Turn**`, `**Current Card: ${topcard.color} ${topcard.value}**`, false)

        for (let i = 0; i < players.length; i++) {
          let ele = players[i];
          if (i == turn) {
            embed.addField(`__Player ${i+1} - ${ele.user.tag}__`, `> Number of Cards: ${ele.hand.length}\n> Record: ${ele.record}`, true)
          } else {
            embed.addField(`Player ${i+1} - ${ele.user.tag}`, `> Number of Cards: ${ele.hand.length}\n> Record: ${ele.record}`, true)
          }
        }

        embed.addField(`**Controls**`, `
🃏 : Shows your hand (privately)
❗ : Leaves the game
⭕ : Lets you join the game after its over
🖊️ : Place down a card (for active Player)
📨 : Draw a card (for active Player)
        `, false)

        return embed
      },
    }

  }

  get buttons() {
    let { client } = this;
    return {
      join: new MessageButton().setCustomId(`join`).setEmoji(`⭕`).setLabel(`JOIN`).setStyle(`PRIMARY`),
      exit: new MessageButton().setCustomId(`exit`).setEmoji(`❗`).setLabel(`LEAVE`).setStyle(`PRIMARY`),
      hand: new MessageButton().setCustomId(`hand`).setEmoji(`🃏`).setLabel(`HAND`).setStyle(`PRIMARY`),
      input: new MessageButton().setCustomId(`input`).setEmoji(`🖊️`).setLabel(`PLACE`).setStyle(`PRIMARY`),
      draw: new MessageButton().setCustomId(`draw`).setEmoji(`📨`).setLabel(`DRAW`).setStyle(`PRIMARY`)
    }

  }
}

module.exports = { UnoUtil, Player, UnoDeck }