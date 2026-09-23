const { Message, Client, Collection, Guild, Intents, MessageEmbed, MessageActionRow, MessageButton } = require(`discord.js`);
const { EventEmitter } = require(`events`);
const ytdl = require(`ytdl-core`);
const Spot = require(`simple-spotify`).Spotify;
const Youtube = require(`youtube-sr`).default;
const Spotify = new Spot();
require(`dotenv`).config()

const info = {
  color: `#3fbf9b`,
  prefix: process.env.PREFIX,
  errColor: `#73110a`,
  footer: `Made By Sun#4798 || Dm if any issues!`,
  footerImg: `https://64.media.tumblr.com/50b0f8b09564ece765e0f1f1dbeb3f0f/44508fffb1ecb43e-92/s800x448/3b361e24656372acc1254910cec552d1c5798b74.gif`,
  emojis: {
    X: `❌`,
    exclamation_question: `⁉️`,
    headphones: `🎧`,
    clocks: [`🕐`, `🕑`, `🕒`, `🕓`, `🕔`, `🕕`, `🕖`, `🕗`, `🕘`, `🕙`, `🕚`, `🕛`, `🕜`, `🕝`, `🕞`, `🕟`, `🕠`, `🕡`, `🕢`, `🕣`, `🕤`, `🕥`, `🕦`, `🕧`],
    clocks2: {

    }
  }
};

const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))

function parseMS(ms) {
  const roundTowardsZero = ms > 0 ? Math.floor : Math.ceil;
  return {
    days: roundTowardsZero(ms / 86400000),
    hours: roundTowardsZero(ms / 3600000) % 24,
    minutes: roundTowardsZero(ms / 60000) % 60,
    seconds: roundTowardsZero(ms / 1000) % 60
  };
}

function durationString(durObj) {
  return Object.values(durObj)
    .map((m) => (isNaN(m) ? 0 : m))
    .join(':');
}

/*
  async IdMaker() {
    let result = await libraries.find();
    let ids = result.flatMap(lib => lib.playlists).map(pl => pl.id);
    ids.sort((a, b) => Number.parseInt(a) - Number.parseInt(b));
    let id = `${Number.parseInt(ids[ids.length - 1]) + 1}`;
    if (id.length < 7) {
      let missing = 7 - id.length;
      let string = ``;
      for (i = 0; i < missing; i++) { string += `0` }
      id = `${string}${id}`
    }
    return id
  }
*/

const Errors = new Collection();
Errors
  .set(`Music`, {
    200001: `Command Executor is not in a Voice Channel`,
    200002: `Command Executor is not in the same Voice Channel as the bot`,
    200004: `There is no songs in the queue`,
    200003: `Bot is not in a Voice Channel`,
    200005: `Nothing is playing`,
  })
  .set(`Normal`, {
    100001: `Invalid Permissions`,
    100002: `Invalid Bot Permissions`,
    100003: `Argument Missing or not valid`,
    100004: `No Dj Roles Found`,
    100005: `Invalid Arguments`,
    100006: `User could not be found`
  })
  .set(`Playlist`, {
    300001: `Playlist with name already exists`,
    300002: `Max Amount of Playlists In Library`,
    300003: `No Library Found for Member`,
    300004: `Playlist could not be Found`,
    300005: `Max Amount of Songs in Playlist`,
    300006: `Song Could not be Found`,
    300007: `Name is Invalid or Missing`,
})

class Util extends EventEmitter {
  /**
   * 
   * @param {Client} client 
   */
  constructor(client) {
    super()
    this.client = client || undefined;

    this.info = info

    this.errors = Errors

    this.embeds = {
      NoUser() {
        const embed = new MessageEmbed()
          .setColor(info.errColor)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`${info.emojis.X} Error: __100006__`)
          .setDescription(`**The User could not be found**`);

        return embed
      },
      NoSong() {
        const embed = new MessageEmbed()
          .setColor(info.errColor)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`${info.emojis.X} Error: __300006__`)
          .setDescription(`**The Song you inputed could not be found**`);

        return embed
      },
      MaxSongs() {
        const embed = new MessageEmbed()
          .setColor(info.errColor)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`${info.emojis.X} Error: __300005__`)
          .setDescription(`**This Playlist has the max amount of songs possible**`);

