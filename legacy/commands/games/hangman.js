const { Client, Message, MessageEmbed } = require(`discord.js`);
const fs = require(`fs`);
const path = require(`path`);

let Dict = fs.readFileSync(path.resolve(__dirname, `../../words.txt`))
//_ _ _ _   _ _ _   _ _ _ _
//62 Max Line

/**
 * @param {String} string 
 */
const stringToDash = (string) => { 
  let final = ``;
  for (let i=0;i<string.length;i++) {
    let ele = string[i];
    if (ele == ` `) {
      final += `   `
    } else {
      final += `_ `
    }
  }

  return final
}

const center = (string) => {
  let leng = string.length;
  let extra = Math.floor( (52 - leng)/2 );
  let final = ``;
  for (i=0;i<extra;i++) {
    final += ` `
  }
  final += string;
  return final
}

let hangmanStrings = [
  `
      /----------
      |         |
                |
                |
                |
                |
             -------`,
  `
      /----------
      |         |
      O         |
                |
                |
                |
             -------`,
  `
      /----------
      |         |
      O         |
      |         |
      |         |
                |
                |
             -------`,
  `
      /----------
      |         |
      O         |
     /|         |
      |         |
                |
                |
             -------`,
  `
      /----------
      |         |
      O         |
     /|         |
      |         |
     /          |
                |
             -------`,
  `
      /----------
      |         |
      O         |
     /|         |
      |         |
     / \\        |
                |
             -------`,
  `
      /----------
      |         |
      O         |
     /|\\        |
      |         |
     / \\        |
                |
             -------`
]

module.exports = {
  name: `hangman`,
  cooldown: 5,
  desc: `Makes an Hang Man Game`,
  /**
   * @param {Message} message
   * @param {Array<String>} args 
   * @param {Client} client 
   */
  async execute(message, args, client) {
    let embeds = {
      gameEmbed(guessed, creator, string) {
        let dashs = stringToDash(string);
        dashs = center(dashs);
        let fieldstr = `\`\`\`yaml\n${dashs}\n\`\`\``;
        let len = 6 - guessed.length;
        return new MessageEmbed().setColor(client.info.color).setFooter(client.info.footer).setTimestamp()
          .setTitle(`Hangman!`)
          .setAuthor(`Started by ${message.author.username}`, message.author.avatarURL({ dynamic: true }))
          .setDescription(`Hangman is a paper and pencil guessing game for two or more players.\nAnyone can guess a letter or try to guess the word at anytime\nThe choosers will be chosen after every round`)
          .addField(`Guesses Left: ${len}`, `\`\`\`yaml\n${hangmanStrings[guessed.length]}\`\`\``, true)
          .addField(`\u200B`, `**Not Included**\n${guessed.map(ele => ele.toUpperCase()).join(`\n`)}`, true)
          .addField(`Submitted Sentence`, fieldstr, false)
      },

    }

    return message.channel.send({ embeds: [embeds.gameEmbed([`n`, `m`, `l`, `a`], message.author, `This are the words you want to see`)] })
  }
}