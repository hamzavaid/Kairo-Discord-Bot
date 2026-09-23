const { Client, Message, MessageEmbed, MessageActionRow, MessageSelectMenu, GuildMember, InteractionCollector } = require(`discord.js`);
const { UnoUtil, Player, UnoDeck } = require(`../../util/UNO.js`);
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))

Array.prototype.diff = (a) => this.filter(i => a.indexOf(i) < 0);

const checknget = (deck) => {
  if (deck.cards[0].color == `⚫`) {
    deck.shuffletop()
    return checknget(deck);
  } else return deck.pop();
}

const toptounder = (arr) => {
  let top = arr.shift();
  arr.push(top);
  return arr
}

const actions = {
  reverse(order) {
    order = order.reverse()
    toptounder(order)
  },
  skip(order) {
    toptounder(order)
  },
  plustwo() {
    
  }
}

/**
 * 
 * @param {Message} message 
 * @param {Client} client 
 * @param {{ util: UnoUtil, deck: UnoDeck, GameMessage: Message, collector: InteractionCollector, pile: UnoDeck, players: Array<Player>, active: Boolean }} obj 
 */
async function game(message, client, { util, deck, GameMessage, collector, pile, players, active }) {
  let top = checknget(deck);
  pile.push(top);
  let order = players.sort((a, b) => a.number - b.number);
  let GameEmbed = util.embeds.GameEmbed(players, 1, top);
  GameMessage.edit({ embeds: [GameEmbed], components: [new MessageActionRow().addComponents(Object.values(util.buttons))] })

  const findPlayer = (id) => players.find(pl => pl.user.id == id)

  let currentTurn = order[0];
  let turns = [currentTurn];
  toptounder(order);

  collector.on(`collect`, async interaction => {

    if (players.length != order.length) {
      let diff = order.diff(players);
      for (let i = 0; i < diff.length; i++) {
        let ele = diff[i];
        let index = order.indexOf(ele);
        order.splice(index, 1)
      }
    }

    // currentTurn = order[0];
    // turns.push(currentTurn);

    switch (interaction.customId) {
      case "hand":
        let player = findPlayer(interaction.user.id);
        interaction.reply({ embeds: [player.cardEmbed(client, top)], ephemeral: true })
        break;
      case "draw":
        if (interaction.user.id != currentTurn.user.id) return interaction.reply({ content: `Its not your turn`, ephemeral: true })
        break;
      case "input":
        if (interaction.user.id != currentTurn.user.id) return interaction.reply({ content: `Its not your turn`, ephemeral: true })
        break;
    }

  })
}

module.exports = {
  name: `uno`,
  cooldown: 5,
  desc: `Play Uno with the bot`,
  /**
   * @param {Message} message
   * @param {Array<String>} args 
   * @param {Client} client 
   */
  async execute(message, args, client) {
    message.delete().catch((err) => console.log(err))
    if (client.games.get(message.author.id) == true) return;
    client.games.set(message.author.id, true)
    let util = new UnoUtil(client);
    let deck = util.createDeck().shuffle();
    let pile = util.createDeck([]);

    let players = []
    let active = false;

    /**
      * @param {GuildMember} member 
      * @param {UnoDeck} deck 
      * @returns {Player}
    */
    function makePlayer(member, deck, util) {
      let hand = deck.draw(7).sort((a, b) => a.numberValue - b.numberValue);
      let number = players.length + 1;
      let player = util.createPlayer(member, number, hand)

      players.push(player)
      return player
    }

    let firstPlayer = makePlayer(message.member, deck, util);

    let GameMessage = await message.channel.send({
      embeds: [util.embeds.P2waiting(firstPlayer.user, players.map(p => p.user))],
      components: [new MessageActionRow().addComponents([util.buttons.join, util.buttons.exit])]
    })

    const collector = GameMessage.createMessageComponentCollector({
      idle: 5 * 60 * 1000,
    })

    collector.on(`collect`, async interaction => {

      setTimeout(() => {
        if (active == false) {
          collector.stop(`No New Players`)
        }
      }, 60 * 1000)

      switch (interaction.customId) {
        case "join":
          if (players.map(pl => pl.user.id).includes(interaction.user.id)) return interaction.reply({ content: `Already In The Game`, ephemeral: true });
          let newPlayer = makePlayer(interaction.member, deck, util);

          await interaction.deferReply();
          await interaction.deleteReply();

          if (newPlayer.number == 2) {
            GameMessage.edit({ embeds: [util.embeds.P2waiting(firstPlayer.user, players.map(p => p.user))] })
            await sleep(30 * 1000)
            active = true;
            await game(message, client, { util, deck, GameMessage, collector, pile, players, active })
          }
          if (active == false) {
            GameMessage.edit({ embeds: [util.embeds.P2waiting(firstPlayer.user, players.map(p => p.user))] })
          }
          break;
        case "exit":
          if (players.map(pl => pl.user.id).includes(interaction.user.id)) {
            let player = players.find(pl => pl.user.id == interaction.user.id);
            let index = players.indexOf(player);
            players.splice(index, 1);
            if (players.length < 2 && active == true) {
              return collector.stop(`Players Left`);
            }
            GameMessage.edit({ embeds: [util.embeds.P2waiting(firstPlayer.user, players.map(p => p.user))] })
          }
          interaction.deferReply().then(() => interaction.deleteReply())
          break;
      }
    })

    collector.on(`end`, async (collected, reason) => {
      GameMessage.delete().catch((err) => console.log(err))
      players = [];
      active = false;
      client.games.set(message.author.id, false)
    })

  }
}