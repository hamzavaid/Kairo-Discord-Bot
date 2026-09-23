const { Client, Message, MessageButton, MessageEmbed, GuildMember, MessageActionRow } = require(`discord.js`);

/**
 * @param {Message} message 
 * @param {String} string 
 * @returns {GuildMember}
 */
function userCheck(message, string) {
  let user = message.guild.members.cache.get(string);
  if (user != undefined) return user;
  user = message.guild.members.cache.find(r => r.displayName.toLowerCase() == string.toLowerCase())
  if (user != undefined) return user;
  user = message.guild.members.cache.find(r => r.user.username == string.toLowerCase())
  if (user != undefined) return user;
  user = message.mentions.users.first();
  if (user != undefined) return user
  return undefined
}

let buttons = {
  rock: new MessageButton({ customId: `rock`, emoji: `🪨`, style: `PRIMARY` }),
  scissors: new MessageButton({ customId: `scissors`, emoji: `✂️`, style: `PRIMARY` }),
  paper: new MessageButton({ customId: `paper`, emoji: `📄`, style: `PRIMARY` }),
  quit: new MessageButton({ customId: `quit`, label: `Quit`, style: `DANGER` }),
  accept: new MessageButton({ customId: `accept`, emoji: `✔️`, style: `SECONDARY` }),
  decline: new MessageButton({ customId: `decline`, emoji: `❌`, style: `SECONDARY` }),
  emojis: {
    rock: `🪨`,
    scissors: `✂️`,
    paper: `📄`,
    accept: `✔️`,
    decline: `❌`,
  }
}