        return embed
      },
      InvalidArgument() {
        const embed = new MessageEmbed()
          .setColor(info.errColor)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`${info.emojis.X} Error: __100005__`)
          .setDescription(`**Invalid Argument**`);

        return embed
      },
      NoPlaylist() {
        const embed = new MessageEmbed()
          .setColor(info.errColor)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`${info.emojis.X} Error: __300004__`)
          .setDescription(`**Playlist Could Not Be Found**`);

        return embed
      },
      NoLibrary() {
        const embed = new MessageEmbed()
          .setColor(info.errColor)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`${info.emojis.X} Error: __300003__`)
          .setDescription(`**You current do not have a Library**`);

        return embed
      },
      MaxPlaylists() {
        const embed = new MessageEmbed()
          .setColor(info.errColor)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`${info.emojis.X} Error: __300002__`)
          .setDescription(`**You Library has the Max Amount of Playlists**`);

        return embed
      },
      PlaylistCreate(message, name, id) {
        const embed = new MessageEmbed()
          .setColor(info.color)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`Playlist Created`)
          .setDescription(`**New Playlist Named "${name}" with ID (${id})**\n**Created by <@${message.author.id}> (${message.author.id})**`);

        return embed
      },
      InvalidPermissions(message) {
        const Missing_Permissions = new MessageEmbed()
          .setColor(info.errColor)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`${info.emojis.X} Error: __100001__`)
          .setDescription(`**<@${message.author.id}> has insufficient permissions to run this command**`);

        return Missing_Permissions
      },
      InvalidBotPermissions() {
        const Bot_perms = new MessageEmbed()
          .setColor(info.errColor)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`${info.emojis.X} Error: __100002__`)
          .setDescription(`**${client.user.username} has insufficient permissions to run this command**`);

        return Bot_perms
      },
      NoArgument() {
        const NoArg = new MessageEmbed()
          .setColor(info.errColor)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`${info.emojis.X} Error: __100003__`)
          .setDescription(`**No Argument Found**`)

        return NoArg;
      },
      NoDJRoles() {
        const NoDjs = new MessageEmbed()
          .setColor(info.errColor)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`${info.emojis.X} Error: __100004__`)
          .setDescription(`**${ErrorCodes[100004]}**`);

        return NoDjs
      },
      NotInVoice(message) {
        const NV_Embed = new MessageEmbed()
          .setColor(info.errColor)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`${info.emojis.X} Error: __200001__`)
          .setDescription(`**<@${message.author.id}> is not in a Voice Channel**`);

        return NV_Embed
      },
      BotNotInVoice(message, client) {
        const NV_Embed = new MessageEmbed()
          .setColor(info.errColor)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`${info.emojis.X} Error: __200003__`)
          .setDescription(`**${client.user.username} is not in a Voice Channel**`);

        return NV_Embed
      },
      NothingPlaying() {
        const NV_Embed = new MessageEmbed()
          .setColor(info.errColor)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`${info.emojis.X} Error: __200005__`)
          .setDescription(`**Nothing is playing on the bot**`);

        return NV_Embed
      },
      NotInSameVoice(message, client) {
        const NIS_Embed = new MessageEmbed()
          .setColor(info.errColor)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`${info.emojis.X} Error: __200002__`)
          .setDescription(`**<@${message.author.id}> is not in the same Voice Channel as the ${client.user.username}`);

        return NIS_Embed
      },
      NoQueue() {
        const Queue_Embed = new MessageEmbed()
          .setColor(info.errColor)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`${info.emojis.X} Error: __200004__`)
          .setDescription(`**Queue is empty.**`)

        return Queue_Embed;
      },
      NameTaken(name) {
        const NameTak = new MessageEmbed()
          .setColor(info.errColor)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`${info.emojis.X} Error: __300001__`)
          .setDescription(`**Playlist with name "${name}" already exists**`);

        return NameTak
      }
    }

    this.functions = {
      split(string, length, splitby, newsplit) {
        let arr = string.split(`${splitby}`)
        let characters = ``;
        let finishedarray = []

        for (i = 0; i < arr.length; i++) {
          let newarg = arr[i] + newsplit;
          if (characters.length + newarg.length >= length) {
            finishedarray.push(characters)
            characters = newarg
          } else {
            if (i == arr.length - 1) {
              if (!arr[i] == ``) {
                arr[i] = arr[i] + newsplit
              }
              let newchar = characters + arr[i];
              finishedarray.push(newchar)
            } else {
              characters += newarg;
            }
          }
        }

        return finishedarray;
      },
      add_space(string, length) {
        for (i = 0; i < length; i++) {
          string += ` `
        }
        return string
      },
      progressBar(number, numberdone) {
        if (numberdone == 0) {
          return { string: `🔘▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬`, percentage: 0 }
        } else {
          let percentage = Math.ceil((numberdone / number) * 100)
          let string = ``
          for (i = 0; i < 100; i += 3.33) {
            let nextnumber = i + 3.33
            if (percentage > i && percentage < nextnumber) {
              string += `🔘`
            } else {
              string += `▬`
            }
          }
          return { string, percentage }
        }
      },
      MinutesAndSeconds(date) {
        if (!date) date = Date.now()
        let seconds = Math.ceil(date / 1000)
        if (seconds >= 60) {
          let minutes = Math.floor(seconds / 60)
          let remainingSeconds = seconds % 60
          if (minutes >= 60) {
            let hours = Math.floor(minutes / 60)
            let remainingMinutes = minutes % 60
            if (toString(remainingMinutes).length == 1) remainingMinutes = `0${minutes}`
            return `${hours}:${remainingMinutes}:${remainingSeconds}`
          }
          if (toString(seconds).length == 1) seconds = `0${seconds}`
          return `${minutes}:${remainingSeconds}`
        }
        return `${seconds}`
      },
      Turn_in_to_MS(current) {
        let splitted = current.split(`:`)
        time = 0;
        if (splitted.length == 4) {
          time += splitted[0] * 24 * 60 * 60 * 1000
          time += splitted[1] * 60 * 60 * 1000
          time += splitted[2] * 60 * 1000
          time += splitted[3] * 1000
        } else if (splitted.length == 3) {
          time += splitted[0] * 60 * 60 * 1000
          time += splitted[1] * 60 * 1000
          time += splitted[2] * 1000
        } else if (splitted.length == 2) {
          time += splitted[0] * 60 * 1000
          time += splitted[1] * 1000
        } else if (splitted.length == 1) {
          time += splitted[0] * 1000
        }

        return time;
      },
    }

    if (client) {
      client.info = this.info
      client.errors = this.errors;
      client.embeds = this.embeds;
      client.functions = this.functions;
      client.plcomms = this.plcomms;
    }
  }

  parseMS = parseMS

  sleep = sleep

  durationString = durationString

  /**
   * @param {String} string 
   * @param {String} ele 
   */
  howMany(string, ele) {
    let strArr = string.split(``);
    let count = 0;
    let indArr = [];
    for (let i = 0; i < strArr.length; i++) {
      let val = strArr[i];
      if (val == ele) { count++; indArr.push(i) }
    }
    return { count, indexs: indArr }
  }

  /**
   * @param {String} string 
   */
  splitQuote(string) {
    let count = this.howMany(string, `"`);
    if (count.count < 2) return undefined;
    let arr = new BetterArr();
    let pairs = Math.floor(count.count / 2);
    let done = 0;
    for (let i = 0; i < pairs; i++) {
      let str = string.substring(count.indexs[done] + 1, count.indexs[done + 1])
      arr.push(str)
      done = done + 2;
    }

    return arr
  }

  async sendEmb(channel, embed, args) {
    if (!args) args = [undefined, undefined, undefined];
    let embed2 = this.embeds[embed](args[0], args[1], args[2]);
    return await channel.send({ embeds: [embed2] })
  }

  async #query(song, type, message, t) {
    let returnobj = ``;
    switch (type) {
      case "youtube_playlist":
        let rawSearch = await Youtube.getPlaylist(song);
        let songs = await rawSearch.fetch();
        let urls = songs.videos.map(track => {
          return new Track({
            url: track.url,
            title: track.title,
            artists: [new Artist({ name: track.channel?.name, id: track.channel?.id, channel: track.channel?.url, platform: `youtube` })],
            type: `youtube`,
            thumbnail: track.thumbnail?.url,
            duration: track.duration,
            id: track.id
          })
        }); //{ url: vid.url, type: `youtube` }
        returnobj = urls;
        break;
      case "youtube_video":
        let videoSearch = await Youtube.getVideo(song);
        let obj = new Track({
          url: videoSearch.url,
          title: videoSearch.title,
          artists: [new Artist({ name: videoSearch.channel?.name, id: videoSearch.channel?.id, channel: videoSearch.channel?.url, platform: `youtube` })],
          type: `youtube`,
          thumbnail: videoSearch.thumbnail?.url,
          duration: videoSearch.duration,
          id: videoSearch.id
        })  //{ url: song, type: `youtube` }
        returnobj = obj;
        break;
      case "spotify_song":
        let SpotiVid = await Spotify.track(song);
        let obj2 = new Track({
          url: `https://open.spotify.com/track/${SpotiVid.id}`,
          title: SpotiVid.name,
          artists: SpotiVid.artists.map(art => { return new Artist({ name: art.name, id: art.id, channel: art.external_urls.spotify, platform: `spotify` }) }),
          type: `spotify`,
          thumbnail: SpotiVid.album?.images[0].url,
          duration: SpotiVid.duration_ms,
          id: SpotiVid.id
        })
        returnobj = obj2
        break;
      case "spotify_playlist":
        let result = await Spotify.playlist(song, true);
        let objs = result.tracks.items.map(track => {
          return new Track({
            url: `https://open.spotify.com/track/${track.track.id}`,
            title: track.track.name,
            artists: track.track.artists.map(art => { return new Artist({ name: art.name, id: art.id, channel: art.external_urls.spotify, platform: `spotify` }) }),
            type: `spotify`,
            thumbnail: track.video_thumbnail.url,
            duration: track.track.duration_ms,
            id: track.track.id
          })
        }) //{ url: `https://open.spotify.com/track/${track.track.id}`, type: `spotify` }
        returnobj = objs;
        break;
      case "spotfiy_album":
        let result2 = await Spotify.album(song);
        let objs2 = await result2.tracks(true);
        returnobj = objs2.map(track => {
          return new Track({
            url: `https://open.spotify.com/track/${track.id}`,
            title: track.name,
            artists: track.artists.map(art => { return new Artist({ name: art.name, id: art.id, channel: art.external_urls.spotify, platform: `spotify` }) }),
            type: `spotify`,
            thumbnail: track.album?.images[0].url,
            duration: track.duration_ms,
            id: track.id
          })
        }); //{ url: `https://open.spotify.com/track/${track.id}`, type: `spotify` }
        break;
      case "youtube_search":
        let rawSearch2 = await Youtube.search(song, { limit: 4 });
        let tracks = rawSearch2.map(track => {
          return new Track({
            url: track.url,
            title: track.title,
            artists: [new Artist({ name: track.channel?.name, id: track.channel?.id, channel: track.channel?.url, platform: `youtube` })],
            type: `youtube`,
            thumbnail: track.thumbnail?.url,
            duration: track.duration,
            id: track.id
          })
        }); //{ url: track.url, type: `youtube` }

        if (!t) { returnobj = tracks[0] } else returnobj = tracks

        /*
        if (!t) {
          
          let row = new MessageActionRow();

          let em = new MessageEmbed()
            .setColor(info.color)
            .setFooter(info.footer)
            .setTimestamp()
            .setTitle(`All Results for ${song}`);
            
          let str = ``;
          for (let j = 0;j<tracks.length;j++) {
            let track = tracks[j];
            str += `**${j+1}.)** ${track.title} -- ${track.artists[0].name}\nURL: \`${track.url}\`\n`
            row.addComponents([new MessageButton({ style: `SUCCESS`, customId: j, label: j+1 })])
          }
          em.setDescription(str);

          let mes = await message.channel.send({ embeds: [em], components: [row] })
          const collector = mes.createMessageComponentCollector({
            filter: ({user}) => user.id == message.author.id
          })

          collector.on(`collect`, async inter => {
            let button = row.components.find(but => but.customId == inter.customId);
            let track = tracks[button.customId]
            returnobj = track;
          })

        } else returnobj = tracks*/

        break;
    }

    return returnobj
  }

  /**
   * 
   * @param {String} query - link that needs to be searched
   * @param {Boolean} full - Return a full Object or Array
   * @param {Message} message - command message
   * @returns {Promise<String}
   */
  async queryType(query, message, full, t) {
    const spotifySongRegex = /https?:\/\/(?:embed\.|open\.)(?:spotify\.com\/)(?:track\/|\?uri=spotify:track:)((\w|-){22})/;
    const spotifyPlaylistRegex = /https?:\/\/(?:embed\.|open\.)(?:spotify\.com\/)(?:playlist\/|\?uri=spotify:playlist:)((\w|-){22})/;
    const spotifyAlbumRegex = /https?:\/\/(?:embed\.|open\.)(?:spotify\.com\/)(?:album\/|\?uri=spotify:album:)((\w|-){22})/;
    let search = ``;

    if (Youtube.validate(query, `PLAYLIST`)) {
      search = `youtube_playlist`;
    }
    if (Youtube.validate(query, `VIDEO`)) {
      search = `youtube_video`;
    }
    if (spotifySongRegex.test(query)) {
      search = `spotify_song`;
    }
    if (spotifyPlaylistRegex.test(query)) {
      search = `spotify_playlist`;
    }
    if (spotifyAlbumRegex.test(query)) {
      search = `spotfiy_album`;
    }
    if (search == ``) {
      search = `youtube_search`
    }


    if (full) {
      let result = await this.#query(query, search, message, t);
      return result
    } else return search;
  }

  /**
   * @param {String} string 
   * @param {Number} length 
   * @param {String} splitby 
   * @param {String} newsplit 
   * @returns {Array<String>}
   */
  split(string, length, splitby, newsplit) {
    let arr = string.split(`${splitby}`)
    let characters = ``;
    let finishedarray = []

    for (let i = 0; i < arr.length; i++) {
      let newarg = arr[i] + newsplit;
      if (characters.length + newarg.length >= length) {
        finishedarray.push(characters)
        characters = newarg
      } else {
        if (i == arr.length - 1) {
          if (!arr[i] == ``) {
            arr[i] = arr[i] + newsplit
          }
          let newchar = characters + arr[i];
          finishedarray.push(newchar)
        } else {
          characters += newarg;
        }
      }
    }

    return finishedarray;
  }

  /**
  * @param {Object} obj 
  * @returns {Number}
*/
  getDepth(object) {
    var level = 1;
    for (var key in object) {
      if (!object.hasOwnProperty(key)) continue;

      if (typeof object[key] == 'object') {
        var depth = getDepth(object[key]) + 1;
        level = Math.max(depth, level);
      }
    }
    return level;
  }

  /**
    * @param {Object} object 
    * @returns {BetterArr<BetterArr<BetterArr>>}
  */
  values(object) {
    let value = Object.entries(object)
    let arr = new BetterArr();
    for (let i = 0; i < value.length; i++) {
      let entrie = value[i];
      let val2 = entrie[1];
      if (val2 instanceof Object) {
        arr.push([entrie[0], values(val2)])
      } else arr.push(entrie)
    }

    return arr
  }

  find(obj, findKey, name) {

    if (!name) name = `First`;

    let entries = Object.entries(obj);
    let keys = entries.map(arr => arr[0])
    let values = entries.map(arr => arr[1])

    for (let i = 0; i < entries.length; i++) {
      let key = keys[i];
      let value = values[i];
      let entry = entries[i];

      if (key == findKey) {
        return { parent: [name, obj], children: entry }
      } else if (value instanceof Object) {
        let temp = this.find(value, findKey, key);
        if (temp != undefined) return temp
      } else continue

    }
  }

}

class BetterArr extends Array {
  #orrarr;
  /**
   * Better Array
   * @param {Array} array - Original Array
   */
  constructor(array) {
    super()
    this.#orrarr = array;


    if (array) { for (let k = 0; k < array.length; k++) { this.push(array[k]) }; }
  }

  shuffle() {
    for (let i = this.length - 1; i > 0; i--) {
      const newIndex = Math.floor(Math.random() * (i + 1))
      const oldValue = this[newIndex]
      this[newIndex] = this[i]
      this[i] = oldValue
    }
  }

  empty() {
    for (let i = this.length; i > 0; i--) {
      this.shift();
    }
  }

  add(ele) {
    if (!Array.isArray(ele)) {
      this.push(ele);
    } else {
      for (let i = 0; i < ele.length; i++) {
        this.push(ele[i]);
      }
    }
  }

  remove(ele) {
    let index = this.indexOf(ele);
    if (index == -1) return false;
    return this.splice(index, 1)
  }

}

class Construct {
  /**
   * @param {Message} message - Command Message
   * @param {Number} volume - Guild Volume
   */
  constructor(message, volume) {
    this.message = message;
    this.guild = message.guild;
    this.textChannel = message.channel;
    this.voiceChannel = message.member.voice.channel;
    this.connection = null;
    this.queue = [];
    this.volume = (volume / 20);
    this.nowplaying = false
  }

}