module.exports = {
  name: `rps`,
  names: [`rock-paper-scissors`],
  cooldown: 5,
  desc: `A Simple game of rock paper scissors`,
  /**
   * @param {Message} message
   * @param {Array<String>} args 
   * @param {Client} client 
   */
  async execute(message, args, client) {
    let { channel, author, guild, member } = message;
    let { info } = client;

    if (!args[0]) return channel.send({ embeds: [client.embeds.NoArgument()] })
    let user = userCheck(message, args.join(` `))
    if (user == undefined) return channel.send({ embeds: [client.embeds.NoUser()] })
    user = message.guild.members.cache.get(user.id)

    let waitEmbed = new MessageEmbed()
      .setColor(info.color)
      .setFooter(info.footer)
      .setTimestamp()
      .setTitle(`Invite has been sent to ${user.displayName}`)
      .setDescription(`The game will start when he accepts the request`)

    let gameMessage = await channel.send({ embeds: [waitEmbed] })

    let invite_embed = new MessageEmbed()
      .setColor(info.color)
      .setFooter(info.footer)
      .setTimestamp()
      .setTitle(`${member.displayName} has invited ${user.displayName} to Rock Paper Scissors`)
      .setDescription(`Just a simple game of Rock, Paper, and Scissors\n\n[If you accept the game will be held here](https://discord.com/channels/${guild.id}/${channel.id}/${gameMessage.id})`)
      .addField(`Controls`, `✔️ : Accept the match\n❌ : Decline the match`);

    let Invite = await channel.send({ embeds: [invite_embed], content: `||<@${user.id}>||`, components: [new MessageActionRow().addComponents([buttons.accept, buttons.decline])] })
    let comp = await Invite.awaitMessageComponent({
      filter: (inter) => inter.user.id == user.id,
      time: 30 * 1000,
    })

    if (comp == undefined) {
      await Invite.delete()
      return gameMessage.edit({ embeds: [], content: `Time has ran out to accept the offer` })
    }

    if (comp.customId == `accept`) {

      await Invite.delete();

      let count = {
        chal: 0,
        opp: 0
      }

      let players = {
        chal: null,
        opp: null,
        chek: {
          chal: member.id,
          opp: user.id
        }
      }

      let beatsWho = {
        rock: `scissors`,
        paper: `rock`,
        scissors: `paper`
      }

      let alreadyVoted = [];

      let countMake = async (message) => {
        let total = count.chal + count.opp;
        let percentage = (val) => Math.round((val / total) * 100)
        let chalPer = percentage(count.chal);
        let oppPar = percentage(count.opp)
        if (total == 0) { chalPer = 0; oppPar = 0; }
        let em = new MessageEmbed()
          .setColor(info.color)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`Voting Center`)
          .setDescription(`Updates after every vote`)
          .addField(`${member.displayName}'s Count`, `Votes: ${count.chal}\n-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+\nPercentage: ${chalPer}%`, true)
          .addField(`${user.displayName}'s Count`, `Votes: ${count.opp}\n-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+\nPercentage: ${oppPar}%`, true);

        if (!message) {
          return await channel.send({ embeds: [em] })
        } else {
          return await message.edit({ embeds: [em] })
        }
      }

      let rpsEmbed = new MessageEmbed()
        .setColor(info.color)
        .setFooter(info.footer)
        .setTimestamp()
        .setTitle(`Rock Paper Scissors 🪨 ✂️ 📄`)
        .setDescription(`This match is between **Challenger** ${member.displayName} against **Opponent** ${user.displayName}\n__WHO WILL WIN!!__`)
        .addField(`${member.displayName}'s Corner`, `Waiting for Selection`, true)
        .addField(`${user.displayName}'s Corner`, `Waiting for Selection`, true)
        .addField(`\u200B`, `${buttons.emojis.rock} : Rock\n${buttons.emojis.paper} : Paper\n${buttons.emojis.scissors} : Scissors`, false)
        .addField(`Voting`, `You can vote on the person you think will win\mby pressing the button with their name`, false);

      await gameMessage.edit({ embeds: [rpsEmbed], components: [
        new MessageActionRow().addComponents([buttons.rock, buttons.paper, buttons.scissors, buttons.quit]),
        new MessageActionRow().addComponents([new MessageButton({ customId: `chal`, label: member.displayName, style: `SECONDARY` }), new MessageButton({ customId: `opp`, label: user.displayName, style: `SECONDARY` })])
      ] })

      let votingMessage = await countMake();

      let collector = gameMessage.createMessageComponentCollector({
        idle: 60 * 1000,
      })

      collector.on(`collect`, async interaction => {

        await interaction.deferReply();
        await interaction.deleteReply();

        if (!([member.id, user.id].some(s => s == interaction.user.id))) {
          if (alreadyVoted.includes(interaction.user.id)) return;
          if ([`chal`, `opp`].some(ele => ele == interaction.customId)) {
            alreadyVoted.push(interaction.user.id)
            count[interaction.customId] = count[interaction.customId] + 1
            await countMake(votingMessage)
          }
        } else {
          if (!([`rock`, `paper`, `scissors`, `quit`].some(ele => ele == interaction.customId))) return;
          if (interaction.customId == `quit`) {
            return gameMessage.edit({ content: `Game has been quit`, embeds: [], components: [] })
          }
          let field = rpsEmbed.fields.find(f => f.name == `${interaction.member.displayName}'s Corner`);
          let index = rpsEmbed.fields.indexOf(field);
          let playeris = players.chek.chal == interaction.user.id ? `chal` : `opp`;
          players[playeris] = interaction.customId;
          console.log(interaction.customId)
          if (players.chal != null && players.opp != null) {
            //Game Started
            let winner = undefined;
            let loser = undefined;

            winner = players.chal == beatsWho[players.opp] ? `opp` : `chal`;
            players.chal == players.opp ? winner = `tie` : null
            winner == `tie` ? loser = `tie` : (loser = winner == `opp` ? `chal` : `opp`)

            if (winner == `tie`) {
              let tieEmbed = new MessageEmbed()
                .setColor(info.color)
                .setFooter(info.footer)
                .setTimestamp()
                .setTitle(`Game Was A Tie`)
                .setDescription(`It was just a tie...`)

              await gameMessage.edit({ embeds: [tieEmbed], components: [] })
              return collector.stop(`Game was a tie`);
            } else {
              let userWinner = message.guild.members.cache.get(players.chek[winner]);
              let winEmbed = new MessageEmbed()
                .setColor(info.color)
                .setFooter(info.footer)
                .setTimestamp()
                .setTitle(`${userWinner.displayName} has won the game`)
                .setDescription(`${count[winner]} people voted for him\n\nCongrats! Still sucks against Sun tho`);

              if (userWinner.id == `221403951700901888`) winEmbed.setDescription(`${count[winner]} people voted for him`)

              gameMessage.edit({ embeds: [winEmbed], components: [] })
              return collector.stop(`Game has finished`)
            }

          } else {
            field.value = `**FINISH SELECTION**`
            rpsEmbed.fields[index] = field;
            gameMessage.edit({ embeds: [rpsEmbed], components: [
              new MessageActionRow().addComponents([buttons.rock, buttons.paper, buttons.scissors, buttons.quit]),
              new MessageActionRow().addComponents([new MessageButton({ customId: `chal`, label: member.displayName, style: `SECONDARY` }), new MessageButton({ customId: `opp`, label: user.displayName, style: `SECONDARY` })])
            ] })
          }
        }
      })
    } else if (comp.customId == `decline`) {
      await Invite.delete();
      return gameMessage.edit({ content: `Opponent has Declined`, embeds: [], components: [] })
    } else {
      gameMessage.deleta()
      Invite.delete()
      return channel.send(`[UNKNOWN ERROR] UNKNOWN BUTTON`)
    }

  }
}