let allIntents = [
  Intents.FLAGS.DIRECT_MESSAGES,
  Intents.FLAGS.DIRECT_MESSAGE_REACTIONS,
  Intents.FLAGS.DIRECT_MESSAGE_TYPING,
  Intents.FLAGS.GUILDS,
  Intents.FLAGS.GUILD_BANS,
  Intents.FLAGS.GUILD_EMOJIS,
  Intents.FLAGS.GUILD_INTEGRATIONS,
  Intents.FLAGS.GUILD_INVITES,
  Intents.FLAGS.GUILD_MEMBERS,
  Intents.FLAGS.GUILD_MESSAGES,
  Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
  Intents.FLAGS.GUILD_MESSAGE_TYPING,
  Intents.FLAGS.GUILD_PRESENCES,
  Intents.FLAGS.GUILD_VOICE_STATES,
  Intents.FLAGS.GUILD_WEBHOOKS
]

class CompressedMessage {
  constructor(message) {
    this.activity = message.activity;
    this.application = message.application;
    this.author = message.author.id;
    this.channel = message.channel.id;
    this.cleanContent = message.cleanContent;
    this.content = message.content;
    this.createdAt = message.createdAt;
    this.createdTimestamp = message.createdTimestamp;
    this.deleteable = message.deleteable;
    this.deleted = message.deleted;
    this.editable = message.editable;
    this.editedAt = message.editedAt;
    this.editedTimestamp = message.editedTimestamp;
    this.embeds = message.embeds;
    this.guild = message.guild.id;
    this.id = message.id;
    this.mentions = message.mentions;
    this.reactions = message.reactions.cache;
    this.type = message.type;
    this.url = message.url;
  }
}

const { VoiceConnectionStatus, VoiceConnectionDisconnectReason, entersState, AudioPlayerStatus, createAudioResource } = require(`@discordjs/voice`);

class Track {
  constructor(obj) {
    this.url = obj.url;
    this.title = obj.title;
    this.artists = obj.artists;
    this.type = obj.type;
    this.thumbnail = obj.thumbnail;
    this.duration = obj.duration;
    this.id = obj.id;
    this.format_duration = durationString(parseMS(this.duration));
  }

  async youtube_link() {
    if (this.type == `youtube`) return this.url;
    let search = await Youtube.searchOne(`${this.artists[0].name} - ${this.title} Audio`)
    return search.url;
  }

  /**
   * 
   * @returns {VoiceDiscord.AudioResource}
   */
  async createAudioResource() {
    let url;
    this.type == `youtube` ? url = this.url : url = await this.youtube_link();
    let stream = ytdl(url, {
      filter: `audioonly`
    }).on(`error`, err => { console.log(`this`); console.log(err) })
    let resource = createAudioResource(stream, {
      inlineVolume: true,
      metadata: this
    })
    return resource;
  }

}

class Artist {
  constructor(obj) {
    this.name = obj.name;
    this.id = obj.id;
    this.channel = obj.channel;
    this.platform = obj.platform;
  }
}

module.exports = { allIntents, Construct, BetterArr, Util, parseMS, durationString, CompressedMessage }